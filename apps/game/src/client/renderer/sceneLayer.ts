import { Container, Graphics, Sprite } from "pixi.js";
import type { BuildingSnapshot, CellCoord, MapDecoration, UnitSnapshot, WorldSnapshot } from "@asama/shared";
import { clearLayer, createSprite, createSpriteFromCandidates, type LoadedAsset } from "./assets";
import {
  cellToWorld,
  clamp,
  isVisibleCell,
  roundWorldPixel,
  type CameraState,
  UNIT_GROUND_OFFSET_Y
} from "./camera";
import { buildingAssetCandidates } from "./gameRules";
import { addAlignmentDebugOverlay } from "./overlayLayer";
import { buildingRenderPoint, isoBehind } from "./renderGeometry";
import type { FootprintRect } from "./renderGeometry";

export function drawSceneLayer(
  unitLayer: Container,
  snapshot: WorldSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  camera: CameraState,
  screenWidth: number,
  screenHeight: number,
  debugOverlayVisible: boolean
): void {
  clearLayer(unitLayer);

  // Cells covered by intact buildings hide their decorations.
  const occupiedCells = new Set<string>();
  for (const building of snapshot.buildings) {
    if (building.lifecycleState !== "intact") {
      continue;
    }
    for (const cell of building.footprint) {
      occupiedCells.add(`${cell.x},${cell.y}`);
    }
  }

  // Merge buildings and decorations into a single Y-sorted list so decorations
  // participate in the same painter's-order as buildings (fixes trees rendering
  // on top of tenshu/honmaru regardless of their Y position).
  const sceneItems: SceneItemForSort[] = [];
  for (const building of snapshot.buildings) {
    sceneItems.push({ kind: "building", item: building });
  }
  for (const decoration of snapshot.map.decorations) {
    if (occupiedCells.has(`${decoration.position.x},${decoration.position.y}`)) {
      continue;
    }
    if (!isVisibleCell(decoration.position, camera, screenWidth, screenHeight)) {
      continue;
    }
    sceneItems.push({ kind: "decoration", item: decoration });
  }
  isoSort(sceneItems);

  for (const entry of sceneItems) {
    if (entry.kind === "building") {
      addBuildingSprite(unitLayer, entry.item, assets, camera.zoom);
    } else {
      addDecorationSprite(unitLayer, entry.item, assets, camera.zoom);
    }
  }

  for (const unit of [...snapshot.units].sort(compareUnitsForDraw)) {
    addUnitSprite(unitLayer, unit, assets, camera.zoom);
  }

  if (debugOverlayVisible) {
    addAlignmentDebugOverlay(unitLayer, snapshot, camera, screenWidth, screenHeight, assets);
  }
}

export function findUnitAtScreenPoint(
  point: CellCoord,
  snapshot: WorldSnapshot | null,
  camera: CameraState
): UnitSnapshot | null {
  if (snapshot === null) {
    return null;
  }

  let nearest: UnitSnapshot | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const hitRadius = 30 * camera.zoom;

  for (const unit of snapshot.units) {
    const unitPoint = unitScreenPoint(unit, camera);
    const distance = Math.hypot(point.x - unitPoint.x, point.y - unitPoint.y);
    if (distance <= hitRadius && distance < nearestDistance) {
      nearest = unit;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function unitScreenPoint(unit: UnitSnapshot, camera: CameraState): CellCoord {
  const point = cellToWorld(unit.position);
  return {
    x: camera.x + point.x * camera.zoom,
    y: camera.y + (point.y + UNIT_GROUND_OFFSET_Y) * camera.zoom
  };
}

function addBuildingSprite(
  layer: Container,
  building: BuildingSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  zoom: number
): void {
  const sprite = createSpriteFromCandidates(buildingAssetCandidates(building), assets);
  const point = buildingRenderPoint(building);
  sprite.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y, zoom));
  if (building.owner === "enemy") {
    sprite.tint = 0xffaaa0;
  }
  layer.addChild(sprite);

  if (building.ladderHp !== null) {
    const ladderAsset = assets.get("building.wall.ladder.attached");
    if (ladderAsset !== undefined) {
      const ladder = new Sprite(ladderAsset.texture);
      ladder.anchor.set(ladderAsset.anchor.x, ladderAsset.anchor.y);
      ladder.position.set(sprite.position.x, sprite.position.y);
      layer.addChild(ladder);
    }
  }
}

function addUnitSprite(
  layer: Container,
  unit: UnitSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  zoom: number
): void {
  if (unit.selected) {
    const ring = createSprite("overlay.unit.selection-ring", assets);
    const ringPoint = cellToWorld(unit.position);
    ring.position.set(roundWorldPixel(ringPoint.x, zoom), roundWorldPixel(ringPoint.y, zoom));
    layer.addChild(ring);
  }

  const sprite = createSprite(unit.assetId, assets);
  const point = cellToWorld(unit.position);
  sprite.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y + UNIT_GROUND_OFFSET_Y, zoom));
  if (unit.owner === "enemy") {
    sprite.tint = 0xff9f8f;
  }
  layer.addChild(sprite);

  addUnitHealthBar(layer, unit, point, zoom);
}

