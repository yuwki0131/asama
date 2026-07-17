import { describe, expect, it } from "vitest";
import type { ScenarioDefinition } from "@asama/shared";
import { buildingDefinitions, createBuildingState, canPlaceBuilding } from "./buildings";
import { updateCombat } from "./combat";
import { ELEVATION_BALANCE, applyScenarioElevation, edgeHeight, elevationAt, stepTicksFor, surfaceLevel } from "./elevation";
import { computeConnectedStorehouseIds } from "./food";
import { getCell } from "./map";
import { canStep, findPath, movementCostForStep } from "./pathfinding";
import { createUnit } from "./units";
import { createInitialWorld, snapshotWorld, updateWorld } from "./world";
import type { WorldState } from "./types";

// All test coordinates live in a grass-only region of the procedural map
// (away from the river y~41, the stone ridge x~84 and the dirt zone).
const FLAT_SCENARIO: ScenarioDefinition = {
  id: "test-flat",
  name: "test flat",
  initialBuildings: [],
  initialUnits: [],
  waves: [],
  victory: { holdTicks: null }
};

function flatWorld(): WorldState {
  return createInitialWorld(FLAT_SCENARIO);
}

/** Plateau x=20..24, y=58..62 at level 1, no slopes. */
function plateauWorld(): WorldState {
  const world = flatWorld();
  applyScenarioElevation(world.map, {
    patches: [{ area: { kind: "rect", x: 20, y: 58, width: 5, height: 5 }, level: 1 }]
  });
  return world;
}

/** Same plateau plus a single south ramp at (22,63) toward N. */
function plateauWithSlopeWorld(): WorldState {
  const world = flatWorld();
  applyScenarioElevation(world.map, {
    patches: [{ area: { kind: "rect", x: 20, y: 58, width: 5, height: 5 }, level: 1 }],
    slopes: [{ position: { x: 22, y: 63 }, toward: "N" }]
  });
  return world;
}

describe("applyScenarioElevation", () => {
  it("rect patch raises covered cells and leaves the rest flat", () => {
    const world = plateauWorld();
    expect(elevationAt(world, { x: 22, y: 60 })).toBe(1);
    expect(elevationAt(world, { x: 19, y: 60 })).toBe(0);
    expect(elevationAt(world, { x: 25, y: 60 })).toBe(0);
  });

  it("ellipse patch covers the interior of the ellipse", () => {
    const world = flatWorld();
    applyScenarioElevation(world.map, {
      patches: [{ area: { kind: "ellipse", cx: 22, cy: 60, rx: 4, ry: 2 }, level: 2 }]
    });
    expect(elevationAt(world, { x: 22, y: 60 })).toBe(2);
    expect(elevationAt(world, { x: 26, y: 60 })).toBe(2);
    expect(elevationAt(world, { x: 26, y: 62 })).toBe(0);
  });

  it("overlapping patches compose with max (terraces)", () => {
    const world = flatWorld();
    applyScenarioElevation(world.map, {
      patches: [
        { area: { kind: "rect", x: 20, y: 58, width: 8, height: 8 }, level: 1 },
        { area: { kind: "rect", x: 22, y: 60, width: 3, height: 3 }, level: 3, skin: "ishigaki" },
        // Lower re-declaration must not flatten the keep.
        { area: { kind: "rect", x: 20, y: 58, width: 8, height: 8 }, level: 1 }
      ]
    });
    expect(elevationAt(world, { x: 21, y: 59 })).toBe(1);
    expect(elevationAt(world, { x: 23, y: 61 })).toBe(3);
    expect(getCell(world, { x: 23, y: 61 }).elevationSkin).toBe("ishigaki");
    expect(getCell(world, { x: 21, y: 59 }).elevationSkin).toBe("cliff");
  });

  it("water cells stay at elevation 0 (patch skips them)", () => {
    const world = flatWorld();
    // The procedural river passes near y=41; (40,41) area contains water.
    const waterCell = world.map.cells.find((cell) => cell.terrain === "water");
    expect(waterCell).toBeDefined();
    applyScenarioElevation(world.map, {
      patches: [
        {
          area: { kind: "rect", x: waterCell!.coord.x - 1, y: waterCell!.coord.y - 1, width: 3, height: 3 },
          level: 2
        }
      ]
    });
    expect(elevationAt(world, waterCell!.coord)).toBe(0);
  });

  it("throws on a slope whose top edge does not connect to a +1 surface", () => {
    const world = flatWorld();
    expect(() =>
      applyScenarioElevation(world.map, {
        patches: [],
        slopes: [{ position: { x: 22, y: 63 }, toward: "N" }]
      })
    ).toThrow(/does not connect/);
  });

  it("throws on a slope placed on water", () => {
    const world = flatWorld();
    const waterCell = world.map.cells.find((cell) => cell.terrain === "water");
    expect(waterCell).toBeDefined();
    expect(() =>
      applyScenarioElevation(world.map, {
        patches: [],
        slopes: [{ position: waterCell!.coord, toward: "N" }]
      })
    ).toThrow(/water/);
  });

  it("removes decorations from cells that become slopes (ramps stay clear)", () => {
    const world = flatWorld();
    world.map.decorations.push(
      { assetId: "deco.tree.1", position: { x: 22, y: 63 } },
      { assetId: "deco.tree.1", position: { x: 21, y: 63 } }
    );
    applyScenarioElevation(world.map, {
      patches: [{ area: { kind: "rect", x: 20, y: 58, width: 5, height: 5 }, level: 1 }],
      slopes: [{ position: { x: 22, y: 63 }, toward: "N" }]
    });
    expect(world.map.decorations.some((d) => d.position.x === 22 && d.position.y === 63)).toBe(false);
    // Neighbouring non-slope cells keep their decorations.
    expect(world.map.decorations.some((d) => d.position.x === 21 && d.position.y === 63)).toBe(true);
  });

  it("width expands the ramp perpendicular to its direction", () => {
    const world = flatWorld();
    applyScenarioElevation(world.map, {
      patches: [{ area: { kind: "rect", x: 20, y: 58, width: 5, height: 5 }, level: 1 }],
      slopes: [{ position: { x: 21, y: 63 }, toward: "N", width: 3 }]
    });
    expect(getCell(world, { x: 21, y: 63 }).slope).toBe("N");
    expect(getCell(world, { x: 22, y: 63 }).slope).toBe("N");
    expect(getCell(world, { x: 23, y: 63 }).slope).toBe("N");
    expect(getCell(world, { x: 24, y: 63 }).slope).toBeNull();
  });
});

