// Per-cell 3D geometry generated from WorldSnapshot buildings.
//
// The 2D renderer paints wall/fence/moat/road as tile sprites; the 3D
// renderer needs actual geometry per cell so the scene reads as solid.
// One BufferGeometry per building type (walls merged, fences merged, etc.)
// keeps the draw-call count fixed regardless of how many cells the
// scenario has.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial
} from "three";
import type { BuildingSnapshot } from "@asama/shared";
import { CELL_SIZE, ELEVATION_HEIGHT } from "./coord";

// --- Palette ---------------------------------------------------------------

const PLASTER_BODY = new Color(0xefe6d3);
const PLASTER_ROOF = new Color(0x3a2f26);
const HAZAMA_ACCENT = new Color(0x5c4633);
const FENCE_POST = new Color(0x6b4a2b);
const FENCE_RAIL = new Color(0x8b6a45);
const DRY_MOAT_FLOOR = new Color(0x6b533a);
const DRY_MOAT_BANK = new Color(0x8b7554);
const WATER_SURFACE = new Color(0x3a70a0);
const WATER_FLOOR = new Color(0x1c3a4f);
const ROAD_COLOR = new Color(0xb8a882);
const BRIDGE_DECK = new Color(0x8a6a3f);
const HONMARU_MARKER = new Color(0xd7c268);
const FARM_COLOR = new Color(0xa8965a);
const TENSHU_BASE = new Color(0x6b6260);

// --- Helpers ---------------------------------------------------------------

interface Mesher {
  positions: number[];
  colors: number[];
  indices: number[];
  vertexOffset: number;
}

function newMesher(): Mesher {
  return { positions: [], colors: [], indices: [], vertexOffset: 0 };
}

function pushBox(
  m: Mesher,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: Color,
  topColor?: Color
): void {
  const t = topColor ?? color;
  const b = m.vertexOffset;
  // 8 corners: 0-3 bottom (y0), 4-7 top (y1). CCW from top.
  m.positions.push(
    x0, y0, z0,
    x1, y0, z0,
    x1, y0, z1,
    x0, y0, z1,
    x0, y1, z0,
    x1, y1, z0,
    x1, y1, z1,
    x0, y1, z1
  );
  const rgb = (c: Color) => [c.r, c.g, c.b];
  const bottom = rgb(color);
  const top = rgb(t);
  // 8 vertex colors (interpolate top vs bottom).
  for (let i = 0; i < 4; i += 1) m.colors.push(...bottom);
  for (let i = 0; i < 4; i += 1) m.colors.push(...top);
  // Faces (12 tris).
  // top (y1)
  m.indices.push(b + 4, b + 5, b + 6, b + 4, b + 6, b + 7);
  // bottom (y0)
  m.indices.push(b + 0, b + 2, b + 1, b + 0, b + 3, b + 2);
  // +z
  m.indices.push(b + 3, b + 6, b + 2, b + 3, b + 7, b + 6);
  // -z
  m.indices.push(b + 0, b + 1, b + 5, b + 0, b + 5, b + 4);
  // +x
  m.indices.push(b + 1, b + 2, b + 6, b + 1, b + 6, b + 5);
  // -x
  m.indices.push(b + 0, b + 4, b + 7, b + 0, b + 7, b + 3);
  m.vertexOffset += 8;
}

function pushQuad(
  m: Mesher,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
  color: Color
): void {
  const b0 = m.vertexOffset;
  m.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
  const rgb = [color.r, color.g, color.b];
  for (let i = 0; i < 4; i += 1) m.colors.push(...rgb);
  m.indices.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  m.vertexOffset += 4;
}

function meshFrom(m: Mesher, material: MeshStandardMaterial): Mesh | null {
  if (m.vertexOffset === 0) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(m.positions), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(m.colors), 3));
  g.setIndex(m.indices);
  g.computeVertexNormals();
  return new Mesh(g, material);
}

