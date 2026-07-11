import {
  MAX_ELEVATION,
  type CellCoord,
  type ScenarioElevationDefinition,
  type ScenarioSlope,
  type SlopeDirection,
  type SlopeHalf
} from "@asama/shared";
import type { TerrainCellState, UnitState, WorldState } from "./types";

// Elevation rules live in docs/10_development/elevation-contract.md; the
// numbers below are the contract's canonical balance values.
export const ELEVATION_BALANCE = {
  /** Extra A* path cost per uphill step (surface level rises). */
  climbCostPerStep: 2,
  /** Extra sim ticks per uphill step on top of the unit's ticksPerStep. */
  climbExtraTicksPerStep: 3,
  /** Attack range bonus when the attacker stands above the target. */
  highGroundRangeBonus: 1,
  /** Damage multiplier when the attacker stands above the target. */
  highGroundDamageMultiplier: 1.25
} as const;

const SLOPE_VECTORS: Record<SlopeDirection, CellCoord> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 }
};

const OPPOSITE: Record<SlopeDirection, SlopeDirection> = { N: "S", E: "W", S: "N", W: "E" };

export function slopeVector(direction: SlopeDirection): CellCoord {
  return SLOPE_VECTORS[direction];
}

export function oppositeDirection(direction: SlopeDirection): SlopeDirection {
  return OPPOSITE[direction];
}

/** Direction of a single orthogonal step from `from` to `to`, or null. */
export function stepDirection(from: CellCoord, to: CellCoord): SlopeDirection | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1 && dy === 0) return "E";
  if (dx === -1 && dy === 0) return "W";
  if (dx === 0 && dy === 1) return "S";
  if (dx === 0 && dy === -1) return "N";
  return null;
}

/** Surface rise of a slope cell above its base elevation, in levels:
 *  downhill edge at `down`, uphill edge at `up`. 1-cell slope climbs a full
 *  level; gentle 2-cell slope halves climb 0 → 0.5 (lower) / 0.5 → 1 (upper). */
export function slopeRise(cell: Pick<TerrainCellState, "slopeHalf">): { down: number; up: number } {
  if (cell.slopeHalf === "lower") {
    return { down: 0, up: 0.5 };
  }
  if (cell.slopeHalf === "upper") {
    return { down: 0.5, up: 1 };
  }
  return { down: 0, up: 1 };
}

/**
 * Height of the cell's surface at the edge facing `direction`.
 * Flat cell: elevation on every edge. Slope cell: the slope's uphill rise on
 * the uphill edge (`slope`), its downhill rise on the downhill edge, and null
 * (cliff) on the two side edges — slopes are traversable only along their
 * axis. Gentle 2-cell slopes expose half-level (0.5) edge heights where the
 * two halves meet, so traversal chains lower ↔ upper seamlessly.
 */
export function edgeHeight(cell: TerrainCellState, direction: SlopeDirection): number | null {
  if (cell.slope === null) {
    return cell.elevation;
  }
  const rise = slopeRise(cell);
  if (cell.slope === direction) {
    return cell.elevation + rise.up;
  }
  if (cell.slope === OPPOSITE[direction]) {
    return cell.elevation + rise.down;
  }
  return null;
}

/**
 * Edge rule: an orthogonal step between two adjacent cells is allowed only
 * when the surface heights of the two facing edges match. Any mismatch is a
 * cliff (impassable), regardless of the cells' own passability.
 */
export function canTraverseElevation(world: WorldState, from: CellCoord, to: CellCoord): boolean {
  const direction = stepDirection(from, to);
  if (direction === null) {
    return false;
  }
  const cellFrom = cellAt(world, from);
  const cellTo = cellAt(world, to);
  if (cellFrom === null || cellTo === null) {
    return false;
  }
  const exitHeight = edgeHeight(cellFrom, direction);
  const entryHeight = edgeHeight(cellTo, OPPOSITE[direction]);
  return exitHeight !== null && entryHeight !== null && exitHeight === entryHeight;
}

/** Continuous surface level used for climb detection (slope midpoint: +0.5
 *  for a 1-cell slope, +0.25 / +0.75 for gentle 2-cell slope halves). */
