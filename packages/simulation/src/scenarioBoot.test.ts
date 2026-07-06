import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENARIO,
  concentricCastleScenario,
  linearFortressScenario,
  riversideDefenseScenario,
} from "@asama/content";
import { createInitialWorld, updateWorld } from "./index";
import type { ScenarioDefinition } from "@asama/shared";

const SCENARIOS: { name: string; scenario: ScenarioDefinition }[] = [
  { name: "concentricCastleScenario", scenario: concentricCastleScenario },
  { name: "linearFortressScenario", scenario: linearFortressScenario },
  { name: "riversideDefenseScenario", scenario: riversideDefenseScenario },
];

describe("scenario boot + 1000-tick regression", () => {
  for (const { name, scenario } of SCENARIOS) {
    it(`${name}: boots without exception`, () => {
      expect(() => createInitialWorld(scenario)).not.toThrow();
    });

    it(`${name}: runs 1000 ticks without exception`, () => {
      const world = createInitialWorld(scenario);
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          updateWorld(world);
        }
      }).not.toThrow();
    });
  }
});

describe("DEFAULT_SCENARIO 2000-tick starvation regression", () => {
  it("DEFAULT_SCENARIO survives 2000 ticks without starvation or early defeat", () => {
    // Food connectivity uses supply perspective (player gates always traversable)
    // so closing the castle gate does not starve the garrison.
    const world = createInitialWorld(DEFAULT_SCENARIO);
    for (let i = 0; i < 2000; i++) {
      updateWorld(world);
    }
    expect(world.outcome).toBeNull();
  });
});
