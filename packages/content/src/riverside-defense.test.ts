import { describe, expect, it } from "vitest";
import { riversideDefenseScenario } from "./index";

const MAP_WIDTH = 128;
const MAP_HEIGHT = 128;

const VALID_BUILDING_TYPES = new Set([
  "fence", "wall", "gate", "gate_wide_2", "gate_wide_3",
  "gate_ne_sw", "gate_wide_2_ne_sw", "gate_wide_3_ne_sw",
  "dry_moat", "water_moat", "storehouse", "market", "barracks",
  "samurai_residence", "town_block", "farm", "road",
  "earth_bridge", "wood_bridge", "honmaru", "tenshu", "yagura",
]);

const VALID_UNIT_TYPES = new Set([
  "spear_ashigaru", "sword_ashigaru", "archer", "engineer",
]);

describe("riversideDefenseScenario", () => {
  it("has a non-empty id and name", () => {
    expect(riversideDefenseScenario.id.length).toBeGreaterThan(0);
    expect(riversideDefenseScenario.name.length).toBeGreaterThan(0);
  });

  it("all building types are valid BuildingType", () => {
    for (const b of riversideDefenseScenario.initialBuildings) {
      expect(VALID_BUILDING_TYPES.has(b.type)).toBe(true);
    }
  });

  it("all building positions are within map bounds", () => {
    for (const b of riversideDefenseScenario.initialBuildings) {
      expect(b.position.x).toBeGreaterThanOrEqual(0);
      expect(b.position.x).toBeLessThan(MAP_WIDTH);
      expect(b.position.y).toBeGreaterThanOrEqual(0);
      expect(b.position.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it("all unit types are valid UnitType", () => {
    for (const u of riversideDefenseScenario.initialUnits) {
      expect(VALID_UNIT_TYPES.has(u.type)).toBe(true);
    }
  });

  it("all initial unit positions are within map bounds", () => {
    for (const u of riversideDefenseScenario.initialUnits) {
      expect(u.position.x).toBeGreaterThanOrEqual(0);
      expect(u.position.x).toBeLessThan(MAP_WIDTH);
      expect(u.position.y).toBeGreaterThanOrEqual(0);
      expect(u.position.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it("has between 3 and 5 waves", () => {
    const count = riversideDefenseScenario.waves.length;
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(5);
  });

  it("wave ticks are strictly ascending", () => {
    const ticks = riversideDefenseScenario.waves.map((w) => w.tick);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]!);
    }
  });

  it("all wave ticks are positive", () => {
    for (const wave of riversideDefenseScenario.waves) {
      expect(wave.tick).toBeGreaterThan(0);
    }
  });

  it("all wave spawn types are valid UnitType", () => {
    for (const wave of riversideDefenseScenario.waves) {
      for (const spawn of wave.spawns) {
        expect(VALID_UNIT_TYPES.has(spawn.type)).toBe(true);
      }
    }
  });

  it("all wave spawn positions are within map bounds", () => {
    for (const wave of riversideDefenseScenario.waves) {
      for (const spawn of wave.spawns) {
        expect(spawn.position.x).toBeGreaterThanOrEqual(0);
        expect(spawn.position.x).toBeLessThan(MAP_WIDTH);
        expect(spawn.position.y).toBeGreaterThanOrEqual(0);
        expect(spawn.position.y).toBeLessThan(MAP_HEIGHT);
      }
    }
  });

  it("has exactly one honmaru", () => {
    const honmarues = riversideDefenseScenario.initialBuildings.filter(
      (b) => b.type === "honmaru"
    );
    expect(honmarues).toHaveLength(1);
  });

  it("has exactly one tenshu", () => {
    const tenshu = riversideDefenseScenario.initialBuildings.filter(
      (b) => b.type === "tenshu"
    );
    expect(tenshu).toHaveLength(1);
  });

  it("has at least one water_moat (river feature)", () => {
    const moats = riversideDefenseScenario.initialBuildings.filter(
      (b) => b.type === "water_moat"
    );
    expect(moats.length).toBeGreaterThanOrEqual(1);
  });

  it("has at least one bridge (crossing point)", () => {
    const bridges = riversideDefenseScenario.initialBuildings.filter(
      (b) => b.type === "wood_bridge" || b.type === "earth_bridge"
    );
    expect(bridges.length).toBeGreaterThanOrEqual(1);
  });

  it("victory holdTicks is positive", () => {
    const { holdTicks } = riversideDefenseScenario.victory;
    if (holdTicks !== null) {
      expect(holdTicks).toBeGreaterThan(0);
    }
  });

  it("has player units", () => {
    const playerUnits = riversideDefenseScenario.initialUnits.filter(
      (u) => u.owner === "player"
    );
    expect(playerUnits.length).toBeGreaterThan(0);
  });
});
