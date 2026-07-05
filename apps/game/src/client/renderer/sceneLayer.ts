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
import { addAlignmentDebugOverlay, buildingRenderPoint } from "./overlayLayer";

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

  for (const building of [...snapshot.buildings].sort(compareBuildingsForDraw)) {
    addBuildingSprite(unitLayer, building, assets, camera.zoom);
  }

  for (const decoration of snapshot.map.decorations) {
    if (occupiedCells.has(`${decoration.position.x},${decoration.position.y}`)) {
      continue;
    }
    if (!isVisibleCell(decoration.position, camera, screenWidth, screenHeight)) {
      continue;
    }
    addDecorationSprite(unitLayer, decoration, assets, camera.zoom);
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

function compareBuildingsForDraw(a: BuildingSnapshot, b: BuildingSnapshot): number {
  const ay = buildingRenderPoint(a).y;
  const by = buildingRenderPoint(b).y;
  if (ay !== by) {
    return ay - by;
  }
  return a.id.localeCompare(b.id);
}