// --- Building-type generators ---------------------------------------------

/** Wall / hazama_wall / gate wide cells. Each cell = white plaster block with
 *  dark roof cap. Adjacent same-type cells are already touching so the run
 *  reads as continuous. Height ≈ 1 elevation unit above the cell's base. */
function addWallCell(m: Mesher, b: BuildingSnapshot, accent: boolean): void {
  const cx = b.position.x;
  const cy = b.position.y;
  const baseY = (b.elevation ?? 0) * ELEVATION_HEIGHT;
  const bodyH = 0.9 * ELEVATION_HEIGHT;
  const capH = 0.25 * ELEVATION_HEIGHT;
  const inset = 0.05 * CELL_SIZE; // small gap so seams are readable
  const x0 = cx * CELL_SIZE + inset;
  const x1 = (cx + 1) * CELL_SIZE - inset;
  const z0 = cy * CELL_SIZE + inset;
  const z1 = (cy + 1) * CELL_SIZE - inset;
  // body
  pushBox(m, x0, x1, baseY, baseY + bodyH, z0, z1, PLASTER_BODY, PLASTER_BODY);
  // cap
  const capOverhang = 0.03 * CELL_SIZE;
  pushBox(
    m,
    x0 - capOverhang,
    x1 + capOverhang,
    baseY + bodyH,
    baseY + bodyH + capH,
    z0 - capOverhang,
    z1 + capOverhang,
    accent ? HAZAMA_ACCENT : PLASTER_ROOF,
    PLASTER_ROOF
  );
}

/** Fence cell: two vertical posts + a horizontal rail. */
function addFenceCell(m: Mesher, b: BuildingSnapshot): void {
  const cx = b.position.x;
  const cy = b.position.y;
  const baseY = (b.elevation ?? 0) * ELEVATION_HEIGHT;
  const postH = 0.55 * ELEVATION_HEIGHT;
  const postT = 0.08 * CELL_SIZE;
  // Two posts along the cell center in the diagonal direction of the run.
  // Simplest: 2 posts across the cell (one on each side of center).
  const c1x = cx * CELL_SIZE + 0.25 * CELL_SIZE;
  const c2x = (cx + 1) * CELL_SIZE - 0.25 * CELL_SIZE;
  const zM = (cy + 0.5) * CELL_SIZE;
  pushBox(m, c1x - postT / 2, c1x + postT / 2, baseY, baseY + postH, zM - postT / 2, zM + postT / 2, FENCE_POST);
  pushBox(m, c2x - postT / 2, c2x + postT / 2, baseY, baseY + postH, zM - postT / 2, zM + postT / 2, FENCE_POST);
  // Horizontal rail between the two posts.
  pushBox(
    m,
    c1x - postT / 2,
    c2x + postT / 2,
    baseY + postH - postT,
    baseY + postH,
    zM - postT / 3,
    zM + postT / 3,
    FENCE_RAIL
  );
}

/** Dry moat cell: sunken trench with sloped banks. */
function addDryMoatCell(m: Mesher, b: BuildingSnapshot): void {
  const cx = b.position.x;
  const cy = b.position.y;
  const baseY = (b.elevation ?? 0) * ELEVATION_HEIGHT;
  const depth = 0.6 * ELEVATION_HEIGHT;
  const x0 = cx * CELL_SIZE;
  const x1 = (cx + 1) * CELL_SIZE;
  const z0 = cy * CELL_SIZE;
  const z1 = (cy + 1) * CELL_SIZE;
  const inset = 0.25 * CELL_SIZE;
  // Floor
  pushQuad(
    m,
    x0 + inset, baseY - depth, z0 + inset,
    x1 - inset, baseY - depth, z0 + inset,
    x1 - inset, baseY - depth, z1 - inset,
    x0 + inset, baseY - depth, z1 - inset,
    DRY_MOAT_FLOOR
  );
  // Four sloping banks (quads from ground rim → floor edge)
  // south bank (z = z1)
  pushQuad(m, x0, baseY, z1, x0 + inset, baseY - depth, z1 - inset, x1 - inset, baseY - depth, z1 - inset, x1, baseY, z1, DRY_MOAT_BANK);
  // north bank (z = z0)
  pushQuad(m, x1, baseY, z0, x1 - inset, baseY - depth, z0 + inset, x0 + inset, baseY - depth, z0 + inset, x0, baseY, z0, DRY_MOAT_BANK);
  // east bank (x = x1)
  pushQuad(m, x1, baseY, z1, x1 - inset, baseY - depth, z1 - inset, x1 - inset, baseY - depth, z0 + inset, x1, baseY, z0, DRY_MOAT_BANK);
  // west bank (x = x0)
  pushQuad(m, x0, baseY, z0, x0 + inset, baseY - depth, z0 + inset, x0 + inset, baseY - depth, z1 - inset, x0, baseY, z1, DRY_MOAT_BANK);
}

