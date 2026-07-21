// Simulation-grid ↔ Three.js world coordinate adapters (trial 3D renderer).
//
// The simulation is authoritative: cells are integer (x, y) in a right-handed
// grid where +x = east, +y = south (matches the 2D isometric layer). The 3D
// scene maps that grid onto the ground plane at y = 0 in Three.js world
// space, where:
//
//   worldX = cell.x * CELL_SIZE      // east
//   worldZ = cell.y * CELL_SIZE      // south (Three.js +Z is toward viewer)
//   worldY = elevation * ELEVATION_HEIGHT   // up
//
// Three.js vectors NEVER leak back into simulation state — always convert
// through these helpers so the sim stays renderer-agnostic.

import type { CellCoord } from "@asama/shared";

/** Cells are rendered as unit squares; CELL_SIZE also acts as the trial world
 *  unit. 1 world unit ≈ 1 cell keeps the math legible. */
export const CELL_SIZE = 1;

/** One elevation level in world-Y. Sits at ~30% of a cell width so a 2-level
 *  bailey reads clearly under the fixed oblique camera without dwarfing 2D
 *  billboards. Matches the visual weight of the 2D renderer's 24 px/level. */
export const ELEVATION_HEIGHT = 0.3;

export interface ThreeWorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FractionalCell {
  readonly x: number;
  readonly y: number;
}

export function cellToThreeWorld(cell: FractionalCell, elevation = 0): ThreeWorldPoint {
  return {
    x: cell.x * CELL_SIZE,
    y: elevation * ELEVATION_HEIGHT,
    z: cell.y * CELL_SIZE
  };
}

/** Center of the cell (grid cells are 1x1 in world units, aligned so that
 *  integer (cx, cy) is the cell's own anchor). Billboards should stand on the
 *  cell center, so shift by half a cell. */
export function cellCenterToThreeWorld(cell: CellCoord, elevation = 0): ThreeWorldPoint {
  return {
    x: (cell.x + 0.5) * CELL_SIZE,
    y: elevation * ELEVATION_HEIGHT,
    z: (cell.y + 0.5) * CELL_SIZE
  };
}

/** Convert a Three.js ground-plane point back to a fractional cell. The
 *  caller decides whether to floor (cell containment) or round (nearest
 *  cell anchor). */
export function threeWorldToCellFloat(worldX: number, worldZ: number): FractionalCell {
  return {
    x: worldX / CELL_SIZE,
    y: worldZ / CELL_SIZE
  };
}

export function threeWorldToCell(worldX: number, worldZ: number): CellCoord {
  return {
    x: Math.floor(worldX / CELL_SIZE),
    y: Math.floor(worldZ / CELL_SIZE)
  };
}

/** Building anchor cell → Three.js world point. Buildings occupy a rectangle
 *  starting at `position`; the 3D renderer draws their billboard at the
 *  footprint's center so it visually straddles the whole footprint. */
export function buildingAnchorToThreeWorld(
  position: CellCoord,
  footprintWidth: number,
  footprintHeight: number,
  elevation = 0
): ThreeWorldPoint {
  return {
    x: (position.x + footprintWidth / 2) * CELL_SIZE,
    y: elevation * ELEVATION_HEIGHT,
    z: (position.y + footprintHeight / 2) * CELL_SIZE
  };
}