describe("edge traversal rules", () => {
  it("cliff boundary is impassable in both directions", () => {
    const world = plateauWorld();
    // (22,63) flat level 0 / (22,62) plateau level 1: a cliff edge.
    expect(canStep(world, { x: 22, y: 63 }, { x: 22, y: 62 })).toBe(false);
    expect(canStep(world, { x: 22, y: 62 }, { x: 22, y: 63 })).toBe(false);
    // Same-level movement stays allowed on both sides.
    expect(canStep(world, { x: 22, y: 63 }, { x: 22, y: 64 })).toBe(true);
    expect(canStep(world, { x: 22, y: 62 }, { x: 22, y: 61 })).toBe(true);
  });

  it("a correctly oriented slope connects the two levels", () => {
    const world = plateauWithSlopeWorld();
    expect(canStep(world, { x: 22, y: 64 }, { x: 22, y: 63 })).toBe(true); // flat0 -> ramp
    expect(canStep(world, { x: 22, y: 63 }, { x: 22, y: 62 })).toBe(true); // ramp -> plateau
    expect(canStep(world, { x: 22, y: 62 }, { x: 22, y: 63 })).toBe(true); // back down
  });

  it("slope side edges are cliffs (orientation mismatch is impassable)", () => {
    const world = plateauWithSlopeWorld();
    expect(canStep(world, { x: 21, y: 63 }, { x: 22, y: 63 })).toBe(false);
    expect(canStep(world, { x: 23, y: 63 }, { x: 22, y: 63 })).toBe(false);
    expect(canStep(world, { x: 22, y: 63 }, { x: 21, y: 63 })).toBe(false);
    expect(canStep(world, { x: 22, y: 63 }, { x: 23, y: 63 })).toBe(false);
  });

  it("stacked slopes form a two-level ramp", () => {
    const world = flatWorld();
    applyScenarioElevation(world.map, {
      patches: [
        { area: { kind: "rect", x: 20, y: 56, width: 5, height: 6 }, level: 1 },
        { area: { kind: "rect", x: 20, y: 56, width: 5, height: 3 }, level: 2 }
      ],
      slopes: [
        { position: { x: 22, y: 62 }, toward: "N" }, // 0 -> 1 (on the level-1 shelf edge? no: low cell below)
        { position: { x: 22, y: 59 }, toward: "N" } // 1 -> 2
      ]
    });
    // Walk 0 -> 1 -> 2 straight up the ramps.
    expect(canStep(world, { x: 22, y: 63 }, { x: 22, y: 62 })).toBe(true);
    expect(canStep(world, { x: 22, y: 62 }, { x: 22, y: 61 })).toBe(true);
    expect(canStep(world, { x: 22, y: 61 }, { x: 22, y: 60 })).toBe(true);
    expect(canStep(world, { x: 22, y: 60 }, { x: 22, y: 59 })).toBe(true);
    expect(canStep(world, { x: 22, y: 59 }, { x: 22, y: 58 })).toBe(true);
    expect(elevationAt(world, { x: 22, y: 58 })).toBe(2);
  });
});

