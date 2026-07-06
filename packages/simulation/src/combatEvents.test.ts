import { describe, expect, it } from "vitest";
import type { CombatEventSnapshot, ScenarioDefinition } from "@asama/shared";
import { buildingDefinitions, createBuildingState } from "./buildings";
import { applyScenarioElevation } from "./elevation";
import { createUnit } from "./units";
import { createInitialWorld, snapshotWorld, updateWorld } from "./world";
import type { WorldState } from "./types";

// All test coordinates live in a grass-only region of the procedural map
// (away from the river y~41, the stone ridge x~84 and the dirt zone).
const FLAT_SCENARIO: ScenarioDefinition = {
  id: "test-combat-events",
  name: "test combat events",
  initialBuildings: [],
  initialUnits: [],
  waves: [],
  victory: { holdTicks: null }
};

function flatWorld(): WorldState {
  return createInitialWorld(FLAT_SCENARIO);
}

/** Takes a snapshot (draining the event buffer) and returns its events. */
function takeEvents(world: WorldState): readonly CombatEventSnapshot[] {
  const snapshot = snapshotWorld(world, { includeMapCells: false });
  expect(snapshot.events).toBeDefined();
  return snapshot.events ?? [];
}

function ofKind<K extends CombatEventSnapshot["kind"]>(
  events: readonly CombatEventSnapshot[],
  kind: K
): Extract<CombatEventSnapshot, { kind: K }>[] {
  return events.filter((event): event is Extract<CombatEventSnapshot, { kind: K }> => event.kind === kind);
}

