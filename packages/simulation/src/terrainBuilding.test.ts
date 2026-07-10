import { describe, expect, it } from "vitest";
import type { ScenarioDefinition } from "@asama/shared";
import { MAX_ELEVATION } from "@asama/shared";
import { applyScenarioElevation } from "./elevation";
import { getCell } from "./map";
import { TERRAIN_COSTS } from "./types";
import { applyCommand, createInitialWorld } from "./world";
import type { WorldState } from "./types";

const FLAT_SCENARIO: ScenarioDefinition = {
  id: "test-terrain-building",
  name: "terrain building test",
  initialBuildings: [],
  initialUnits: [],
  waves: [],
  victory: { holdTicks: null }
};

/** All tests operate in a grass-only region away from river, stone ridge and dirt zone. */
const TEST_CELL = { x: 20, y: 20 };

function freshWorld(): WorldState {
  return createInitialWorld(FLAT_SCENARIO);
}

/** World with TEST_CELL already at elevation 1. */
function worldElevated1(): WorldState {
  const world = freshWorld();
  applyScenarioElevation(world.map, {
    patches: [{ area: { kind: "rect", x: TEST_CELL.x, y: TEST_CELL.y, width: 1, height: 1 }, level: 1 }]
  });
  return world;
}

/** World with TEST_CELL at elevation 1 and TEST_CELL.y+1 (south neighbor) at elevation 2.
 *  (Allows placing a slope on TEST_CELL toward S.) */
function worldWithSlopeReady(): WorldState {
  const world = freshWorld();
  applyScenarioElevation(world.map, {
    patches: [
      {
        area: { kind: "rect", x: TEST_CELL.x, y: TEST_CELL.y, width: 1, height: 1 },
        level: 1
      },
      {
        area: { kind: "rect", x: TEST_CELL.x, y: TEST_CELL.y + 1, width: 1, height: 1 },
        level: 2
      }
    ]
  });
  return world;
}

// ─── raiseTerrain ────────────────────────────────────────────────────────────

