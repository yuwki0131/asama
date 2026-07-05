import { describe, expect, it } from "vitest";
import { linearFortressScenario } from "./index";

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

describe("linearFortressScenario", () => {
  it("has a non-empty id and name", () => {
    expect(linearFortressScenario.id.length).toBeGreaterThan(0);
    expect(linearFortressScenario.name.length).toBeGreaterThan(0);
  });

  it("all building types are valid BuildingType", () => {
    for (const b of linearFortressScenario.initialBuildings) {
      expect(VALID_BUILDING_TYPES.has(b.type)).toBe(true);
    }
  });

  it("all building positions are within map bounds", () => {
    for (const b of linearFortressScenario.initialBuildings) {
      expect(b.position.x).toBeGreaterThanOrEqual(0);
      expect(b.position.x).toBeLessThan(MAP_WIDTH);
      expect(b.position.y).toBeGreaterThanOrEqual(0);
      expect(b.position.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it("all unit types are valid UnitType", () => {
    for (const u of linearFortressScenario.initialUnits) {
      expect(VALID_UNIT_TYPES.has(u.type)).toBe(true);
    }
  });

  it("all initial unit positions are within map bounds", () => {
    for (const u of linearFortressScenario.initialUnits) {
      expect(u.position.x).toBeGreaterThanOrEqual(0);
      expect(u.position.x).toBeLessThan(MAP_WIDTH);
      expect(u.position.y).toBeGreaterThanOrEqual(0);
      expect(u.position.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it("has exactly 4 waves (standard difficulty)", () => {
    expect(linearFortressScenario.waves).toHaveLength(4);
  });

  it("wave ticks are strictly ascending", () => {
    const ticks = linearFortressScenario.waves.map((w) => w.tick);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]!);
    }
  });

  it("all wave ticks are positive", () => {
    for (const wave of linearFortressScenario.waves) {
      expect(wave.tick).toBeGreaterThan(0);
    }
  });

  it("all wave spawn types are valid UnitType", () => {
    for (const wave of linearFortressScenario.waves) {
      for (const spawn of wave.spawns) {
        expect(VALID_UNIT_TYPES.has(spawn.type)).toBe(true);
      }
    }
  });

  it("all wave spawn positions are within map bounds", () => {
    for (const wave of linearFortressScenario.waves) {
      for (const spawn of wave.spawns) {
        expect(spawn.position.x).toBeGreaterThanOrEqual(0);
        expect(spawn.position.x).toBeLessThan(MAP_WIDTH);
        expect(spawn.position.y).toBeGreaterThanOrEqual(0);
        expect(spawn.position.y).toBeLessThan(MAP_HEIGHT);
      }
    }
  });

  it("has exactly one honmaru", () => {
    const honmarues = linearFortressScenario.initialBuildings.filter(
      (b) => b.type === "honmaru"
    );
    expect(honmarues).toHaveLength(1);
  });

  it("has exactly one tenshu", () => {
    const tenshu = linearFortressScenario.initialBuildings.filter(
      (b) => b.type === "tenshu"
    );
    expect(tenshu).toHaveLength(1);
  });

  it("has dry_moat between compounds (renkaku feature)", () => {
    const dryMoat = linearFortressScenario.initialBuildings.filter(
      (b) => b.type === "dry_moat"
    );
    expect(dryMoat.length).toBeGreaterThanOrEqual(4);
  });

  it("has earth_bridge crossing the dry moat", () => {
    const bridges = linearFortressScenario.initialBuildings.filter(
      (b) => b.type === "earth_bridge"
    );
    expect(bridges.length).toBeGreaterThanOrEqual(1);
  });

  it("has cavalry in later waves (cavalry mechanic introduction)", () => {
    const lateWaveTypes = linearFortressScenario.waves
      .slice(2)
      .flatMap((w) => w.spawns.map((s) => s.type));
    expect(lateWaveTypes).toContain("cavalry");
  });

  it("has supply_cart in waves from wave 1 onwards", () => {
    for (const wave of linearFortressScenario.waves) {
      const types = wave.spawns.map((s) => s.type);
      expect(types).toContain("supply_cart");
    }
  });

  it("has multi-direction spawns from wave 2 (north + south)", () => {
    // From wave 2, some spawns should come from south (y >= 90) to model flanking
    const wave2 = linearFortressScenario.waves[1]!;
    const southSpawns = wave2.spawns.filter((s) => s.position.y >= 90);
    expect(southSpawns.length).toBeGreaterThan(0);
  });

  it("victory holdTicks is positive", () => {
    const { holdTicks } = linearFortressScenario.victory;
    if (holdTicks !== null) {
      expect(holdTicks).toBeGreaterThan(0);
    }
  });

  it("has player units", () => {
    const playerUnits = linearFortressScenario.initialUnits.filter(
      (u) => u.owner === "player"
    );
    expect(playerUnits.length).toBeGreaterThan(0);
  });
});
