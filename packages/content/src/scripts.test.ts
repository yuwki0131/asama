import { describe, expect, it } from "vitest";
import {
  concentricCastleScript,
  linearFortressScript,
  playthroughScripts,
  riversideDefenseScript,
  type PlaythroughScript,
} from "./scripts";

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

const VALID_OUTCOMES = new Set([
  "honmaru_fallen", "starvation", "enemy_annihilated", "time_held", "supply_cut",
]);

const VALID_OWNERS = new Set(["player", "enemy", "neutral"]);

/** Registers a suite of structural invariants for any PlaythroughScript. */
function validateScript(script: PlaythroughScript, label: string): void {
  it(`${label}: scenarioId is non-empty`, () => {
    expect(script.scenarioId.length).toBeGreaterThan(0);
  });

  it(`${label}: has at least one step`, () => {
    expect(script.steps.length).toBeGreaterThan(0);
  });

  it(`${label}: steps are sorted by atTick (non-decreasing)`, () => {
    for (let i = 1; i < script.steps.length; i++) {
      expect(script.steps[i]!.atTick).toBeGreaterThanOrEqual(script.steps[i - 1]!.atTick);
    }
  });

  it(`${label}: all atTick values are non-negative`, () => {
    for (const step of script.steps) {
      expect(step.atTick).toBeGreaterThanOrEqual(0);
    }
  });

  it(`${label}: placeBuilding actions reference valid BuildingType`, () => {
    for (const { action } of script.steps) {
      if (action.type === "placeBuilding") {
        expect(VALID_BUILDING_TYPES.has(action.buildingType)).toBe(true);
      }
    }
  });

  it(`${label}: placeBuilding positions are within map bounds`, () => {
    for (const { action } of script.steps) {
      if (action.type === "placeBuilding") {
        expect(action.position.x).toBeGreaterThanOrEqual(0);
        expect(action.position.x).toBeLessThan(MAP_WIDTH);
        expect(action.position.y).toBeGreaterThanOrEqual(0);
        expect(action.position.y).toBeLessThan(MAP_HEIGHT);
      }
    }
  });

  it(`${label}: recruitUnit actions reference valid UnitType`, () => {
    for (const { action } of script.steps) {
      if (action.type === "recruitUnit") {
        expect(VALID_UNIT_TYPES.has(action.unitType)).toBe(true);
      }
    }
  });

  it(`${label}: moveUnits / attackMoveUnits destinations are within map bounds`, () => {
    for (const { action } of script.steps) {
      if (action.type === "moveUnits" || action.type === "attackMoveUnits") {
        expect(action.destination.x).toBeGreaterThanOrEqual(0);
        expect(action.destination.x).toBeLessThan(MAP_WIDTH);
        expect(action.destination.y).toBeGreaterThanOrEqual(0);
        expect(action.destination.y).toBeLessThan(MAP_HEIGHT);
      }
    }
  });

  it(`${label}: expectedOutcome.outcome is a valid GameOutcomeReason`, () => {
    if (script.expectedOutcome) {
      expect(VALID_OUTCOMES.has(script.expectedOutcome.outcome)).toBe(true);
    }
  });

  it(`${label}: expectedOutcome.winner is a valid OwnerId`, () => {
    if (script.expectedOutcome) {
      expect(VALID_OWNERS.has(script.expectedOutcome.winner)).toBe(true);
    }
  });

  it(`${label}: expectedOutcome.maxTick is positive`, () => {
    if (script.expectedOutcome) {
      expect(script.expectedOutcome.maxTick).toBeGreaterThan(0);
    }
  });

  it(`${label}: casualtyBand (if present) has min <= max`, () => {
    const band = script.expectedOutcome?.casualtyBand;
    if (band !== undefined) {
      expect(band.min).toBeLessThanOrEqual(band.max);
      expect(band.min).toBeGreaterThanOrEqual(0);
    }
  });
}

describe("PlaythroughScript structural invariants", () => {
  validateScript(concentricCastleScript, "concentricCastleScript");
  validateScript(linearFortressScript, "linearFortressScript");
  validateScript(riversideDefenseScript, "riversideDefenseScript");
});