export function surfaceLevel(cell: TerrainCellState): number {
  if (cell.slope === null) {
    return cell.elevation;
  }
  const rise = slopeRise(cell);
  return cell.elevation + (rise.down + rise.up) / 2;
}

/** True when stepping from `from` to `to` gains height (uphill step). */
export function isUphillStep(world: WorldState, from: CellCoord, to: CellCoord): boolean {
  const cellFrom = cellAt(world, from);
  const cellTo = cellAt(world, to);
  if (cellFrom === null || cellTo === null) {
    return false;
  }
  return surfaceLevel(cellTo) > surfaceLevel(cellFrom);
}

/** Extra A* cost for the step (0 when flat or downhill). */
export function climbCost(world: WorldState, from: CellCoord, to: CellCoord): number {
  return isUphillStep(world, from, to) ? ELEVATION_BALANCE.climbCostPerStep : 0;
}

/** Combat-effective elevation of a cell (slope counts as its lower level). */
export function elevationAt(world: WorldState, coord: CellCoord): number {
  return cellAt(world, coord)?.elevation ?? 0;
}

/** Sim ticks the unit's next path step takes, including the climb penalty. */
export function stepTicksFor(world: WorldState, unit: UnitState): number {
  const next = unit.path[0];
  if (next === undefined) {
    return unit.ticksPerStep;
  }
  return unit.ticksPerStep + (isUphillStep(world, unit.position, next) ? ELEVATION_BALANCE.climbExtraTicksPerStep : 0);
}

function cellAt(world: WorldState, coord: CellCoord): TerrainCellState | null {
  if (coord.x < 0 || coord.y < 0 || coord.x >= world.map.width || coord.y >= world.map.height) {
    return null;
  }
  return world.map.cells[coord.y * world.map.width + coord.x] ?? null;
}

// --- Scenario elevation application -----------------------------------------

/**
 * Applies a scenario's elevation vocabulary onto a freshly generated map.
 * Patches raise land cells (max-composition; water always stays at level 0),
 * then slopes mark ramp cells. Invalid slope declarations (edges that do not
 * connect the two levels) throw so content errors surface at boot.
 */
export function applyScenarioElevation(map: WorldState["map"], definition: ScenarioElevationDefinition): void {
  for (const patch of definition.patches) {
    const level = Math.max(0, Math.min(MAX_ELEVATION, Math.floor(patch.level)));
    const skin = patch.skin ?? "cliff";
    forEachPatchCell(patch.area, map.width, map.height, (coord) => {
      const index = coord.y * map.width + coord.x;
      const cell = map.cells[index];
      if (cell === undefined || cell.terrain === "water") {
        // Water is only valid at elevation 0 (elevation-contract.md).
        return;
      }
      if (level > cell.elevation) {
        map.cells[index] = { ...cell, elevation: level, elevationSkin: skin };
      } else if (patch.skin !== undefined) {
        map.cells[index] = { ...cell, elevationSkin: skin };
      }
    });
  }

  const slopes = definition.slopes ?? [];
  for (const slope of slopes) {
    for (const { coord, half } of slopeCells(slope)) {
      if (coord.x < 0 || coord.y < 0 || coord.x >= map.width || coord.y >= map.height) {
        throw new Error(`Slope at ${coord.x},${coord.y} is outside the map`);
      }
      const index = coord.y * map.width + coord.x;
      const cell = map.cells[index];
      if (cell === undefined) {
        throw new Error(`Slope at ${coord.x},${coord.y} is outside the map`);
      }
      if (cell.terrain === "water") {
        throw new Error(`Slope at ${coord.x},${coord.y} cannot be placed on water`);
      }
      if (cell.elevation >= MAX_ELEVATION) {
        throw new Error(`Slope at ${coord.x},${coord.y} cannot rise above MAX_ELEVATION`);
      }
      map.cells[index] = { ...cell, slope: slope.toward, ...(half !== undefined ? { slopeHalf: half } : {}) };
    }
  }

  // Slopes are walking ramps: drop decorations (trees, rocks, weeds) that map
  // generation scattered on cells that have just become slopes — a tree
  // standing mid-ramp reads as broken art and hides the slope tile.
  map.decorations = map.decorations.filter((decoration) => {
    const cell = map.cells[decoration.position.y * map.width + decoration.position.x];
    return cell === undefined || cell.slope === null;
  });

  validateSlopes(map);
}

