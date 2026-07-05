import type { BuildingSnapshot, CellCoord, MapDecoration } from "@asama/shared";
import { cellToWorld, gridCornerToWorld } from "./camera";
import { isCenterAnchoredBuilding } from "./gameRules";

export function buildingRenderPoint(building: BuildingSnapshot): CellCoord {
  if (building.footprint.length === 0) {
    return cellToWorld(building.position);
  }

  if (!isCenterAnchoredBuilding(building.type)) {
    return footprintSouthWorld(building.footprint);
  }

  return footprintCenterWorld(building.footprint);
}

export function buildingDrawY(building: BuildingSnapshot): number {
  return buildingRenderPoint(building).y;
}

export function decorationDrawY(decoration: MapDecoration): number {
  return cellToWorld(decoration.position).y;
}

function footprintBounds(footprint: readonly CellCoord[]): {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
} {
  return footprint.reduce(
    (bounds, cell) => ({
      minX: Math.min(bounds.minX, cell.x),
      maxX: Math.max(bounds.maxX, cell.x),
      minY: Math.min(bounds.minY, cell.y),
      maxY: Math.max(bounds.maxY, cell.y)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
  );
}

function footprintCenterWorld(footprint: readonly CellCoord[]): CellCoord {
  const bounds = footprintBounds(footprint);
  return cellToWorld({
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  });
}

function footprintSouthWorld(footprint: readonly CellCoord[]): CellCoord {
  const bounds = footprintBounds(footprint);
  return gridCornerToWorld({ x: bounds.maxX + 1, y: bounds.maxY + 1 });
}