describe("PlaythroughScript scenario-specific requirements", () => {
  it("playthroughScripts contains exactly 3 scripts", () => {
    expect(playthroughScripts).toHaveLength(3);
  });

  it("each script has a unique scenarioId", () => {
    const ids = playthroughScripts.map((s) => s.scenarioId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("script scenarioIds match the known scenario ids", () => {
    const ids = playthroughScripts.map((s) => s.scenarioId);
    expect(ids).toContain("concentric-castle");
    expect(ids).toContain("linear-fortress");
    expect(ids).toContain("riverside-defense");
  });

  // ---- Scenario A specifics -----------------------------------------------

  it("concentricCastleScript targets supply_cut victory (retreat-timer win)", () => {
    expect(concentricCastleScript.expectedOutcome?.outcome).toBe("supply_cut");
    expect(concentricCastleScript.expectedOutcome?.winner).toBe("player");
  });

  it("concentricCastleScript has attackTarget steps aimed at enemy supply_cart", () => {
    const attacksCart = concentricCastleScript.steps.some(
      ({ action }) =>
        action.type === "attackTarget" &&
        action.targetSelector.kind === "byUnitType" &&
        action.targetSelector.unitType === "supply_cart",
    );
    expect(attacksCart).toBe(true);
  });

  it("concentricCastleScript covers all 3 waves (has steps past tick 14999)", () => {
    const lastTick = Math.max(...concentricCastleScript.steps.map((step) => step.atTick));
    expect(lastTick).toBeGreaterThan(14999);
  });

  it("concentricCastleScript includes early wall reinforcement", () => {
    const earlyWalls = concentricCastleScript.steps.filter(
      ({ atTick, action }) =>
        atTick < 1000 &&
        action.type === "placeBuilding" &&
        action.buildingType === "wall",
    );
    expect(earlyWalls.length).toBeGreaterThanOrEqual(1);
  });

  it("concentricCastleScript includes food management (marketTrade)", () => {
    const trades = concentricCastleScript.steps.filter(
      ({ action }) => action.type === "marketTrade",
    );
    expect(trades.length).toBeGreaterThanOrEqual(1);
  });

  it("concentricCastleScript includes unit recruitment", () => {
    const recruits = concentricCastleScript.steps.filter(
      ({ action }) => action.type === "recruitUnit",
    );
    expect(recruits.length).toBeGreaterThanOrEqual(1);
  });

  // ---- Scenario B specifics -----------------------------------------------

  it("linearFortressScript covers wave 4 range (has steps past tick 14999)", () => {
    const lastTick = Math.max(...linearFortressScript.steps.map((step) => step.atTick));
    expect(lastTick).toBeGreaterThan(14999);
  });

  it("linearFortressScript expectedOutcome is time_held", () => {
    expect(linearFortressScript.expectedOutcome?.outcome).toBe("time_held");
    expect(linearFortressScript.expectedOutcome?.winner).toBe("player");
  });

  it("linearFortressScript handles two-front waves (has steps spread over tick 6000–12000)", () => {
    const dualFrontSteps = linearFortressScript.steps.filter(
      ({ atTick }) => atTick >= 6000 && atTick <= 12000,
    );
    expect(dualFrontSteps.length).toBeGreaterThan(0);
  });

  // ---- Scenario C specifics -----------------------------------------------

  it("riversideDefenseScript covers wave 5 range (has steps past tick 17999)", () => {
    const lastTick = Math.max(...riversideDefenseScript.steps.map((step) => step.atTick));
    expect(lastTick).toBeGreaterThan(17999);
  });

  it("riversideDefenseScript expectedOutcome is time_held", () => {
    expect(riversideDefenseScript.expectedOutcome?.outcome).toBe("time_held");
    expect(riversideDefenseScript.expectedOutcome?.winner).toBe("player");
  });

  it("riversideDefenseScript recruits engineer (bridge defense key unit)", () => {
    const engineerRecruits = riversideDefenseScript.steps.filter(
      ({ action }) =>
        action.type === "recruitUnit" && action.unitType === "engineer",
    );
    expect(engineerRecruits.length).toBeGreaterThanOrEqual(1);
  });

  it("riversideDefenseScript attacks supply carts (dual-cart wave mechanic)", () => {
    const cartAttacks = riversideDefenseScript.steps.filter(
      ({ action }) =>
        action.type === "attackTarget" &&
        action.targetSelector.kind === "byUnitType" &&
        action.targetSelector.unitType === "supply_cart",
    );
    expect(cartAttacks.length).toBeGreaterThanOrEqual(2);
  });
});