describe("combat event snapshots", () => {
  it("melee attack emits attack_melee plus paired damage exactly once", () => {
    const world = flatWorld();
    const attacker = createUnit("unit:test:spear", "player", "spear_ashigaru", { x: 20, y: 60 });
    const target = createUnit("unit:test:enemy", "enemy", "spear_ashigaru", { x: 21, y: 60 });
    target.attackCooldownRemaining = 9999; // the enemy must not counter-attack
    world.units.push(attacker, target);

    updateWorld(world);
    const events = takeEvents(world);

    expect(events).toHaveLength(2);
    const [melee] = ofKind(events, "attack_melee");
    expect(melee).toEqual({
      kind: "attack_melee",
      tick: 0,
      attackerId: "unit:test:spear",
      attackerOwner: "player",
      unitType: "spear_ashigaru",
      attackerPos: { x: 20, y: 60 },
      targetId: "unit:test:enemy",
      targetBuildingId: null,
      targetPos: { x: 21, y: 60 },
      highGround: false
    });
    const [damage] = ofKind(events, "damage");
    expect(damage).toEqual({
      kind: "damage",
      tick: 0,
      attackerId: "unit:test:spear",
      targetId: "unit:test:enemy",
      targetBuildingId: null,
      targetPos: { x: 21, y: 60 },
      amount: 14
    });

    // Drained on snapshot: the consumer receives each event exactly once.
    expect(takeEvents(world)).toHaveLength(0);
  });

  it("ticks without combat produce an empty events array", () => {
    const world = flatWorld();
    world.units.push(
      createUnit("unit:test:a", "player", "spear_ashigaru", { x: 20, y: 60 }),
      createUnit("unit:test:b", "enemy", "spear_ashigaru", { x: 35, y: 72 })
    );

    updateWorld(world);

    expect(takeEvents(world)).toHaveLength(0);
  });

  it("archer shots emit attack_ranged with unitType archer", () => {
    const world = flatWorld();
    const archer = createUnit("unit:test:archer", "player", "archer", { x: 20, y: 60 });
    const target = createUnit("unit:test:enemy", "enemy", "spear_ashigaru", { x: 26, y: 60 });
    world.units.push(archer, target);

    updateWorld(world);
    const events = takeEvents(world);

    const ranged = ofKind(events, "attack_ranged");
    expect(ranged).toHaveLength(1);
    expect(ranged[0]).toMatchObject({
      attackerId: "unit:test:archer",
      unitType: "archer",
      attackerPos: { x: 20, y: 60 },
      targetId: "unit:test:enemy",
      targetBuildingId: null,
      targetPos: { x: 26, y: 60 },
      highGround: false,
      tick: 0
    });
    // archer→spear affinity 1.25: 12 * 1.25 = 15
    const damage = ofKind(events, "damage");
    expect(damage).toHaveLength(1);
    expect(damage[0]?.amount).toBe(15);
    expect(ofKind(events, "attack_melee")).toHaveLength(0);
  });

  it("musketeer shots emit attack_ranged with unitType musketeer", () => {
    const world = flatWorld();
    const musketeer = createUnit("unit:test:musketeer", "player", "musketeer", { x: 20, y: 60 });
    const target = createUnit("unit:test:enemy", "enemy", "spear_ashigaru", { x: 24, y: 60 });
    world.units.push(musketeer, target);

    updateWorld(world);
    const events = takeEvents(world);

    const ranged = ofKind(events, "attack_ranged");
    expect(ranged).toHaveLength(1);
    expect(ranged[0]?.unitType).toBe("musketeer");
    expect(ranged[0]?.highGround).toBe(false);
    // musketeer→spear affinity 1.25: 20 * 1.25 = 25
    expect(ofKind(events, "damage")[0]?.amount).toBe(25);
  });

  it("flags highGround when the elevation bonus fires (PR#24 high ground)", () => {
    const world = flatWorld();
    applyScenarioElevation(world.map, {
      patches: [{ area: { kind: "rect", x: 20, y: 58, width: 5, height: 5 }, level: 1 }]
    });
    // Plateau archer at distance 9: in range only thanks to the +1 high-ground
    // bonus; the flat archer (base range 8) cannot answer.
    const high = createUnit("unit:test:high", "player", "archer", { x: 24, y: 60 });
    const low = createUnit("unit:test:low", "enemy", "archer", { x: 33, y: 60 });
    world.units.push(high, low);

    updateWorld(world);
    const events = takeEvents(world);

    const ranged = ofKind(events, "attack_ranged");
    expect(ranged).toHaveLength(1);
    expect(ranged[0]?.attackerId).toBe("unit:test:high");
    expect(ranged[0]?.highGround).toBe(true);
    // 12 * 1.25 high-ground multiplier = 15
    expect(ofKind(events, "damage")[0]?.amount).toBe(15);
  });

  it("a killing blow emits unit_died exactly once alongside the attack", () => {
    const world = flatWorld();
    const attacker = createUnit("unit:test:spear", "player", "spear_ashigaru", { x: 20, y: 60 });
    const victim = createUnit("unit:test:victim", "enemy", "cavalry", { x: 21, y: 60 });
    victim.hp = 5;
    victim.attackCooldownRemaining = 9999;
    world.units.push(attacker, victim);

    updateWorld(world);
    const events = takeEvents(world);

    expect(ofKind(events, "attack_melee")).toHaveLength(1);
    expect(ofKind(events, "damage")).toHaveLength(1);
    const died = ofKind(events, "unit_died");
    expect(died).toHaveLength(1);
    expect(died[0]).toEqual({
      kind: "unit_died",
      tick: 0,
      unitId: "unit:test:victim",
      unitType: "cavalry",
      owner: "enemy",
      position: { x: 21, y: 60 }
    });
    // The dead unit is gone from the same snapshot's unit list.
    expect(world.units.some((unit) => unit.id === "unit:test:victim")).toBe(false);

    updateWorld(world);
    expect(takeEvents(world)).toHaveLength(0);
  });

  it("destroying a building emits building_destroyed exactly once", () => {
    const world = flatWorld();
    const fence = createBuildingState(world, "fence", { x: 30, y: 60 }, buildingDefinitions.fence, "enemy");
    fence.hp = 5;
    world.buildings.push(fence);
    const attacker = createUnit("unit:test:spear", "player", "spear_ashigaru", { x: 29, y: 60 });
    attacker.attackTargetId = fence.id;
    world.units.push(attacker);

    updateWorld(world);
    const events = takeEvents(world);

    const melee = ofKind(events, "attack_melee");
    expect(melee).toHaveLength(1);
    expect(melee[0]?.targetId).toBeNull();
    expect(melee[0]?.targetBuildingId).toBe(fence.id);
    const damage = ofKind(events, "damage");
    expect(damage).toHaveLength(1);
    expect(damage[0]?.targetBuildingId).toBe(fence.id);
    expect(damage[0]?.amount).toBe(14);
    const destroyed = ofKind(events, "building_destroyed");
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toEqual({
      kind: "building_destroyed",
      tick: 0,
      buildingId: fence.id,
      buildingType: "fence",
      owner: "enemy",
      position: { x: 30, y: 60 },
      footprint: [{ x: 30, y: 60 }]
    });
    expect(ofKind(events, "unit_died")).toHaveLength(0);
    // The destroyed building is gone from the same snapshot's building list.
    expect(world.buildings.some((building) => building.id === fence.id)).toBe(false);

    updateWorld(world);
    expect(takeEvents(world)).toHaveLength(0);
  });

  it("buffers events across ticks until the next snapshot (2-tick cadence)", () => {
    const world = flatWorld();
    const first = createUnit("unit:test:first", "player", "spear_ashigaru", { x: 20, y: 60 });
    const second = createUnit("unit:test:second", "player", "spear_ashigaru", { x: 22, y: 60 });
    // Cooldown ticks down at the start of each combat update, so 2 means the
    // unit becomes ready (and fires) on the second tick.
    second.attackCooldownRemaining = 2;
    const target = createUnit("unit:test:enemy", "enemy", "spear_ashigaru", { x: 21, y: 60 });
    target.attackCooldownRemaining = 9999;
    world.units.push(first, second, target);

    updateWorld(world);
    updateWorld(world);
    const events = takeEvents(world);

    const melee = ofKind(events, "attack_melee");
    expect(melee.map((event) => [event.attackerId, event.tick])).toEqual([
      ["unit:test:first", 0],
      ["unit:test:second", 1]
    ]);
    expect(ofKind(events, "damage")).toHaveLength(2);
    expect(takeEvents(world)).toHaveLength(0);
  });
});
