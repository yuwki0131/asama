import { describe, expect, it } from "vitest";
import type { CellCoord } from "@asama/shared";
import { canTraverseElevation, createInitialWorld, elevationAt, updateWorld } from "@asama/simulation";
import {
  castleTownGateScenario,
  cutPassFortScenario,
  DEFAULT_SCENARIO,
  fiveTierKeepScenario,
  scenarios,
  steppedFortressScenario,
  waterCastleScenario,
} from "./index";
import type { ContentScenarioDefinition } from "./index";

// Logic-level validation for the five added scenario variations
// (water-castle / five-tier-keep / cut-pass-fort / castle-town-gate /
// stepped-fortress). Pins the same simulation-side contract as the
// mountain-castle showcase tests: boot through the validators, run the loop,
// keep the food chain connected, and preserve each scenario's signature
// terrain feature.

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

const NEW_SCENARIOS: readonly ContentScenarioDefinition[] = [
  waterCastleScenario,
  castleTownGateScenario,
  cutPassFortScenario,
  steppedFortressScenario,
  fiveTierKeepScenario,
];

type World = ReturnType<typeof createInitialWorld>;

function cellAt(world: World, coord: CellCoord) {
  return world.map.cells[coord.y * world.map.width + coord.x]!;
}

describe.each(NEW_SCENARIOS.map((s) => [s.id, s] as const))(
  "%s: shared scenario contract",
  (_id, scenario) => {
    it("has id/name/description and joins the roster without changing the default", () => {
      expect(scenario.id.length).toBeGreaterThan(0);
      expect(scenario.name.length).toBeGreaterThan(0);
      expect(scenario.description ?? "").not.toBe("");
      expect(scenarios).toContain(scenario);
      expect(DEFAULT_SCENARIO.id).toBe("concentric-castle");
    });

    it("all building/unit/wave entries use valid types and in-bounds positions", () => {
      for (const b of scenario.initialBuildings) {
        expect(VALID_BUILDING_TYPES.has(b.type)).toBe(true);
        expect(b.position.x).toBeGreaterThanOrEqual(0);
        expect(b.position.x).toBeLessThan(MAP_WIDTH);
        expect(b.position.y).toBeGreaterThanOrEqual(0);
        expect(b.position.y).toBeLessThan(MAP_HEIGHT);
      }
      const spawns = [...scenario.initialUnits, ...scenario.waves.flatMap((w) => w.spawns)];
      for (const u of spawns) {
        expect(VALID_UNIT_TYPES.has(u.type)).toBe(true);
        expect(u.position.x).toBeGreaterThanOrEqual(0);
        expect(u.position.x).toBeLessThan(MAP_WIDTH);
        expect(u.position.y).toBeGreaterThanOrEqual(0);
        expect(u.position.y).toBeLessThan(MAP_HEIGHT);
      }
    });

    it("has one honmaru + one tenshu, and 2..4 strictly ascending waves before the deadline", () => {
      const count = (type: string) => scenario.initialBuildings.filter((b) => b.type === type).length;
      expect(count("honmaru")).toBe(1);
      expect(count("tenshu")).toBe(1);
      const ticks = scenario.waves.map((w) => w.tick);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(4);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
      }
      expect(scenario.victory.holdTicks).not.toBeNull();
      expect(ticks.at(-1)!).toBeLessThan(scenario.victory.holdTicks!);
    });

    it("boots without exception and runs 1000 ticks", () => {
      const world = createInitialWorld(scenario);
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          updateWorld(world);
        }
      }).not.toThrow();
    });

    it("connects every storehouse to the honmaru food chain", () => {
      const world = createInitialWorld(scenario);
      const storehouses = world.buildings.filter((b) => b.type === "storehouse");
      expect(storehouses.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < 10; i++) {
        updateWorld(world);
      }
      expect(new Set(world.food.connectedStorehouseIds).size).toBe(storehouses.length);
    });

    it("survives the pre-wave phase: no starvation or early defeat in 2000 ticks", () => {
      const world = createInitialWorld(scenario);
      for (let i = 0; i < 2000; i++) {
        updateWorld(world);
      }
      expect(world.outcome).toBeNull();
    });
  }
);

describe("waterCastleScenario: double moat rings and five bridges", () => {
  it("places two water-moat rings crossed by exactly five bridges", () => {
    const world = createInitialWorld(waterCastleScenario);
    const moats = world.buildings.filter((b) => b.type === "water_moat");
    expect(moats.length).toBeGreaterThan(100); // 二重リング
    const bridges = world.buildings.filter(
      (b) => b.type === "wood_bridge" || b.type === "earth_bridge"
    );
    expect(bridges.length).toBe(5);
    // 陸上橋は堀リングを跨ぐ3セル張り出し。
    for (const bridge of bridges) {
      expect(bridge.footprint.length).toBe(3);
    }
  });
});

