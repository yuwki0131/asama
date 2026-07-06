import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENARIO,
  concentricCastleScenario,
  linearFortressScenario,
  riversideDefenseScenario,
} from "@asama/content";
import { createInitialWorld, updateWorld } from "./index";
import { createUnit } from "./units";
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

describe("bug regression: bridge auto-span at initial placement", () => {
  it("concentricCastle: earth_bridge at (63,83) gets 3-cell footprint spanning the moat gap", () => {
    const world = createInitialWorld(concentricCastleScenario);
    const bridge = world.buildings.find(
      b => b.type === "earth_bridge" && b.position.x === 63 && b.position.y === 83
    );
    expect(bridge).toBeDefined();
    expect(bridge!.footprint).toHaveLength(3);
    const ys = bridge!.footprint.map(c => c.y).sort((a, b) => a - b);
    expect(ys).toEqual([82, 83, 84]);
  });
});

describe("bug regression: enemy AI honmaru approach without pause", () => {
  it("enemy adjacent to honmaru reaches it without cooldown pause when undefended", () => {
    const world = createInitialWorld(concentricCastleScenario);
    // Remove all player and enemy units so honmaru (67,78) is undefended.
    world.units = [];
    // Place a single enemy unit inside the inner ring, 2 cells from honmaru.
    world.units.push(createUnit("unit:enemy:test", "enemy", "spear_ashigaru", { x: 67, y: 80 }));

    let ticks = 0;
    while (world.outcome === null && ticks < 200) {
      updateWorld(world);
      ticks++;
    }
    expect(world.outcome?.winner).toBe("enemy");
  });
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
