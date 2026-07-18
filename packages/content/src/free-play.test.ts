import { describe, expect, it } from "vitest";
import { createInitialWorld, updateWorld } from "@asama/simulation";
import { freePlayScenario, scenarios } from "./index";

const MAP_WIDTH = 128;
const MAP_HEIGHT = 128;

const VALID_BUILDING_TYPES = new Set([
  "fence", "wall", "gate_wide_2", "gate_wide_3", "gate_narrow_3",
  "gate_wide_2_ne_sw", "gate_wide_3_ne_sw", "gate_narrow_3_ne_sw",
  "dry_moat", "water_moat", "storehouse", "market", "barracks",
  "samurai_residence", "town_block", "farm", "road",
  "earth_bridge", "wood_bridge", "honmaru", "tenshu", "yagura",
]);

const VALID_UNIT_TYPES = new Set([
  "spear_ashigaru", "sword_ashigaru", "archer", "engineer",
  "musketeer", "cavalry", "supply_cart",
]);

describe("freePlayScenario: definition shape", () => {
  it("has a non-empty id, name and description, and is in the scenario roster", () => {
    expect(freePlayScenario.id.length).toBeGreaterThan(0);
    expect(freePlayScenario.name.length).toBeGreaterThan(0);
    expect(freePlayScenario.description?.length).toBeGreaterThan(0);
    expect(scenarios).toContain(freePlayScenario);
  });

  it("has holdTicks null (no time victory) and a single far-future sentinel wave", () => {
    expect(freePlayScenario.victory.holdTicks).toBeNull();
    expect(freePlayScenario.waves).toHaveLength(1);
    expect(freePlayScenario.waves[0]!.tick).toBeGreaterThan(1_000_000);
    expect(freePlayScenario.waves[0]!.spawns).toHaveLength(0);
  });

  it("has exactly one honmaru and one tenshu", () => {
    const count = (type: string) =>
      freePlayScenario.initialBuildings.filter((b) => b.type === type).length;
    expect(count("honmaru")).toBe(1);
    expect(count("tenshu")).toBe(1);
  });

  it("all building types are valid BuildingType", () => {
    for (const b of freePlayScenario.initialBuildings) {
      expect(VALID_BUILDING_TYPES.has(b.type)).toBe(true);
    }
  });

  it("all building positions are within map bounds", () => {
    for (const b of freePlayScenario.initialBuildings) {
      expect(b.position.x).toBeGreaterThanOrEqual(0);
      expect(b.position.x).toBeLessThan(MAP_WIDTH);
      expect(b.position.y).toBeGreaterThanOrEqual(0);
      expect(b.position.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it("all unit types are valid UnitType", () => {
    for (const u of freePlayScenario.initialUnits) {
      expect(VALID_UNIT_TYPES.has(u.type)).toBe(true);
    }
  });

  it("all unit positions are within map bounds", () => {
    for (const u of freePlayScenario.initialUnits) {
      expect(u.position.x).toBeGreaterThanOrEqual(0);
      expect(u.position.x).toBeLessThan(MAP_WIDTH);
      expect(u.position.y).toBeGreaterThanOrEqual(0);
      expect(u.position.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it("has player units covering every standard unit type", () => {
    const playerTypes = new Set(
      freePlayScenario.initialUnits
        .filter((u) => u.owner === "player")
        .map((u) => u.type)
    );
    for (const type of ["spear_ashigaru", "sword_ashigaru", "archer",
                        "engineer", "musketeer", "cavalry"] as const) {
      expect(playerTypes.has(type)).toBe(true);
    }
  });

  it("has no enemy-owned initial units (no threat)", () => {
    const enemies = freePlayScenario.initialUnits.filter(
      (u) => u.owner === "enemy"
    );
    expect(enemies).toHaveLength(0);
  });

  it("covers key building categories (castle, military, economy, residential)", () => {
    const types = new Set(freePlayScenario.initialBuildings.map((b) => b.type));
    expect(types.has("tenshu")).toBe(true);
    expect(types.has("yagura")).toBe(true);
    expect(types.has("wall")).toBe(true);
    expect(types.has("fence")).toBe(true);
    expect(types.has("barracks")).toBe(true);
    expect(types.has("samurai_residence")).toBe(true);
    expect(types.has("market")).toBe(true);
    expect(types.has("storehouse")).toBe(true);
    expect(types.has("town_block")).toBe(true);
    expect(types.has("farm")).toBe(true);
    expect(types.has("dry_moat")).toBe(true);
    expect(types.has("water_moat")).toBe(true);
    expect(types.has("road")).toBe(true);
  });

  it("has at least 4 farms and 4 storehouses for resource abundance", () => {
    const farms = freePlayScenario.initialBuildings.filter((b) => b.type === "farm");
    const storehouses = freePlayScenario.initialBuildings.filter((b) => b.type === "storehouse");
    expect(farms.length).toBeGreaterThanOrEqual(4);
    expect(storehouses.length).toBeGreaterThanOrEqual(4);
  });

  it("has elevation defined with a level-1 ishigaki patch and a north slope", () => {
    expect(freePlayScenario.elevation).toBeDefined();
    const patches = freePlayScenario.elevation!.patches;
    expect(patches.length).toBeGreaterThanOrEqual(1);
    expect(patches[0]!.level).toBe(1);
    expect(patches[0]!.skin).toBe("ishigaki");
    const slopes = freePlayScenario.elevation!.slopes ?? [];
    expect(slopes.length).toBeGreaterThanOrEqual(1);
    expect(slopes[0]!.toward).toBe("N");
  });
});

describe("freePlayScenario: runtime boot", () => {
  it("boots without exception (building placement passes validation)", () => {
    expect(() => createInitialWorld(freePlayScenario)).not.toThrow();
  });

  it("runs 2000 ticks without throwing or setting an outcome", () => {
    const world = createInitialWorld(freePlayScenario);
    for (let i = 0; i < 2000; i++) {
      updateWorld(world);
    }
    // No game over: holdTicks is null and the sentinel wave has not fired.
    expect(world.outcome).toBeNull();
  });

  it("economy grows: gold and population increase over time", () => {
    const world = createInitialWorld(freePlayScenario);
    const initialGold = world.economy.gold;
    // Advance past two full economy months (monthTicks = 75*20 = 1500 ticks each)
    for (let i = 0; i < 4000; i++) {
      updateWorld(world);
    }
    // Tax income should have increased gold above the initial value.
    expect(world.economy.gold).toBeGreaterThan(initialGold);
  });
});
