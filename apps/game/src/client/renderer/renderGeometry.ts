import type { BuildingSnapshot, CellCoord, MapDecoration } from "@asama/shared";
import { cellToWorld, gridCornerToWorld } from "./camera";
import { isCenterAnchoredBuilding } from "./gameRules";

export type FootprintRect = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
};

// Returns true if A's footprint is provably further from the viewer than B's:
// A is fully separated to the northeast (lower x) or northwest (lower y) of B.
// Used by the isometric painter's sort in sceneLayer.
export function isoBehind(a: FootprintRect, b: FootprintRect): boolean {
  return a.maxX < b.minX || a.maxY < b.minY;
}

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

export function footprintBounds(footprint: readonly CellCoord[]): FootprintRect {
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
