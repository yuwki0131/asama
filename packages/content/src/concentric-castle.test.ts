import { describe, expect, it } from "vitest";
import { concentricCastleScenario } from "./index";

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
  "musketeer", "cavalry", "supply_cart",
]);

describe("concentricCastleScenario", () => {
  it("has a non-empty id and name", () => {
    expect(concentricCastleScenario.id.length).toBeGreaterThan(0);
    expect(concentricCastleScenario.name.length).toBeGreaterThan(0);
  });

  it("all building types are valid BuildingType", () => {
    for (const b of concentricCastleScenario.initialBuildings) {
      expect(VALID_BUILDING_TYPES.has(b.type)).toBe(true);
    }
  });

  it("all building positions are within map bounds", () => {
    for (const b of concentricCastleScenario.initialBuildings) {
      expect(b.position.x).toBeGreaterThanOrEqual(0);
      expect(b.position.x).toBeLessThan(MAP_WIDTH);
      expect(b.position.y).toBeGreaterThanOrEqual(0);
      expect(b.position.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it("all unit types are valid UnitType", () => {
    for (const u of concentricCastleScenario.initialUnits) {
      expect(VALID_UNIT_TYPES.has(u.type)).toBe(true);
    }
  });

  it("all initial unit positions are within map bounds", () => {
    for (const u of concentricCastleScenario.initialUnits) {
      expect(u.position.x).toBeGreaterThanOrEqual(0);
      expect(u.position.x).toBeLessThan(MAP_WIDTH);
      expect(u.position.y).toBeGreaterThanOrEqual(0);
      expect(u.position.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it("has exactly 3 waves (introductory pace)", () => {
    expect(concentricCastleScenario.waves).toHaveLength(3);
  });

  it("wave ticks are strictly ascending", () => {
    const ticks = concentricCastleScenario.waves.map((w) => w.tick);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]!);
    }
  });

  it("all wave ticks are positive", () => {
    for (const wave of concentricCastleScenario.waves) {
      expect(wave.tick).toBeGreaterThan(0);
    }
  });

  it("all wave spawn types are valid UnitType", () => {
    for (const wave of concentricCastleScenario.waves) {
      for (const spawn of wave.spawns) {
        expect(VALID_UNIT_TYPES.has(spawn.type)).toBe(true);
      }
    }
  });

  it("all wave spawn positions are within map bounds", () => {
    for (const wave of concentricCastleScenario.waves) {
      for (const spawn of wave.spawns) {
        expect(spawn.position.x).toBeGreaterThanOrEqual(0);
        expect(spawn.position.x).toBeLessThan(MAP_WIDTH);
        expect(spawn.position.y).toBeGreaterThanOrEqual(0);
        expect(spawn.position.y).toBeLessThan(MAP_HEIGHT);
      }
    }
  });

  it("has exactly one honmaru", () => {
    const honmarues = concentricCastleScenario.initialBuildings.filter(
      (b) => b.type === "honmaru"
    );
    expect(honmarues).toHaveLength(1);
  });

  it("has exactly one tenshu", () => {
    const tenshu = concentricCastleScenario.initialBuildings.filter(
      (b) => b.type === "tenshu"
    );
    expect(tenshu).toHaveLength(1);
  });

  it("has water_moat ring (concentric moat feature)", () => {
    const moats = concentricCastleScenario.initialBuildings.filter(
      (b) => b.type === "water_moat"
    );
    expect(moats.length).toBeGreaterThanOrEqual(4);
  });

  it("has earth_bridge crossing the water moat", () => {
    const bridges = concentricCastleScenario.initialBuildings.filter(
      (b) => b.type === "earth_bridge"
    );
    expect(bridges.length).toBeGreaterThanOrEqual(1);
  });

  it("has supply_cart in every wave (retreat-timer teaching)", () => {
    for (const wave of concentricCastleScenario.waves) {
      const types = wave.spawns.map((s) => s.type);
      expect(types).toContain("supply_cart");
    }
  });

  it("victory holdTicks is positive", () => {
    const { holdTicks } = concentricCastleScenario.victory;
    if (holdTicks !== null) {
      expect(holdTicks).toBeGreaterThan(0);
    }
  });

  it("has player units", () => {
    const playerUnits = concentricCastleScenario.initialUnits.filter(
      (u) => u.owner === "player"
    );
    expect(playerUnits.length).toBeGreaterThan(0);
  });
});