function addUnitHealthBar(layer: Container, unit: UnitSnapshot, point: CellCoord, zoom: number): void {
  if (unit.hp >= unit.maxHp) {
    return;
  }

  const width = 28;
  const height = 4;
  const ratio = clamp(unit.hp / unit.maxHp, 0, 1);
  const bar = new Graphics();
  bar.rect(-width / 2, -46, width, height).fill({ color: 0x211d18, alpha: 0.9 });
  bar.rect(-width / 2 + 1, -45, (width - 2) * ratio, height - 2).fill({
    color: unit.owner === "enemy" ? 0xd85a4a : 0x58d99a,
    alpha: 0.95
  });
  bar.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y + UNIT_GROUND_OFFSET_Y, zoom));
  layer.addChild(bar);
}

function addDecorationSprite(
  layer: Container,
  decoration: MapDecoration,
  assets: ReadonlyMap<string, LoadedAsset>,
  zoom: number
): void {
  const asset = assets.get(decoration.assetId);
  if (asset === undefined) {
    return;
  }
  const sprite = new Sprite(asset.texture);
  sprite.anchor.set(asset.anchor.x, asset.anchor.y);
  const point = cellToWorld(decoration.position);
  sprite.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y, zoom));
  layer.addChild(sprite);
}

function compareUnitsForDraw(a: UnitSnapshot, b: UnitSnapshot): number {
  const ay = cellToWorld(a.position).y + UNIT_GROUND_OFFSET_Y;
  const by = cellToWorld(b.position).y + UNIT_GROUND_OFFSET_Y;
  if (ay !== by) {
    return ay - by;
  }
  return a.id.localeCompare(b.id);
}

type SceneItemForSort =
  | { readonly kind: "building"; readonly item: BuildingSnapshot }
  | { readonly kind: "decoration"; readonly item: MapDecoration };

function sceneItemId(entry: SceneItemForSort): string {
  return entry.kind === "building" ? entry.item.id : `dec:${entry.item.position.x},${entry.item.position.y}`;
}

function sceneItemRect(entry: SceneItemForSort): FootprintRect {
  if (entry.kind === "building") {
    const fp = entry.item.footprint;
    if (fp.length === 0) {
      const { x, y } = entry.item.position;
      return { minX: x, maxX: x, minY: y, maxY: y };
    }
    let minX = fp[0]!.x, maxX = fp[0]!.x, minY = fp[0]!.y, maxY = fp[0]!.y;
    for (let i = 1; i < fp.length; i++) {
      const c = fp[i]!;
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
    return { minX, maxX, minY, maxY };
  }
  const { x, y } = entry.item.position;
  return { minX: x, maxX: x, minY: y, maxY: y };
}

// Isometric painter's sort for scene items (buildings + decorations).
// Step 1: primary sort by south-corner depth (maxX+maxY) — a good approximation
//   but non-transitive for separated footprints (e.g. 1x1 wall to the NE of a
//   large building, or a tree south of an 8x8 tenshu).
// Step 2: a few bubble passes that swap adjacent pairs only when the footprint
//   separation test definitively says they are in the wrong order.
function isoSort(items: SceneItemForSort[]): void {
  items.sort((a, b) => {
    const ra = sceneItemRect(a);
    const rb = sceneItemRect(b);
    const diff = (ra.maxX + ra.maxY) - (rb.maxX + rb.maxY);
    if (diff !== 0) return diff;
    return sceneItemId(a).localeCompare(sceneItemId(b));
  });

  const PASSES = 3;
  for (let pass = 0; pass < PASSES; pass++) {
    let swapped = false;
    for (let i = 0; i < items.length - 1; i++) {
      const ra = sceneItemRect(items[i]!);
      const rb = sceneItemRect(items[i + 1]!);
      // items[i+1] is provably behind items[i] AND not in a mutual/diagonal relationship
      // (both separated in opposing axes → depth fallback keeps primary-sort order).
      if (isoBehind(rb, ra) && !isoBehind(ra, rb)) {
        const tmp = items[i]!;
        items[i] = items[i + 1]!;
        items[i + 1] = tmp;
        swapped = true;
      }
    }
    if (!swapped) break;
  }
}