describe("pathfinding with elevation", () => {
  it("no path onto a plateau without a slope", () => {
    const world = plateauWorld();
    const path = findPath(world, { x: 22, y: 55 }, { x: 22, y: 60 });
    expect(path).toEqual([]);
  });

  it("path detours around the cliff and climbs via the slope", () => {
    const world = plateauWithSlopeWorld();
    // Start north of the plateau; the only way up is the south ramp.
    const path = findPath(world, { x: 22, y: 55 }, { x: 22, y: 60 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((step) => step.x === 22 && step.y === 63)).toBe(true);
    expect(path.at(-1)).toEqual({ x: 22, y: 60 });
    // Every step in the returned path must be a legal edge.
    let previous = { x: 22, y: 55 };
    for (const step of path) {
      expect(canStep(world, previous, step)).toBe(true);
      previous = step;
    }
  });

  it("uphill steps cost extra in A* and downhill does not", () => {
    const world = plateauWithSlopeWorld();
    const base = getCell(world, { x: 22, y: 63 }).movementCost;
    expect(movementCostForStep(world, { x: 22, y: 64 }, { x: 22, y: 63 })).toBe(
      base + ELEVATION_BALANCE.climbCostPerStep
    );
    expect(movementCostForStep(world, { x: 22, y: 63 }, { x: 22, y: 64 })).toBe(
      getCell(world, { x: 22, y: 64 }).movementCost
    );
  });

  it("uphill steps take extra sim ticks (climb slows units down)", () => {
    const world = plateauWithSlopeWorld();
    const climber = createUnit("unit:test:climber", "player", "spear_ashigaru", { x: 22, y: 64 });
    climber.path = [{ x: 22, y: 63 }];
    world.units.push(climber);
    expect(stepTicksFor(world, climber)).toBe(climber.ticksPerStep + ELEVATION_BALANCE.climbExtraTicksPerStep);

    const descender = createUnit("unit:test:descender", "player", "spear_ashigaru", { x: 22, y: 62 });
    descender.path = [{ x: 22, y: 63 }];
    world.units.push(descender);
    expect(stepTicksFor(world, descender)).toBe(descender.ticksPerStep);
  });
});

describe("high-ground combat bonus", () => {
  it("attacker above target gains +1 range and x1.25 damage; low attacker gets neither", () => {
    const world = plateauWorld();
    // Archer (range 8, damage 12, archer-vs-archer affinity 1) on the plateau;
    // enemy archer on flat ground at manhattan distance 9.
    const high = createUnit("unit:test:high", "player", "archer", { x: 24, y: 60 });
    const low = createUnit("unit:test:low", "enemy", "archer", { x: 33, y: 60 });
    world.units.push(high, low);

    updateCombat(world);

    // High archer reached distance 9 thanks to the +1 range bonus and dealt
    // 12 * 1.25 = 15 damage; low archer (base range 8) could not answer.
    expect(low.hp).toBe(low.maxHp - 15);
    expect(high.hp).toBe(high.maxHp);
  });

  it("attackers on the same level get no bonus", () => {
    const world = plateauWorld();
    const a = createUnit("unit:test:a", "player", "archer", { x: 30, y: 66 });
    const b = createUnit("unit:test:b", "enemy", "archer", { x: 38, y: 66 });
    world.units.push(a, b);

    updateCombat(world);

    // Distance 8 = base range for both; both deal plain 12 damage.
    expect(a.hp).toBe(a.maxHp - 12);
    expect(b.hp).toBe(b.maxHp - 12);
  });

  it("high-ground bonus applies against buildings (anchor-cell elevation)", () => {
    const world = plateauWorld();
    const yagura = createBuildingState(world, "yagura", { x: 33, y: 60 }, buildingDefinitions.yagura, "enemy");
    world.buildings.push(yagura);
    const high = createUnit("unit:test:high", "player", "archer", { x: 24, y: 60 });
    high.attackTargetId = yagura.id;
    world.units.push(high);

    updateCombat(world);

    // Nearest footprint cell (33,60) is at distance 9: reachable only with the
    // high-ground range bonus; damage is 12 * 1.25 = 15.
    expect(yagura.hp).toBe(yagura.maxHp - 15);
  });

  it("a unit on a slope counts as the slope's lower level", () => {
    const world = plateauWithSlopeWorld();
    expect(elevationAt(world, { x: 22, y: 63 })).toBe(0);
    const onSlope = createUnit("unit:test:slope", "player", "archer", { x: 22, y: 63 });
    const flat = createUnit("unit:test:flat", "enemy", "archer", { x: 22, y: 72 });
    world.units.push(onSlope, flat);

    updateCombat(world);

    // Distance 9 with no elevation advantage: nobody shoots.
    expect(flat.hp).toBe(flat.maxHp);
    expect(onSlope.hp).toBe(onSlope.maxHp);
  });
});

describe("building placement and elevation", () => {
  it("rejects footprints spanning two levels or ramp cells", () => {
    const world = plateauWithSlopeWorld();
    const definition = buildingDefinitions.storehouse; // 3x3
    // Straddles the plateau edge (rows 62 level 1, row 63 level 0).
    expect(canPlaceBuilding(world, { x: 20, y: 61 }, definition)).toBe(false);
    // Contains the ramp cell (22,63).
    expect(canPlaceBuilding(world, { x: 21, y: 63 }, definition)).toBe(false);
    // Fully on the plateau: allowed.
    expect(canPlaceBuilding(world, { x: 20, y: 58 }, definition)).toBe(true);
    // Fully on flat ground: allowed.
    expect(canPlaceBuilding(world, { x: 30, y: 66 }, definition)).toBe(true);
  });
});

describe("food connectivity across elevation", () => {
  function worldWithHonmaruAndStorehouse(withSlope: boolean): WorldState {
    const world = withSlope ? plateauWithSlopeWorld() : plateauWorld();
    const honmaru = createBuildingState(world, "honmaru", { x: 22, y: 60 }, buildingDefinitions.honmaru, "player");
    world.buildings.push(honmaru);
    world.nextBuildingId += 1;
    const storehouse = createBuildingState(
      world,
      "storehouse",
      { x: 28, y: 64 },
      buildingDefinitions.storehouse,
      "player"
    );
    world.buildings.push(storehouse);
    world.nextBuildingId += 1;
    return world;
  }

  it("a cliff cuts the supply line between honmaru and storehouse", () => {
    const world = worldWithHonmaruAndStorehouse(false);
    expect(computeConnectedStorehouseIds(world)).toEqual([]);
  });

  it("a slope carries the supply line up the terrace", () => {
    const world = worldWithHonmaruAndStorehouse(true);
    expect(computeConnectedStorehouseIds(world)).toHaveLength(1);
  });
});

describe("gentle 2-cell slopes (length: 2)", () => {
  /** Plateau (rows 58..62 at level 1) plus a gentle N ramp: lower half at
   *  (22,64), upper half at (22,63) meeting the plateau at (22,62). */
  function plateauWithGentleSlopeWorld(): WorldState {
    const world = flatWorld();
    applyScenarioElevation(world.map, {
      patches: [{ area: { kind: "rect", x: 20, y: 58, width: 5, height: 5 }, level: 1 }],
      slopes: [{ position: { x: 22, y: 64 }, toward: "N", length: 2 }]
    });
    return world;
  }

  it("marks the lower and upper halves along the slope axis", () => {
    const world = plateauWithGentleSlopeWorld();
    const lower = getCell(world, { x: 22, y: 64 });
    const upper = getCell(world, { x: 22, y: 63 });
    expect(lower.slope).toBe("N");
    expect(lower.slopeHalf).toBe("lower");
    expect(upper.slope).toBe("N");
    expect(upper.slopeHalf).toBe("upper");
    expect(lower.elevation).toBe(0);
    expect(upper.elevation).toBe(0);
  });

  it("exposes half-level edge heights that chain lower -> upper -> plateau", () => {
    const world = plateauWithGentleSlopeWorld();
    const lower = getCell(world, { x: 22, y: 64 });
    const upper = getCell(world, { x: 22, y: 63 });
    expect(edgeHeight(lower, "S")).toBe(0); // meets flat ground
    expect(edgeHeight(lower, "N")).toBe(0.5); // meets the upper half
    expect(edgeHeight(upper, "S")).toBe(0.5);
    expect(edgeHeight(upper, "N")).toBe(1); // meets the plateau
    expect(edgeHeight(lower, "E")).toBeNull(); // side edges stay cliffs
    expect(edgeHeight(upper, "W")).toBeNull();
    expect(surfaceLevel(lower)).toBe(0.25);
    expect(surfaceLevel(upper)).toBe(0.75);
  });

  it("is walkable end to end along its axis and closed on the sides", () => {
    const world = plateauWithGentleSlopeWorld();
    // flat -> lower -> upper -> plateau, and back down.
    expect(canStep(world, { x: 22, y: 65 }, { x: 22, y: 64 })).toBe(true);
    expect(canStep(world, { x: 22, y: 64 }, { x: 22, y: 63 })).toBe(true);
    expect(canStep(world, { x: 22, y: 63 }, { x: 22, y: 62 })).toBe(true);
    expect(canStep(world, { x: 22, y: 62 }, { x: 22, y: 63 })).toBe(true);
    expect(canStep(world, { x: 22, y: 63 }, { x: 22, y: 64 })).toBe(true);
    // Side edges of both halves are cliffs.
    expect(canStep(world, { x: 21, y: 64 }, { x: 22, y: 64 })).toBe(false);
    expect(canStep(world, { x: 23, y: 64 }, { x: 22, y: 64 })).toBe(false);
    expect(canStep(world, { x: 21, y: 63 }, { x: 22, y: 63 })).toBe(false);
    expect(canStep(world, { x: 23, y: 63 }, { x: 22, y: 63 })).toBe(false);
  });

  it("does not generate cliff cells on the bridged edges (insertCliffCells)", () => {
    const world = createInitialWorld({
      ...FLAT_SCENARIO,
      id: "test-gentle-cliff",
      elevation: {
        patches: [{ area: { kind: "rect", x: 20, y: 58, width: 5, height: 5 }, level: 1 }],
        slopes: [{ position: { x: 22, y: 64 }, toward: "N", length: 2 }]
      }
    });
    // The two ramp halves stay walkable slope cells.
    expect(getCell(world, { x: 22, y: 64 }).terrain).not.toBe("cliff");
    expect(getCell(world, { x: 22, y: 63 }).terrain).not.toBe("cliff");
    expect(getCell(world, { x: 22, y: 63 }).slope).toBe("N");
    // Non-bridged plateau S edge cells still become cliff cells.
    expect(getCell(world, { x: 21, y: 63 }).terrain).toBe("cliff");
    expect(getCell(world, { x: 23, y: 63 }).terrain).toBe("cliff");
  });

  it("never mints cliffHeight-0 SE corners next to a taller outcrop (insertCliffCells)", () => {
    // Regression: a level-3 outcrop one cell east of a level-2 terrace rim.
    // The rim's e-cliff column and the outcrop's s-cliff row meet at a cliff
    // driver cell whose SE diagonal is same-height ground; the corner pass
    // used to mint a cliffHeight-0 corner there and then chain southwards,
    // carving an invisible impassable corridor across the flat terrace.
    const world = createInitialWorld({
      ...FLAT_SCENARIO,
      id: "test-corner-chain",
      elevation: {
        patches: [
          { area: { kind: "rect", x: 55, y: 50, width: 20, height: 20 }, level: 1 },
          { area: { kind: "rect", x: 55, y: 50, width: 6, height: 12 }, level: 2 },
          { area: { kind: "rect", x: 62, y: 52, width: 2, height: 2 }, level: 3 }
        ]
      }
    });
    for (const cell of world.map.cells) {
      if (cell.terrain === "cliff") {
        expect(cell.cliffHeight ?? 0).toBeGreaterThan(0);
      }
    }
    // The flat level-1 cells south of the outcrop's cliff row stay walkable.
    for (let y = 55; y <= 58; y += 1) {
      for (let x = 62; x <= 64; x += 1) {
        const cell = getCell(world, { x, y });
        expect(cell.terrain).not.toBe("cliff");
        expect(cell.passable).toBe(true);
      }
    }
  });

  it("pathfinding climbs the gentle ramp with per-step climb penalties", () => {
    const world = plateauWithGentleSlopeWorld();
    const path = findPath(world, { x: 22, y: 55 }, { x: 22, y: 60 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((step) => step.x === 22 && step.y === 64)).toBe(true);
    expect(path.some((step) => step.x === 22 && step.y === 63)).toBe(true);
    expect(path.at(-1)).toEqual({ x: 22, y: 60 });

    // Each of the three ascending steps gains height -> climb ticks apply.
    const climber = createUnit("unit:test:gentle", "player", "spear_ashigaru", { x: 22, y: 65 });
    climber.path = [{ x: 22, y: 64 }];
    world.units.push(climber);
    expect(stepTicksFor(world, climber)).toBe(climber.ticksPerStep + ELEVATION_BALANCE.climbExtraTicksPerStep);
    climber.position = { x: 22, y: 64 };
    climber.path = [{ x: 22, y: 63 }];
    expect(stepTicksFor(world, climber)).toBe(climber.ticksPerStep + ELEVATION_BALANCE.climbExtraTicksPerStep);
    climber.position = { x: 22, y: 63 };
    climber.path = [{ x: 22, y: 62 }];
    expect(stepTicksFor(world, climber)).toBe(climber.ticksPerStep + ELEVATION_BALANCE.climbExtraTicksPerStep);
    // Downhill is free.
    climber.position = { x: 22, y: 63 };
    climber.path = [{ x: 22, y: 64 }];
    expect(stepTicksFor(world, climber)).toBe(climber.ticksPerStep);
  });

  it("units on either half count as the slope's lower level in combat", () => {
    const world = plateauWithGentleSlopeWorld();
    expect(elevationAt(world, { x: 22, y: 64 })).toBe(0);
    expect(elevationAt(world, { x: 22, y: 63 })).toBe(0);
  });

  it("snapshots carry slopeHalf for gentle ramp cells only", () => {
    const world = createInitialWorld({
      ...FLAT_SCENARIO,
      id: "test-gentle-snapshot",
      elevation: {
        patches: [{ area: { kind: "rect", x: 20, y: 58, width: 5, height: 5 }, level: 1 }],
        slopes: [
          { position: { x: 22, y: 64 }, toward: "N", length: 2 },
          { position: { x: 20, y: 63 }, toward: "N" } // steep 1-cell for contrast
        ]
      }
    });
    const snapshot = snapshotWorld(world);
    const at = (x: number, y: number) => snapshot.map.cells.find((c) => c.coord.x === x && c.coord.y === y);
    expect(at(22, 64)?.slopeHalf).toBe("lower");
    expect(at(22, 63)?.slopeHalf).toBe("upper");
    expect(at(20, 63)?.slope).toBe("N");
    expect(at(20, 63)?.slopeHalf).toBeUndefined();
  });

  it("throws when the gentle ramp does not connect two levels across its two cells", () => {
    const world = flatWorld();
    expect(() =>
      applyScenarioElevation(world.map, {
        patches: [{ area: { kind: "rect", x: 20, y: 58, width: 5, height: 5 }, level: 1 }],
        // Upper half would land ON the plateau: geometrically invalid.
        slopes: [{ position: { x: 22, y: 63 }, toward: "N", length: 2 }]
      })
    ).toThrow(/does not connect/);
  });

  it("removes decorations from both halves", () => {
    const world = flatWorld();
    world.map.decorations.push(
      { assetId: "deco.tree.1", position: { x: 22, y: 64 } },
      { assetId: "deco.tree.1", position: { x: 22, y: 63 } },
      { assetId: "deco.tree.1", position: { x: 21, y: 64 } }
    );
    applyScenarioElevation(world.map, {
      patches: [{ area: { kind: "rect", x: 20, y: 58, width: 5, height: 5 }, level: 1 }],
      slopes: [{ position: { x: 22, y: 64 }, toward: "N", length: 2 }]
    });
    expect(world.map.decorations.some((d) => d.position.x === 22 && d.position.y === 64)).toBe(false);
    expect(world.map.decorations.some((d) => d.position.x === 22 && d.position.y === 63)).toBe(false);
    expect(world.map.decorations.some((d) => d.position.x === 21 && d.position.y === 64)).toBe(true);
  });

  it("width expands a gentle ramp into parallel lower/upper columns", () => {
    const world = flatWorld();
    applyScenarioElevation(world.map, {
      patches: [{ area: { kind: "rect", x: 20, y: 58, width: 5, height: 5 }, level: 1 }],
      slopes: [{ position: { x: 21, y: 64 }, toward: "N", width: 2, length: 2 }]
    });
    for (const x of [21, 22]) {
      expect(getCell(world, { x, y: 64 }).slopeHalf).toBe("lower");
      expect(getCell(world, { x, y: 63 }).slopeHalf).toBe("upper");
    }
    expect(getCell(world, { x: 23, y: 64 }).slope).toBeNull();
  });
});

describe("scenario vocabulary: minimal hill-fort test scenario", () => {
  // Test-only scenario exercising the full elevation vocabulary: a two-level
  // ishigaki terrace with a ramped approach road, buildings on top.
  const hillFortScenario: ScenarioDefinition = {
    id: "test-hill-fort",
    name: "テスト山城",
    elevation: {
      patches: [
        { area: { kind: "rect", x: 18, y: 56, width: 12, height: 10 }, level: 1 },
        { area: { kind: "rect", x: 20, y: 58, width: 6, height: 5 }, level: 2, skin: "ishigaki" }
      ],
      slopes: [
        { position: { x: 23, y: 66 }, toward: "N", width: 2 }, // 0 -> 1 approach
        { position: { x: 22, y: 63 }, toward: "N" } // 1 -> 2 koguchi
      ]
    },
    initialBuildings: [
      { type: "honmaru", position: { x: 22, y: 60 } },
      // Storehouse placed at x=27 (3-wide footprint: 27..29, 57..59) to stay
      // clear of the cliff cells that appear at x=26, y=58..62 (E boundary of
      // the level-2 ishigaki terrace inserted by insertCliffCells).
      { type: "storehouse", position: { x: 27, y: 57 } }
    ],
    initialUnits: [
      { type: "spear_ashigaru", position: { x: 22, y: 60 }, owner: "player" },
      { type: "spear_ashigaru", position: { x: 23, y: 70 }, owner: "enemy" }
    ],
    waves: [],
    victory: { holdTicks: null }
  };

  it("boots and applies the declared elevation", () => {
    const world = createInitialWorld(hillFortScenario);
    expect(elevationAt(world, { x: 19, y: 57 })).toBe(1);
    expect(elevationAt(world, { x: 22, y: 60 })).toBe(2);
    expect(getCell(world, { x: 22, y: 60 }).elevationSkin).toBe("ishigaki");
    expect(getCell(world, { x: 23, y: 66 }).slope).toBe("N");
    expect(getCell(world, { x: 24, y: 66 }).slope).toBe("N");
    expect(getCell(world, { x: 22, y: 63 }).slope).toBe("N");
  });

  it("snapshots carry elevation for cells, units and buildings", () => {
    const world = createInitialWorld(hillFortScenario);
    const snapshot = snapshotWorld(world);
    const cell = snapshot.map.cells.find((c) => c.coord.x === 22 && c.coord.y === 60);
    expect(cell?.elevation).toBe(2);
    expect(cell?.slope).toBeNull();
    const defender = snapshot.units.find((u) => u.owner === "player");
    expect(defender?.elevation).toBe(2);
    const honmaru = snapshot.buildings.find((b) => b.type === "honmaru");
    expect(honmaru?.elevation).toBe(2);
    // Flat cells stay at 0 so existing consumers see no behavioral change.
    const flatCell = snapshot.map.cells.find((c) => c.coord.x === 100 && c.coord.y === 100);
    expect(flatCell?.elevation).toBe(0);
  });

  it("the enemy climbs the ramps to reach the honmaru (500 ticks, no crash)", () => {
    const world = createInitialWorld(hillFortScenario);
    // Remove the defender so the honmaru is capturable.
    world.units = world.units.filter((unit) => unit.owner !== "player");
    let ticks = 0;
    while (world.outcome === null && ticks < 2000) {
      updateWorld(world);
      ticks += 1;
    }
    expect(world.outcome?.winner).toBe("enemy");
    expect(world.outcome?.reason).toBe("honmaru_fallen");
  });
});
