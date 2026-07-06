import { describe, expect, it } from "vitest";
import type { UnitSnapshot, WorldSnapshot } from "@asama/shared";
import { computeGroupCentroid } from "./groupManager";

function makeSnapshot(units: Partial<UnitSnapshot>[]): WorldSnapshot {
  const fullUnits: UnitSnapshot[] = units.map((u, i) => ({
    id: `u${i}`,
    owner: "player",
    type: "spear_ashigaru",
    position: { x: 0, y: 0 },
    destination: null,
    path: [],
    selected: false,
    hp: 100,
    maxHp: 100,
    attackDamage: 10,
    attackRange: 1,
    attackCooldownTicks: 20,
    attackCooldownRemaining: 0,
    targetId: null,
    assetId: "unit_spear",
    task: null,
    movementProgress: 0,
    ticksPerStep: 8,
    ...u,
  }));

  return {
    currentTick: 0,
    invalidMoveTarget: null,
    outcome: null,
    food: { available: 0, total: 0, capacity: 0, requiredPerCycle: 0, nextConsumptionInTicks: 0 },
    economy: {
      gold: 0,
      weapons: 0,
      population: 0,
      populationCapacity: 0,
      approval: 0,
      recruitPool: 0,
      recruitPoolMax: 0,
      season: "spring",
      year: 1,
      plantedFarms: 0,
    },
    map: { width: 128, height: 128, cells: [], decorations: [] },
    units: fullUnits,
    buildings: [],
    supplyRetreat: { active: false, remainingTicks: 0 },
    holdDeadlineTick: null,
    nextWaveTick: null,
  };
}

describe("computeGroupCentroid", () => {
  it("returns null for empty group IDs", () => {
    const snap = makeSnapshot([{ id: "u0", position: { x: 10, y: 20 } }]);
    expect(computeGroupCentroid([], snap)).toBeNull();
  });

  it("returns null when none of the group IDs are present in snapshot", () => {
    const snap = makeSnapshot([{ id: "u0", position: { x: 10, y: 20 } }]);
    expect(computeGroupCentroid(["missing1", "missing2"], snap)).toBeNull();
  });

  it("returns the unit's own position for a single unit group", () => {
    const snap = makeSnapshot([{ id: "u0", position: { x: 10, y: 20 } }]);
    expect(computeGroupCentroid(["u0"], snap)).toEqual({ x: 10, y: 20 });
  });

  it("computes the average position for multiple units", () => {
    const snap = makeSnapshot([
      { id: "u0", position: { x: 0, y: 0 } },
      { id: "u1", position: { x: 10, y: 10 } },
    ]);
    expect(computeGroupCentroid(["u0", "u1"], snap)).toEqual({ x: 5, y: 5 });
  });

  it("ignores IDs not present in the snapshot", () => {
    const snap = makeSnapshot([
      { id: "u0", position: { x: 4, y: 6 } },
    ]);
    // "ghost" is not in snapshot, should be ignored
    expect(computeGroupCentroid(["u0", "ghost"], snap)).toEqual({ x: 4, y: 6 });
  });

  it("rounds fractional centroid to nearest integer", () => {
    const snap = makeSnapshot([
      { id: "u0", position: { x: 0, y: 0 } },
      { id: "u1", position: { x: 1, y: 1 } },
      { id: "u2", position: { x: 2, y: 2 } },
    ]);
    // centroid = (3/3, 3/3) = (1, 1), exact
    expect(computeGroupCentroid(["u0", "u1", "u2"], snap)).toEqual({ x: 1, y: 1 });
  });
});
