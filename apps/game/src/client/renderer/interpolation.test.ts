import { describe, expect, it } from "vitest";
import { cellToWorld } from "./camera";
import {
  CONVERGE_TAU_MS,
  MS_PER_TICK,
  SNAP_DISTANCE,
  TELEPORT_DISTANCE,
  elapsedSimTicks,
  interpolateUnitWorldPosition,
  movementFraction,
  resolveDisplayPosition,
  type MovingUnitLike
} from "./interpolation";

function makeUnit(overrides: Partial<MovingUnitLike> = {}): MovingUnitLike {
  return {
    position: { x: 10, y: 10 },
    path: [{ x: 11, y: 10 }],
    movementProgress: 0,
    ticksPerStep: 8,
    ...overrides
  };
}

describe("elapsedSimTicks", () => {
  it("converts wall-clock ms to ticks at 1x speed (50ms per tick)", () => {
    expect(MS_PER_TICK).toBe(50);
    expect(elapsedSimTicks(50, 1)).toBe(1);
    expect(elapsedSimTicks(25, 1)).toBe(0.5);
  });

  it("scales with game speed", () => {
    expect(elapsedSimTicks(50, 2)).toBe(2);
    expect(elapsedSimTicks(50, 4)).toBe(4);
  });

  it("contributes nothing when paused or with non-positive elapsed time", () => {
    expect(elapsedSimTicks(500, 0)).toBe(0);
    expect(elapsedSimTicks(-20, 1)).toBe(0);
  });
});

describe("movementFraction", () => {
  it("combines snapshot tick accumulation with wall-clock extrapolation", () => {
    expect(movementFraction(0, 8, 0)).toBe(0);
    expect(movementFraction(4, 8, 0)).toBe(0.5);
    expect(movementFraction(4, 8, 2)).toBe(0.75);
  });

  it("clamps to [0, 1] so a unit never overshoots the next cell", () => {
    expect(movementFraction(7, 8, 100)).toBe(1);
    expect(movementFraction(-5, 8, 0)).toBe(0);
  });

  it("guards against a non-positive ticksPerStep", () => {
    expect(movementFraction(3, 0, 5)).toBe(0);
  });
});

describe("interpolateUnitWorldPosition", () => {
  it("returns the cell position when the unit has no path", () => {
    const unit = makeUnit({ path: [] });
    expect(interpolateUnitWorldPosition(unit, 5)).toEqual(cellToWorld(unit.position));
  });

  it("sits on the snapshot cell at fraction 0", () => {
    const unit = makeUnit();
    expect(interpolateUnitWorldPosition(unit, 0)).toEqual(cellToWorld(unit.position));
  });

  it("renders midway between cells at fraction 0.5", () => {
    const unit = makeUnit({ movementProgress: 4 });
    const from = cellToWorld(unit.position);
    const to = cellToWorld(unit.path[0]!);
    const point = interpolateUnitWorldPosition(unit, 0);
    expect(point.x).toBeCloseTo((from.x + to.x) / 2);
    expect(point.y).toBeCloseTo((from.y + to.y) / 2);
  });

  it("advances with wall-clock elapsed ticks between snapshots", () => {
    const unit = makeUnit({ movementProgress: 2 });
    const from = cellToWorld(unit.position);
    const to = cellToWorld(unit.path[0]!);
    // (2 + 2) / 8 = 0.5
    const point = interpolateUnitWorldPosition(unit, 2);
    expect(point.x).toBeCloseTo(from.x + (to.x - from.x) * 0.5);
    expect(point.y).toBeCloseTo(from.y + (to.y - from.y) * 0.5);
  });

  it("clamps at the next path cell even with a huge elapsed time", () => {
    const unit = makeUnit();
    expect(interpolateUnitWorldPosition(unit, 1000)).toEqual(cellToWorld(unit.path[0]!));
  });
});

describe("resolveDisplayPosition", () => {
  it("starts at the target when there is no previous display position", () => {
    expect(resolveDisplayPosition(null, { x: 5, y: 7 }, 16)).toEqual({ x: 5, y: 7 });
  });

  it("snaps when the gap is sub-pixel", () => {
    const target = { x: 10, y: 10 };
    const previous = { x: 10 + SNAP_DISTANCE * 0.9, y: 10 };
    expect(resolveDisplayPosition(previous, target, 16)).toEqual(target);
  });

  it("snaps when the gap is a teleport", () => {
    const target = { x: 0, y: 0 };
    const previous = { x: TELEPORT_DISTANCE + 1, y: 0 };
    expect(resolveDisplayPosition(previous, target, 16)).toEqual(target);
  });

  it("eases part of the way for moderate gaps", () => {
    const previous = { x: 0, y: 0 };
    const target = { x: 20, y: 0 };
    const result = resolveDisplayPosition(previous, target, 16);
    expect(result.x).toBeGreaterThan(0);
    expect(result.x).toBeLessThan(20);
    expect(result.y).toBe(0);
  });

  it("converges to within ~5% of the gap after 100ms of frames", () => {
    let display = { x: 0, y: 0 } as { x: number; y: number };
    const target = { x: 20, y: 10 };
    for (let i = 0; i < 6; i++) {
      display = resolveDisplayPosition(display, target, 100 / 6);
    }
    const remaining = Math.hypot(target.x - display.x, target.y - display.y);
    const initial = Math.hypot(20, 10);
    expect(remaining / initial).toBeLessThan(0.05 + SNAP_DISTANCE / initial);
  });

  it("moves monotonically toward the target", () => {
    let display = { x: 0, y: 0 } as { x: number; y: number };
    const target = { x: 30, y: 0 };
    let lastDistance = 30;
    for (let i = 0; i < 20; i++) {
      display = resolveDisplayPosition(display, target, 16.7);
      const distance = Math.hypot(target.x - display.x, target.y - display.y);
      expect(distance).toBeLessThanOrEqual(lastDistance);
      lastDistance = distance;
    }
    expect(lastDistance).toBeLessThan(1);
  });

  it("uses the documented exponential alpha", () => {
    const previous = { x: 0, y: 0 };
    const target = { x: 10, y: 0 };
    const dt = 16;
    const alpha = 1 - Math.exp(-dt / CONVERGE_TAU_MS);
    const result = resolveDisplayPosition(previous, target, dt);
    expect(result.x).toBeCloseTo(10 * alpha);
  });
});