/** Water moat cell: trench + translucent water surface. */
function addWaterMoatCell(m: Mesher, waterM: Mesher, b: BuildingSnapshot): void {
  const cx = b.position.x;
  const cy = b.position.y;
  const baseY = (b.elevation ?? 0) * ELEVATION_HEIGHT;
  const depth = 0.7 * ELEVATION_HEIGHT;
  const x0 = cx * CELL_SIZE;
  const x1 = (cx + 1) * CELL_SIZE;
  const z0 = cy * CELL_SIZE;
  const z1 = (cy + 1) * CELL_SIZE;
  const inset = 0.15 * CELL_SIZE;
  // Trench (opaque floor + banks) using darker colors.
  pushQuad(
    m,
    x0 + inset, baseY - depth, z0 + inset,
    x1 - inset, baseY - depth, z0 + inset,
    x1 - inset, baseY - depth, z1 - inset,
    x0 + inset, baseY - depth, z1 - inset,
    WATER_FLOOR
  );
  pushQuad(m, x0, baseY, z1, x0 + inset, baseY - depth, z1 - inset, x1 - inset, baseY - depth, z1 - inset, x1, baseY, z1, WATER_FLOOR.clone().lerp(DRY_MOAT_BANK, 0.5));
  pushQuad(m, x1, baseY, z0, x1 - inset, baseY - depth, z0 + inset, x0 + inset, baseY - depth, z0 + inset, x0, baseY, z0, WATER_FLOOR.clone().lerp(DRY_MOAT_BANK, 0.5));
  pushQuad(m, x1, baseY, z1, x1 - inset, baseY - depth, z1 - inset, x1 - inset, baseY - depth, z0 + inset, x1, baseY, z0, WATER_FLOOR.clone().lerp(DRY_MOAT_BANK, 0.5));
  pushQuad(m, x0, baseY, z0, x0 + inset, baseY - depth, z0 + inset, x0 + inset, baseY - depth, z1 - inset, x0, baseY, z1, WATER_FLOOR.clone().lerp(DRY_MOAT_BANK, 0.5));
  // Water surface (translucent, separate mesh).
  const surfaceY = baseY - 0.05;
  pushQuad(
    waterM,
    x0, surfaceY, z0,
    x1, surfaceY, z0,
    x1, surfaceY, z1,
    x0, surfaceY, z1,
    WATER_SURFACE
  );
}

/** Road / bridge / farm / honmaru: flat colored patch just above the ground. */
function addFlatPatch(m: Mesher, b: BuildingSnapshot, color: Color, lift = 0.008): void {
  const cx = b.position.x;
  const cy = b.position.y;
  const baseY = (b.elevation ?? 0) * ELEVATION_HEIGHT + lift;
  const x0 = cx * CELL_SIZE;
  const x1 = (cx + 1) * CELL_SIZE;
  const z0 = cy * CELL_SIZE;
  const z1 = (cy + 1) * CELL_SIZE;
  pushQuad(m, x0, baseY, z0, x1, baseY, z0, x1, baseY, z1, x0, baseY, z1, color);
}