describe("raiseTerrain", () => {
  it("increases elevation by 1", () => {
    const world = freshWorld();
    const before = getCell(world, TEST_CELL).elevation;
    const result = applyCommand(world, {
      type: "raiseTerrain",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(result).toBeNull();
    expect(getCell(world, TEST_CELL).elevation).toBe(before + 1);
  });

  it("deducts gold cost", () => {
    const world = freshWorld();
    const goldBefore = world.economy.gold;
    applyCommand(world, {
      type: "raiseTerrain",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(world.economy.gold).toBe(goldBefore - TERRAIN_COSTS.raiseTerrain);
  });

  it("increments terrainRevision", () => {
    const world = freshWorld();
    const revBefore = world.terrainRevision;
    applyCommand(world, {
      type: "raiseTerrain",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(world.terrainRevision).toBe(revBefore + 1);
  });

  it("rejects when already at MAX_ELEVATION", () => {
    const world = freshWorld();
    // Raise to MAX_ELEVATION via scenario.
    applyScenarioElevation(world.map, {
      patches: [
        {
          area: { kind: "rect", x: TEST_CELL.x, y: TEST_CELL.y, width: 1, height: 1 },
          level: MAX_ELEVATION
        }
      ]
    });
    const result = applyCommand(world, {
      type: "raiseTerrain",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(result).not.toBeNull();
    expect(getCell(world, TEST_CELL).elevation).toBe(MAX_ELEVATION);
  });

  it("rejects when gold is insufficient", () => {
    const world = freshWorld();
    world.economy.gold = 0;
    const result = applyCommand(world, {
      type: "raiseTerrain",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(result).not.toBeNull();
    expect(getCell(world, TEST_CELL).elevation).toBe(0);
  });
});

// ─── lowerTerrain ────────────────────────────────────────────────────────────

describe("lowerTerrain", () => {
  it("decreases elevation by 1", () => {
    const world = worldElevated1();
    const before = getCell(world, TEST_CELL).elevation;
    expect(before).toBe(1);
    const result = applyCommand(world, {
      type: "lowerTerrain",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(result).toBeNull();
    expect(getCell(world, TEST_CELL).elevation).toBe(before - 1);
  });

  it("deducts gold cost", () => {
    const world = worldElevated1();
    const goldBefore = world.economy.gold;
    applyCommand(world, {
      type: "lowerTerrain",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(world.economy.gold).toBe(goldBefore - TERRAIN_COSTS.lowerTerrain);
  });

  it("rejects when already at ground level (elevation 0)", () => {
    const world = freshWorld();
    const result = applyCommand(world, {
      type: "lowerTerrain",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(result).not.toBeNull();
    expect(getCell(world, TEST_CELL).elevation).toBe(0);
  });

  it("rejects when gold is insufficient", () => {
    const world = worldElevated1();
    world.economy.gold = 0;
    const result = applyCommand(world, {
      type: "lowerTerrain",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(result).not.toBeNull();
    expect(getCell(world, TEST_CELL).elevation).toBe(1);
  });

  it("removes existing slope when lowering", () => {
    const world = worldWithSlopeReady();
    // Place a slope on TEST_CELL first.
    applyCommand(world, {
      type: "placeSlope",
      position: TEST_CELL,
      toward: "S",
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(getCell(world, TEST_CELL).slope).toBe("S");
    // Now lower the cell — slope must be cleared.
    applyCommand(world, {
      type: "lowerTerrain",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(getCell(world, TEST_CELL).slope).toBeNull();
  });
});

// ─── placeSlope ──────────────────────────────────────────────────────────────

describe("placeSlope", () => {
  it("sets slope direction on the cell", () => {
    const world = worldWithSlopeReady();
    const result = applyCommand(world, {
      type: "placeSlope",
      position: TEST_CELL,
      toward: "S",
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(result).toBeNull();
    expect(getCell(world, TEST_CELL).slope).toBe("S");
  });

  it("deducts gold cost", () => {
    const world = worldWithSlopeReady();
    const goldBefore = world.economy.gold;
    applyCommand(world, {
      type: "placeSlope",
      position: TEST_CELL,
      toward: "S",
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(world.economy.gold).toBe(goldBefore - TERRAIN_COSTS.placeSlope);
  });

  it("rejects when slope already exists", () => {
    const world = worldWithSlopeReady();
    applyCommand(world, {
      type: "placeSlope",
      position: TEST_CELL,
      toward: "S",
      issuedAtTick: 0,
      clientSequence: 1
    });
    const result = applyCommand(world, {
      type: "placeSlope",
      position: TEST_CELL,
      toward: "S",
      issuedAtTick: 0,
      clientSequence: 2
    });
    expect(result).not.toBeNull();
  });

  it("rejects when adjacent cell is not one level higher", () => {
    const world = worldElevated1();
    // South neighbor is also at 1 (not 2), so slope toward S is invalid.
    const result = applyCommand(world, {
      type: "placeSlope",
      position: TEST_CELL,
      toward: "S",
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(result).not.toBeNull();
    expect(getCell(world, TEST_CELL).slope).toBeNull();
  });

  it("rejects when gold is insufficient", () => {
    const world = worldWithSlopeReady();
    world.economy.gold = 0;
    const result = applyCommand(world, {
      type: "placeSlope",
      position: TEST_CELL,
      toward: "S",
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(result).not.toBeNull();
    expect(getCell(world, TEST_CELL).slope).toBeNull();
  });
});

// ─── removeSlope ─────────────────────────────────────────────────────────────

describe("removeSlope", () => {
  it("clears slope from a cell", () => {
    const world = worldWithSlopeReady();
    applyCommand(world, {
      type: "placeSlope",
      position: TEST_CELL,
      toward: "S",
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(getCell(world, TEST_CELL).slope).toBe("S");
    const result = applyCommand(world, {
      type: "removeSlope",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 2
    });
    expect(result).toBeNull();
    expect(getCell(world, TEST_CELL).slope).toBeNull();
  });

  it("deducts gold cost", () => {
    const world = worldWithSlopeReady();
    applyCommand(world, {
      type: "placeSlope",
      position: TEST_CELL,
      toward: "S",
      issuedAtTick: 0,
      clientSequence: 1
    });
    const goldBefore = world.economy.gold;
    applyCommand(world, {
      type: "removeSlope",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 2
    });
    expect(world.economy.gold).toBe(goldBefore - TERRAIN_COSTS.removeSlope);
  });

  it("rejects when no slope exists", () => {
    const world = worldElevated1();
    const result = applyCommand(world, {
      type: "removeSlope",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(result).not.toBeNull();
  });

  it("rejects when gold is insufficient", () => {
    const world = worldWithSlopeReady();
    applyCommand(world, {
      type: "placeSlope",
      position: TEST_CELL,
      toward: "S",
      issuedAtTick: 0,
      clientSequence: 1
    });
    world.economy.gold = 0;
    const result = applyCommand(world, {
      type: "removeSlope",
      position: TEST_CELL,
      issuedAtTick: 0,
      clientSequence: 2
    });
    expect(result).not.toBeNull();
    expect(getCell(world, TEST_CELL).slope).toBe("S");
  });
});
