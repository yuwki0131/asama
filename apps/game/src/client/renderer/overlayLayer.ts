import { Container, Graphics } from "pixi.js";
import type { BuildingSnapshot, BuildingType, CellCoord, UnitSnapshot, WorldSnapshot } from "@asama/shared";
import { createSprite, firstLoadedAsset, type LoadedAsset } from "./assets";
import {
  cellToWorld,
  gridCornerToWorld,
  isVisibleCell,
  TILE_HEIGHT,
  TILE_WIDTH,
  type CameraState
} from "./camera";
import {
  buildingAssetCandidates,
  buildingPreviewFootprint,
  canPreviewPlaceBuildingCell,
  findBuildingAtCell,
  isInsideSnapshotMap
} from "./gameRules";
import { buildingRenderPoint } from "./renderGeometry";
import type { ToolMode } from "./GameCanvas";

export function addPathSprites(layer: Container, unit: UnitSnapshot, assets: ReadonlyMap<string, LoadedAsset>): void {
  if (!unit.selected) {
    return;
  }

  for (const step of unit.path) {
    addOverlaySprite(layer, step, "overlay.path.step", assets);
  }

  if (unit.destination !== null) {
    addOverlaySprite(layer, unit.destination, "overlay.move.destination", assets);
  }
}

export function addOverlaySprite(
  layer: Container,
  cell: CellCoord,
  assetId: string,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const sprite = createSprite(assetId, assets);
  sprite.position.copyFrom(cellToWorld(cell));
  layer.addChild(sprite);
}

export function addCellActionPreview(
  layer: Container,
  cell: CellCoord,
  snapshot: WorldSnapshot,
  buildTool: ToolMode,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  if (buildTool === null) {
    addOverlaySprite(layer, cell, "overlay.cell.selected", assets);
    return;
  }

  if (buildTool === "ladder" || buildTool === "fillMoat") {
    addOverlaySprite(layer, cell, "overlay.cell.selected", assets);
    return;
  }

  if (buildTool === "demolish") {
    const hasBuilding = findBuildingAtCell(cell, snapshot) !== null;
    addOverlaySprite(layer, cell, hasBuilding ? "overlay.demolish.target" : "overlay.build.invalid", assets);
    return;
  }

  const footprint = buildingPreviewFootprint(buildTool, cell);
  const canPlace = footprint.every((footprintCell) => canPreviewPlaceBuildingCell(snapshot, footprintCell, buildTool));
  for (const footprintCell of footprint) {
    if (isInsideSnapshotMap(footprintCell, snapshot)) {
      addOverlaySprite(layer, footprintCell, canPlace ? "overlay.build.valid" : "overlay.build.invalid", assets);
    }
  }
}

export function addAlignmentDebugOverlay(
  layer: Container,
  snapshot: WorldSnapshot,
  camera: CameraState,
  screenWidth: number,
  screenHeight: number,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const grid = new Graphics();
  for (const cell of snapshot.map.cells) {
    if (isVisibleCell(cell.coord, camera, screenWidth, screenHeight)) {
      drawCellDiamond(grid, cell.coord, 0x65c8ff, 0.18);
    }
  }

  for (const building of snapshot.buildings) {
    drawFootprintDiamond(grid, building.footprint, 0xffd166, 0.85);
    const anchor = buildingRenderPoint(building);
    drawCrosshair(grid, anchor, 0xff3b30);
    drawSpriteBounds(grid, building, assets);
  }

  layer.addChild(grid);
}

function footprintBounds(footprint: readonly CellCoord[]) {
  return footprint.reduce(
    (b, cell) => ({
      minX: Math.min(b.minX, cell.x),
      maxX: Math.max(b.maxX, cell.x),
      minY: Math.min(b.minY, cell.y),
      maxY: Math.max(b.maxY, cell.y)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
}

function footprintDiamondPoints(footprint: readonly CellCoord[]): readonly CellCoord[] {
  const bounds = footprintBounds(footprint);
  return [
    gridCornerToWorld({ x: bounds.minX, y: bounds.minY }),
    gridCornerToWorld({ x: bounds.maxX + 1, y: bounds.minY }),
    gridCornerToWorld({ x: bounds.maxX + 1, y: bounds.maxY + 1 }),
    gridCornerToWorld({ x: bounds.minX, y: bounds.maxY + 1 })
  ];
}

function drawCellDiamond(graphics: Graphics, cell: CellCoord, color: number, alpha: number): void {
  const point = cellToWorld(cell);
  graphics
    .poly([
      point.x,
      point.y - TILE_HEIGHT / 2,
      point.x + TILE_WIDTH / 2,
      point.y,
      point.x,
      point.y + TILE_HEIGHT / 2,
      point.x - TILE_WIDTH / 2,
      point.y
    ])
    .stroke({ color, alpha, width: 1 });
}

function drawFootprintDiamond(graphics: Graphics, footprint: readonly CellCoord[], color: number, alpha: number): void {
  const points = footprintDiamondPoints(footprint);
  graphics
    .poly(points.flatMap((point) => [point.x, point.y]))
    .stroke({ color, alpha, width: 2 });
}

function drawCrosshair(graphics: Graphics, point: CellCoord, color: number): void {
  graphics
    .moveTo(point.x - 6, point.y)
    .lineTo(point.x + 6, point.y)
    .moveTo(point.x, point.y - 6)
    .lineTo(point.x, point.y + 6)
    .stroke({ color, alpha: 0.95, width: 1.5 });
}

function drawSpriteBounds(
  graphics: Graphics,
  building: BuildingSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const spriteAsset = firstLoadedAsset(buildingAssetCandidates(building), assets);
  if (spriteAsset === null) {
    return;
  }

  const point = buildingRenderPoint(building);
  const width = spriteAsset.texture.width;
  const height = spriteAsset.texture.height;
  const left = point.x - width * spriteAsset.anchor.x;
  const top = point.y - height * spriteAsset.anchor.y;
  graphics.rect(left, top, width, height).stroke({ color: 0xff4fd8, alpha: 0.65, width: 1 });
}