describe("fiveTierKeepScenario: full 0..5 ishigaki stack", () => {
  it("uses all five terrace levels with ishigaki skin and puts the tenshu on L5", () => {
    const levels = fiveTierKeepScenario.elevation!.patches.map((p) => p.level);
    for (const level of [1, 2, 3, 4, 5]) {
      expect(levels).toContain(level);
    }
    for (const patch of fiveTierKeepScenario.elevation!.patches) {
      expect(patch.skin).toBe("ishigaki");
    }
    const world = createInitialWorld(fiveTierKeepScenario);
    expect(elevationAt(world, { x: 52, y: 54 })).toBe(5); // 天守
    expect(elevationAt(world, { x: 57, y: 84 })).toBe(0); // 城下大手道
    expect(cellAt(world, { x: 57, y: 82 }).elevationSkin).toBe("ishigaki");
  });

  it("only the switchback slopes climb: blocking them cuts the summit off", () => {
    const world = createInitialWorld(fiveTierKeepScenario);
    // 大手 0→1 の坂は軸方向のみ通行可。
    expect(canTraverseElevation(world, { x: 57, y: 84 }, { x: 57, y: 83 })).toBe(true);
    expect(canTraverseElevation(world, { x: 57, y: 83 }, { x: 57, y: 82 })).toBe(true);
    // 非坂セルの段差は崖。
    expect(canTraverseElevation(world, { x: 45, y: 83 }, { x: 45, y: 82 })).toBe(false);
    // 4→5 虎口 (幅1)。
    expect(cellAt(world, { x: 58, y: 63 }).slope).toBe("N");
  });
});

describe("cutPassFortScenario: gentle 2-cell cuttings in natural rock", () => {
  it("marks lower/upper gentle-slope halves on the cliff-skin cuttings", () => {
    const world = createInitialWorld(cutPassFortScenario);
    // 大手 0→1 (幅2, length 2): 下半 (43..44,104) / 上半 (43..44,103)。
    expect(cellAt(world, { x: 43, y: 104 }).slope).toBe("N");
    expect(cellAt(world, { x: 43, y: 104 }).slopeHalf).toBe("lower");
    expect(cellAt(world, { x: 44, y: 103 }).slopeHalf).toBe("upper");
    // 搦手 0→1 (東, length 2): 下半 (60,90) / 上半 (59,90)。
    expect(cellAt(world, { x: 60, y: 90 }).slope).toBe("W");
    expect(cellAt(world, { x: 60, y: 90 }).slopeHalf).toBe("lower");
    expect(cellAt(world, { x: 59, y: 90 }).slopeHalf).toBe("upper");
    // 石垣は使わない — 縁は岩肌スキン。
    expect(cellAt(world, { x: 43, y: 104 }).elevationSkin).toBe("cliff");
    for (const patch of cutPassFortScenario.elevation!.patches) {
      expect(patch.skin ?? "cliff").toBe("cliff");
    }
  });

  it("shapes the two-tier fort: honmaru L2 over the L1 obi-kuruwa and L0 town", () => {
    const world = createInitialWorld(cutPassFortScenario);
    expect(elevationAt(world, { x: 48, y: 88 })).toBe(2); // 本丸
    expect(elevationAt(world, { x: 43, y: 101 })).toBe(1); // 帯曲輪 (大手坂上)
    expect(elevationAt(world, { x: 44, y: 106 })).toBe(0); // 城下
  });
});

describe("castleTownGateScenario: one main street, two wide gates", () => {
  it("lines eight town blocks along a 3-wide road from sogamae gate to castle gate", () => {
    const world = createInitialWorld(castleTownGateScenario);
    const townBlocks = world.buildings.filter((b) => b.type === "town_block");
    expect(townBlocks.length).toBe(8);
    const wideGates = world.buildings.filter((b) => b.type === "gate_wide_3");
    expect(wideGates.length).toBe(2);
    const fences = world.buildings.filter((b) => b.type === "fence");
    expect(fences.length).toBeGreaterThan(20); // 惣構の柵列
    // 大手筋は三列 (x49..51) の道。
    for (const x of [49, 50, 51]) {
      const road = world.buildings.find(
        (b) => b.type === "road" && b.position.x === x && b.position.y === 80
      );
      expect(road).toBeDefined();
    }
  });
});

describe("steppedFortressScenario: renkaku terraces stepping east", () => {
  it("stacks three ishigaki kuruwa west-high and gates every west-facing slope", () => {
    for (const patch of steppedFortressScenario.elevation!.patches) {
      expect(patch.skin).toBe("ishigaki");
    }
    const world = createInitialWorld(steppedFortressScenario);
    expect(elevationAt(world, { x: 35, y: 58 })).toBe(3); // 本丸
    expect(elevationAt(world, { x: 46, y: 60 })).toBe(2); // 二の丸
    expect(elevationAt(world, { x: 62, y: 60 })).toBe(1); // 三の丸
    expect(elevationAt(world, { x: 74, y: 61 })).toBe(0); // 東麓の大手道
    // 三段とも坂は西向き。
    expect(cellAt(world, { x: 71, y: 60 }).slope).toBe("W");
    expect(cellAt(world, { x: 55, y: 60 }).slope).toBe("W");
    expect(cellAt(world, { x: 39, y: 61 }).slope).toBe("W");
    // 非坂セルの段差は崖。
    expect(canTraverseElevation(world, { x: 71, y: 55 }, { x: 70, y: 55 })).toBe(false);
    expect(canTraverseElevation(world, { x: 72, y: 60 }, { x: 71, y: 60 })).toBe(true);
  });
});