/** Tenshu / honmaru placeholder: extruded stone base under the sprite. */
function addStoneBase(m: Mesher, b: BuildingSnapshot, footW: number, footH: number, heightUnits: number): void {
  const baseY = (b.elevation ?? 0) * ELEVATION_HEIGHT;
  const x0 = b.position.x * CELL_SIZE;
  const x1 = (b.position.x + footW) * CELL_SIZE;
  const z0 = b.position.y * CELL_SIZE;
  const z1 = (b.position.y + footH) * CELL_SIZE;
  pushBox(m, x0, x1, baseY, baseY + heightUnits * ELEVATION_HEIGHT, z0, z1, TENSHU_BASE);
}

// --- Public API ------------------------------------------------------------

export interface BuildingGeometryLayer {
  readonly group: Group;
  dispose(): void;
}

/** Build all opaque + translucent meshes from a snapshot in one pass. */
export function createBuildingGeometryLayer(
  buildings: readonly BuildingSnapshot[]
): BuildingGeometryLayer {
  const group = new Group();
  group.name = "building-geometry";

  const wallM = newMesher();
  const fenceM = newMesher();
  const moatM = newMesher();
  const waterSurfaceM = newMesher();
  const roadM = newMesher();
  const stoneBaseM = newMesher();

  for (const b of buildings) {
    if (b.lifecycleState !== "intact") continue;
    switch (b.type) {
      case "wall":
        addWallCell(wallM, b, false);
        break;
      case "hazama_wall":
        addWallCell(wallM, b, true);
        break;
      case "fence":
        addFenceCell(fenceM, b);
        break;
      case "dry_moat":
        addDryMoatCell(moatM, b);
        break;
      case "water_moat":
        addWaterMoatCell(moatM, waterSurfaceM, b);
        break;
      case "road":
        addFlatPatch(roadM, b, ROAD_COLOR);
        break;
      case "earth_bridge":
      case "wood_bridge":
        addFlatPatch(roadM, b, BRIDGE_DECK, 0.02);
        break;
      case "farm":
        addFlatPatch(roadM, b, FARM_COLOR);
        break;
      case "honmaru":
        addFlatPatch(roadM, b, HONMARU_MARKER, 0.015);
        break;
      case "tenshu":
        addStoneBase(stoneBaseM, b, 4, 4, 0.6);
        break;
      // Non-geometric building types (yagura/storehouse/etc) are handled by
      // the 2D billboard layer.
      default:
        break;
    }
  }

  const opaqueMat = () =>
    new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      side: DoubleSide
    });
  const waterMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.35,
    metalness: 0.05,
    transparent: true,
    opacity: 0.85,
    side: DoubleSide
  });

  const wallMesh = meshFrom(wallM, opaqueMat());
  if (wallMesh !== null) group.add(wallMesh);
  const fenceMesh = meshFrom(fenceM, opaqueMat());
  if (fenceMesh !== null) group.add(fenceMesh);
  const moatMesh = meshFrom(moatM, opaqueMat());
  if (moatMesh !== null) group.add(moatMesh);
  const roadMesh = meshFrom(roadM, opaqueMat());
  if (roadMesh !== null) group.add(roadMesh);
  const stoneMesh = meshFrom(stoneBaseM, opaqueMat());
  if (stoneMesh !== null) group.add(stoneMesh);
  const waterMesh = meshFrom(waterSurfaceM, waterMat);
  if (waterMesh !== null) {
    waterMesh.renderOrder = 1;
    group.add(waterMesh);
  }

  return {
    group,
    dispose() {
      group.traverse((obj) => {
        if (obj instanceof Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            for (const mtl of obj.material) mtl.dispose();
          } else {
            obj.material.dispose();
          }
        }
      });
      group.clear();
    }
  };
}
