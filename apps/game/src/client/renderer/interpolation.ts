import { SIM_TICKS_PER_SECOND, type CellCoord } from "@asama/shared";
import { cellToWorld, clamp } from "./camera";

/** Wall-clock milliseconds per simulation tick at 1x speed (50ms at 20 tick/s). */
export const MS_PER_TICK = 1000 / SIM_TICKS_PER_SECOND;

/**
 * Display positions closer than this (world px) to their interpolation target
 * snap directly onto it instead of easing — avoids endless sub-pixel chasing.
 */
export const SNAP_DISTANCE = 0.75;

/**
 * Display positions farther than this (world px) from their target snap
 * immediately: the gap is a teleport (save load, order change), not drift
 * worth smoothing. 96px ≈ 1.5 tile widths.
 */
export const TELEPORT_DISTANCE = 96;

/**
 * Exponential convergence time constant for snapshot-arrival corrections.
 * remaining error = exp(-elapsed/tau): ≈4% left after 100ms.
 */
export const CONVERGE_TAU_MS = 30;

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

/** The subset of UnitSnapshot the interpolator needs. */
export interface MovingUnitLike {
  readonly position: CellCoord;
  readonly path: readonly CellCoord[];
  readonly movementProgress: number;
  readonly ticksPerStep: number;
}

/**
 * Converts wall-clock ms since the last snapshot into simulation ticks at the
 * given game speed. Speed 0 (paused) contributes no progress.
 */
export function elapsedSimTicks(elapsedMs: number, speed: number): number {
  if (speed <= 0 || elapsedMs <= 0) {
    return 0;
  }
  return (elapsedMs * speed) / MS_PER_TICK;
}

/**
 * Fraction (0..1) of the current cell-to-cell hop that is complete:
 * snapshot-carried tick accumulation plus wall-clock extrapolation, clamped so
 * a unit never overshoots the next path cell before the sim confirms it.
 */
export function movementFraction(movementProgress: number, ticksPerStep: number, elapsedTicks: number): number {
  if (ticksPerStep <= 0) {
    return 0;
  }
  return clamp((movementProgress + elapsedTicks) / ticksPerStep, 0, 1);
}

/**
 * World-space position of a unit, linearly interpolated between its snapshot
 * cell and the next path cell. Units without a path sit on their cell.
 */
export function interpolateUnitWorldPosition(unit: MovingUnitLike, elapsedTicks: number): WorldPoint {
  const from = cellToWorld(unit.position);
  const next = unit.path[0];
  if (next === undefined) {
    return from;
  }
  const to = cellToWorld(next);
  const fraction = movementFraction(unit.movementProgress, unit.ticksPerStep, elapsedTicks);
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction
  };
}

/**
 * Anti-pop smoothing between the currently displayed position and the freshly
 * interpolated target. Small gaps snap (sub-pixel), huge gaps snap (teleport),
 * anything in between eases exponentially and settles within ~100ms.
 */
export function resolveDisplayPosition(
  previous: WorldPoint | null,
  target: WorldPoint,
  frameDeltaMs: number
): WorldPoint {
  if (previous === null) {
    return target;
  }
  const dx = target.x - previous.x;
  const dy = target.y - previous.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= SNAP_DISTANCE || distance >= TELEPORT_DISTANCE) {
    return target;
  }
  const alpha = 1 - Math.exp(-Math.max(0, frameDeltaMs) / CONVERGE_TAU_MS);
  return {
    x: previous.x + dx * alpha,
    y: previous.y + dy * alpha
  };
}