function slopeCells(slope: ScenarioSlope): Array<{ coord: CellCoord; half: SlopeHalf | undefined }> {
  const width = Math.max(1, Math.floor(slope.width ?? 1));
  const gentle = (slope.length ?? 1) === 2;
  const lateral: CellCoord = slope.toward === "N" || slope.toward === "S" ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const uphill = SLOPE_VECTORS[slope.toward];
  const cells: Array<{ coord: CellCoord; half: SlopeHalf | undefined }> = [];
  for (let i = 0; i < width; i += 1) {
    const base = { x: slope.position.x + lateral.x * i, y: slope.position.y + lateral.y * i };
    if (gentle) {
      cells.push({ coord: base, half: "lower" });
      cells.push({ coord: { x: base.x + uphill.x, y: base.y + uphill.y }, half: "upper" });
    } else {
      cells.push({ coord: base, half: undefined });
    }
  }
  return cells;
}

function forEachPatchCell(
  area: ScenarioElevationDefinition["patches"][number]["area"],
  width: number,
  height: number,
  visit: (coord: CellCoord) => void
): void {
  if (area.kind === "rect") {
    const x0 = Math.max(0, area.x);
    const y0 = Math.max(0, area.y);
    const x1 = Math.min(width - 1, area.x + area.width - 1);
    const y1 = Math.min(height - 1, area.y + area.height - 1);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        visit({ x, y });
      }
    }
    return;
  }

  const x0 = Math.max(0, Math.floor(area.cx - area.rx));
  const y0 = Math.max(0, Math.floor(area.cy - area.ry));
  const x1 = Math.min(width - 1, Math.ceil(area.cx + area.rx));
  const y1 = Math.min(height - 1, Math.ceil(area.cy + area.ry));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = (x - area.cx) / area.rx;
      const dy = (y - area.cy) / area.ry;
      if (dx * dx + dy * dy <= 1) {
        visit({ x, y });
      }
    }
  }
}

function validateSlopes(map: WorldState["map"]): void {
  for (const cell of map.cells) {
    if (cell.slope === null) {
      continue;
    }
    const upDir = cell.slope;
    const downDir = OPPOSITE[upDir];
    const upCoord = { x: cell.coord.x + SLOPE_VECTORS[upDir].x, y: cell.coord.y + SLOPE_VECTORS[upDir].y };
    const downCoord = { x: cell.coord.x + SLOPE_VECTORS[downDir].x, y: cell.coord.y + SLOPE_VECTORS[downDir].y };
    const upCell = map.cells[upCoord.y * map.width + upCoord.x];
    const downCell = map.cells[downCoord.y * map.width + downCoord.x];
    const upEdge = upCell !== undefined && insideMap(map, upCoord) ? edgeHeight(upCell, downDir) : null;
    const downEdge = downCell !== undefined && insideMap(map, downCoord) ? edgeHeight(downCell, upDir) : null;
    // The neighbours' facing edges must meet this cell's own edge heights
    // (full levels for 1-cell slopes, half levels where 2-cell halves chain).
    const expectedUp = edgeHeight(cell, upDir);
    const expectedDown = edgeHeight(cell, downDir);
    if (upEdge !== expectedUp) {
      throw new Error(
        `Slope at ${cell.coord.x},${cell.coord.y} toward ${upDir} does not connect to a level-${expectedUp} surface`
      );
    }
    if (downEdge !== expectedDown) {
      throw new Error(
        `Slope at ${cell.coord.x},${cell.coord.y} toward ${upDir} does not connect to a level-${expectedDown} surface at its base`
      );
    }
  }
}

function insideMap(map: WorldState["map"], coord: CellCoord): boolean {
  return coord.x >= 0 && coord.y >= 0 && coord.x < map.width && coord.y < map.height;
}
