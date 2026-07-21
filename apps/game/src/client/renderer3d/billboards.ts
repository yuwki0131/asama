// 2D sprite billboards embedded in the 3D scene.
//
// The camera is fixed, so we do NOT need per-frame camera-facing rotation:
// each billboard is a static plane aligned to the camera's screen plane at
// creation time. That keeps the visual reading identical to the shipped 2D
// renderer while still participating in depth tests against 3D geometry.

import {
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3
} from "three";
import type { BuildingSnapshot, UnitSnapshot } from "@asama/shared";
import { CELL_SIZE, ELEVATION_HEIGHT, buildingAnchorToThreeWorld, cellCenterToThreeWorld } from "./coord";
import type { ThreeAsset, ThreeAssetMap } from "./assets";
import type { BuildingSpec } from "@asama/content";

// Fixed billboard orientation: since the camera never rotates, every sprite
// plane can share the same quaternion. The camera direction (see camera.ts)
// looks from (+1, +1.4, +1) toward the origin — so the plane normal should
// point in that direction. We build the rotation once and reuse it.
const BILLBOARD_QUATERNION = (() => {
  const camDir = new Vector3(1, 1.4, 1).normalize();
  const up = new Vector3(0, 1, 0);
  const m = new Matrix4().lookAt(camDir, new Vector3(0, 0, 0), up);
  return new Quaternion().setFromRotationMatrix(m);
})();

function makeBillboardMesh(asset: ThreeAsset, worldWidth: number): Mesh {
  const aspect = asset.height / Math.max(1, asset.width);
  const worldHeight = worldWidth * aspect;
  const geometry = new PlaneGeometry(worldWidth, worldHeight);
  // The billboard's local origin should coincide with the ground-contact
  // point (anchor.y in the source PNG is 0..1 from the top). Shift geometry
  // so that origin.y equals ground-contact after the plane is tilted.
  const groundOffset = worldHeight * (1 - asset.anchor.y);
  geometry.translate(0, groundOffset, 0);

  const material = new MeshBasicMaterial({
    map: asset.texture,
    transparent: true,
    alphaTest: 0.5,
    // depthWrite matters for stacking billboards against 3D geometry: with
    // alphaTest=0.5 we can safely write depth on opaque pixels.
    depthWrite: true,
    depthTest: true
  });
  const mesh = new Mesh(geometry, material);
  mesh.quaternion.copy(BILLBOARD_QUATERNION);
  return mesh;
}

export interface BillboardLayer {
  readonly group: Group;
  dispose(): void;
}

/** Building types whose visual is handled by procedural 3D geometry in the
 *  trial (`trialFeatures` + `terrainMesh`). We skip their 2D billboards so
 *  the scene doesn't show both a tile sprite and a procedural mesh in the
 *  same place. */
const PROCEDURAL_BUILDING_TYPES = new Set<string>([
  "wall",
  "hazama_wall",
  "fence",
  "dry_moat",
  "water_moat",
  "road",
  "earth_bridge",
  "wood_bridge",
]);

export function createBuildingLayer(
  buildings: readonly BuildingSnapshot[],
  assets: ThreeAssetMap,
  specs: Record<string, BuildingSpec>
): BillboardLayer {
  const group = new Group();
  group.name = "buildings";
  for (const b of buildings) {
    if (b.lifecycleState !== "intact") continue;
    if (PROCEDURAL_BUILDING_TYPES.has(b.type)) continue;
    const spec = specs[b.type];
    if (spec === undefined) continue;
    const asset = pickAssetForBuilding(b, assets);
    if (asset === null) continue;
    const world = buildingAnchorToThreeWorld(
      b.position,
      spec.footprint.width,
      spec.footprint.height,
      b.elevation ?? 0
    );
    const worldWidth = spec.footprint.width * CELL_SIZE * 1.4;
    const mesh = makeBillboardMesh(asset, worldWidth);
    mesh.position.set(world.x, world.y, world.z);
    mesh.userData.buildingId = b.id;
    group.add(mesh);
  }
  return {
    group,
    dispose() {
      disposeGroup(group);
    }
  };
}

function pickAssetForBuilding(
  building: BuildingSnapshot,
  assets: ThreeAssetMap
): ThreeAsset | null {
  // Prefer the exact spec assetId; fall back to a stripped-connection variant.
  const direct = assets.get(building.assetId);
  if (direct !== undefined) return direct;
  // Gate specs point at the "closed.widthN" family; look for the isolated
  // no-neighbor connected variant when the base ID is missing from the map.
  const candidates = [
    `${building.assetId}.connected-0000`
  ];
  for (const key of candidates) {
    const asset = assets.get(key);
    if (asset !== undefined) return asset;
  }
  return null;
}

export function createUnitLayer(
  units: readonly UnitSnapshot[],
  assets: ThreeAssetMap
): BillboardLayer {
  const group = new Group();
  group.name = "units";
  for (const u of units) {
    const asset = pickAssetForUnit(u, assets);
    if (asset === null) continue;
    const world = cellCenterToThreeWorld(u.position, u.elevation ?? 0);
    // Units are drawn at 1.4 cell widths so they read at overview zoom levels
    // (they'd otherwise be lost against the geometry-heavy backdrop).
    const mesh = makeBillboardMesh(asset, 1.4 * CELL_SIZE);
    mesh.position.set(world.x, world.y, world.z);
    mesh.userData.unitId = u.id;
    // Selection outline: tint via renderOrder-adjacent additional plane skipped
    // for the trial; unit selection just uses a small ground disk (added elsewhere).
    if (u.selected) {
      mesh.material = (mesh.material as MeshBasicMaterial).clone();
      (mesh.material as MeshBasicMaterial).color.setRGB(1.3, 1.3, 0.7);
    }
    group.add(mesh);
  }
  return {
    group,
    dispose() {
      disposeGroup(group);
    }
  };
}

function pickAssetForUnit(
  unit: UnitSnapshot,
  assets: ThreeAssetMap
): ThreeAsset | null {
  const direct = assets.get(unit.assetId);
  if (direct !== undefined) return direct;
  // spec assetId already targets ".idle.south". Fall back to a generic idle key.
  const fallbackKey = unit.assetId.replace(/\.\w+\.south$/, ".idle.south");
  return assets.get(fallbackKey) ?? null;
}

function disposeGroup(group: Group): void {
  group.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        for (const m of obj.material) m.dispose();
      } else {
        obj.material.dispose();
      }
    }
  });
  group.clear();
}

/** Ground-plane selection ring for the picked cell. Drawn slightly above the
 *  terrain to avoid z-fighting on the top face. */
export function createSelectionMarker(): { mesh: Mesh; setCell(cell: { x: number; y: number } | null, elevation: number): void } {
  const geometry = new PlaneGeometry(CELL_SIZE * 0.95, CELL_SIZE * 0.95);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    color: 0xffe14a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  const mesh = new Mesh(geometry, material);
  mesh.visible = false;
  return {
    mesh,
    setCell(cell, elevation) {
      if (cell === null) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.set(
        (cell.x + 0.5) * CELL_SIZE,
        elevation * ELEVATION_HEIGHT + 0.005,
        (cell.y + 0.5) * CELL_SIZE
      );
    }
  };
}

