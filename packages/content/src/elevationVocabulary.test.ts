import { describe, expect, it } from "vitest";
import type { ScenarioDefinition, ScenarioElevationDefinition } from "@asama/shared";
import { concentricCastleScenario, linearFortressScenario, riversideDefenseScenario } from "./index";

// Scenario elevation vocabulary (docs/10_development/elevation-contract.md).
// Runtime application/boot behaviour is covered in @asama/simulation
// (elevation.test.ts / scenarioBoot.test.ts); this test pins the content-side
// contract: the vocabulary composes into a ScenarioDefinition, and the 1.0
// scenarios remain flat (no elevation declared).

describe("scenario elevation vocabulary", () => {
  it("existing 1.0 scenarios declare no elevation (fully flat maps)", () => {
    expect(concentricCastleScenario.elevation).toBeUndefined();
    expect(linearFortressScenario.elevation).toBeUndefined();
    expect(riversideDefenseScenario.elevation).toBeUndefined();
  });

  it("the vocabulary composes hills, terraces (kuruwa) and ramps declaratively", () => {
    const elevation: ScenarioElevationDefinition = {
      patches: [
        // Natural hill base (rock skin by default).
        { area: { kind: "ellipse", cx: 64, cy: 40, rx: 18, ry: 12 }, level: 1 },
        // Stone-walled terraces stack on top via max-composition.
        { area: { kind: "rect", x: 56, y: 34, width: 16, height: 12 }, level: 2, skin: "ishigaki" },
        { area: { kind: "rect", x: 60, y: 36, width: 8, height: 6 }, level: 3, skin: "ishigaki" }
      ],
      slopes: [
        // Two-cell-wide approach road, then narrow koguchi chokepoints.
        { position: { x: 63, y: 53 }, toward: "N", width: 2 },
        { position: { x: 63, y: 46 }, toward: "N", width: 2 },
        { position: { x: 63, y: 42 }, toward: "N" }
      ]
    };

    const scenario: ScenarioDefinition = {
      id: "vocabulary-shape-check",
      name: "語彙の型検査",
      elevation,
      initialBuildings: [],
      initialUnits: [],
      waves: [],
      victory: { holdTicks: null }
    };

    expect(scenario.elevation?.patches).toHaveLength(3);
    expect(scenario.elevation?.slopes).toHaveLength(3);
    expect(scenario.elevation?.patches[1]?.skin).toBe("ishigaki");
    expect(scenario.elevation?.slopes?.[0]?.width).toBe(2);
  });
});
