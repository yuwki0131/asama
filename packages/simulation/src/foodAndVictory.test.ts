import { describe, expect, it } from "vitest";
import {
  FOOD_BALANCE,
  createInitialWorld,
  deserializeWorld,
  serializeWorld,
  snapshotWorld,
  updateWorld,
  type WorldState
} from "./index";

function storehouses(world: WorldState) {
  return world.buildings.filter((building) => building.type === "storehouse");
}

describe("food supply", () => {
  it("connects the initial storehouse to the honmaru", () => {
    const world = createInitialWorld();
    updateWorld(world);
    expect(world.food.connectedStorehouseIds).toContain(storehouses(world)[0]?.id);
  });

  it("consumes food from connected storehouses at the consumption cycle", () => {
    const world = createInitialWorld();
    world.food.nextConsumptionTick = 1;
    const before = storehouses(world)[0]?.food ?? 0;
    const defenders = world.units.filter((unit) => unit.owner === "player").length;

    updateWorld(world);
    updateWorld(world);

    const after = storehouses(world)[0]?.food ?? 0;
    expect(after).toBe(before - defenders * FOOD_BALANCE.foodPerUnitPerCycle);
    expect(world.outcome).toBeNull();
  });

  it("declares starvation defeat when the cycle cannot be paid", () => {
    const world = createInitialWorld();
    for (const storehouse of storehouses(world)) {
      storehouse.food = 0;
    }
    world.food.nextConsumptionTick = 1;

    updateWorld(world);
    updateWorld(world);

    expect(world.outcome).toEqual({ winner: "enemy", reason: "starvation", tick: 1 });
  });

  it("does not draw food from a disconnected storehouse", () => {
    const world = createInitialWorld();
    updateWorld(world);
    world.food.connectedStorehouseIds = [];
    // Freeze connectivity so the manual disconnection persists through the cycle.
    world.food.nextConnectivityCheckTick = Number.MAX_SAFE_INTEGER;
    world.food.nextConsumptionTick = world.currentTick + 1;

    updateWorld(world);
    updateWorld(world);

    expect(world.outcome?.winner).toBe("enemy");
    expect(world.outcome?.reason).toBe("starvation");
    expect(storehouses(world)[0]?.food).toBe(FOOD_BALANCE.storehouseInitialFood);
  });
});

describe("victory and defeat", () => {
  it("falls the honmaru when only enemy combat units stand inside", () => {
    const world = createInitialWorld();
    const honmaru = world.buildings.find((building) => building.type === "honmaru");
    expect(honmaru).toBeDefined();
    const enemy = world.units.find((unit) => unit.owner === "enemy");
    expect(enemy).toBeDefined();
    if (honmaru === undefined || enemy === undefined) {
      return;
    }

    // Pull every defender away from the keep first; the initial layout
    // garrisons a unit on the honmaru cell, which blocks capture.
    for (const unit of world.units) {
      if (unit.owner === "player") {
        unit.position = { x: 40, y: 40 };
      }
    }
    enemy.position = honmaru.position;
    updateWorld(world);

    expect(world.outcome?.winner).toBe("enemy");
    expect(world.outcome?.reason).toBe("honmaru_fallen");
  });

  it("does not fall the honmaru while a defender stands inside", () => {
    const world = createInitialWorld();
    const honmaru = world.buildings.find((building) => building.type === "honmaru");
    const enemy = world.units.find((unit) => unit.owner === "enemy");
    const defender = world.units.find((unit) => unit.owner === "player");
    if (honmaru === undefined || enemy === undefined || defender === undefined) {
      expect.unreachable();
      return;
    }

    enemy.position = honmaru.position;
    defender.position = honmaru.position;
    updateWorld(world);

    expect(world.outcome).toBeNull();
  });

  it("grants defender victory when all enemies are annihilated", () => {
    const world = createInitialWorld();
    world.units = world.units.filter((unit) => unit.owner !== "enemy");

    updateWorld(world);
    updateWorld(world);

    expect(world.outcome?.winner).toBe("player");
    expect(world.outcome?.reason).toBe("enemy_annihilated");
  });

  it("freezes the world once an outcome is decided", () => {
    const world = createInitialWorld();
    world.units = world.units.filter((unit) => unit.owner !== "enemy");
    updateWorld(world);
    updateWorld(world);
    const decidedTick = world.currentTick;

    updateWorld(world);

    expect(world.currentTick).toBe(decidedTick);
  });
});

describe("enemy AI", () => {
  it("orders idle enemies toward the honmaru or a target on the first decision tick", () => {
    const world = createInitialWorld();
    updateWorld(world);

    for (const unit of world.units) {
      if (unit.owner !== "enemy") {
        continue;
      }
      expect(unit.path.length > 0 || unit.attackTargetId !== null).toBe(true);
    }
  });

  it("engages a defender inside aggro range", () => {
    const world = createInitialWorld();
    const enemy = world.units.find((unit) => unit.owner === "enemy");
    const defender = world.units.find((unit) => unit.owner === "player");
    if (enemy === undefined || defender === undefined) {
      expect.unreachable();
      return;
    }

    enemy.position = { x: defender.position.x + 3, y: defender.position.y };
    updateWorld(world);

    // The AI picks the nearest defender; asserting on ownership keeps the
    // test independent of the exact initial unit layout.
    const target = world.units.find((unit) => unit.id === enemy.attackTargetId);
    expect(target?.owner).toBe("player");
  });
});

describe("save and load", () => {
  it("round-trips the world and stays deterministic", () => {
    const original = createInitialWorld();
    for (let i = 0; i < 25; i += 1) {
      updateWorld(original);
    }

    const restored = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(original))));
    expect(snapshotWorld(restored)).toEqual(snapshotWorld(original));

    for (let i = 0; i < 50; i += 1) {
      updateWorld(original);
      updateWorld(restored);
    }
    expect(snapshotWorld(restored)).toEqual(snapshotWorld(original));
  });

  it("rejects malformed payloads", () => {
    expect(() => deserializeWorld({ version: 999, world: {} })).toThrow();
    expect(() => deserializeWorld({ version: 1, world: { nope: true } })).toThrow();
  });
});
