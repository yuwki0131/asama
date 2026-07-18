import { describe, expect, it } from "vitest";
import type { CellCoord } from "@asama/shared";
import { canTraverseElevation, createInitialWorld, elevationAt, updateWorld } from "@asama/simulation";
import { DEFAULT_SCENARIO, scenarios, takaishigakiShowcaseScenario } from "./index";

// Logic-level validation for the takaishigaki showcase (高石垣の城) — the map
// exists to exercise the TALL ishigaki face assets (h3/h4/h5): every kuruwa's
// S/E edge must drop straight to level 0 so the renderer picks
// terrain.ishigaki.face.{s,e}.h3/h4/h5 (drop = top - bottom) instead of
// stacked h1 steps. These tests pin the drops at the simulation level via the
// inserted cliff cells (cliffHeight = drop).

type World = ReturnType<typeof createInitialWorld>;

function cellAt(world: World, coord: CellCoord) {
  return world.map.cells[coord.y * world.map.width + coord.x]!;
}

describe("takaishigakiShowcaseScenario: shared scenario contract", () => {
  it("has id/name/description and joins the roster without changing the default", () => {
    expect(takaishigakiShowcaseScenario.id).toBe("takaishigaki-showcase");
    expect(takaishigakiShowcaseScenario.name.length).toBeGreaterThan(0);
    expect(takaishigakiShowcaseScenario.description ?? "").not.toBe("");
    expect(scenarios).toContain(takaishigakiShowcaseScenario);
    expect(DEFAULT_SCENARIO.id).toBe("concentric-castle");
  });

  it("has one honmaru + one tenshu, and strictly ascending waves before the deadline", () => {
    const count = (type: string) =>
      takaishigakiShowcaseScenario.initialBuildings.filter((b) => b.type === type).length;
    expect(count("honmaru")).toBe(1);
    expect(count("tenshu")).toBe(1);
    const ticks = takaishigakiShowcaseScenario.waves.map((w) => w.tick);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
    }
    expect(takaishigakiShowcaseScenario.victory.holdTicks).not.toBeNull();
    expect(ticks.at(-1)!).toBeLessThan(takaishigakiShowcaseScenario.victory.holdTicks!);
  });

  it("boots without exception and runs 1000 ticks", () => {
    const world = createInitialWorld(takaishigakiShowcaseScenario);
    expect(() => {
      for (let i = 0; i < 1000; i++) {
        updateWorld(world);
      }
    }).not.toThrow();
  });

  it("connects every storehouse to the honmaru food chain", () => {
    const world = createInitialWorld(takaishigakiShowcaseScenario);
    const storehouses = world.buildings.filter((b) => b.type === "storehouse");
    expect(storehouses.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 10; i++) {
      updateWorld(world);
    }
    expect(new Set(world.food.connectedStorehouseIds).size).toBe(storehouses.length);
  });

  it("survives the pre-wave phase: no starvation or early defeat in 2000 ticks", () => {
    const world = createInitialWorld(takaishigakiShowcaseScenario);
    for (let i = 0; i < 2000; i++) {
      updateWorld(world);
    }
    expect(world.outcome).toBeNull();
  });
});

describe("takaishigakiShowcaseScenario: tall ishigaki drops (h3/h4/h5)", () => {
  it("uses ishigaki skin on every patch and stacks the echelon terraces 5/4/3", () => {
    for (const patch of takaishigakiShowcaseScenario.elevation!.patches) {
      expect(patch.skin).toBe("ishigaki");
    }
    const world = createInitialWorld(takaishigakiShowcaseScenario);
    expect(elevationAt(world, { x: 18, y: 52 })).toBe(5); // 本丸 (天守)
    expect(elevationAt(world, { x: 19, y: 67 })).toBe(5); // 本丸南西の櫓台
    expect(elevationAt(world, { x: 40, y: 68 })).toBe(4); // 二の丸
    expect(elevationAt(world, { x: 33, y: 79 })).toBe(4); // 二の丸南の櫓台
    expect(elevationAt(world, { x: 50, y: 85 })).toBe(3); // 三の丸
    expect(elevationAt(world, { x: 58, y: 60 })).toBe(1); // 大手裏階段 L1
    expect(elevationAt(world, { x: 58, y: 67 })).toBe(2); // 大手裏階段 L2
    expect(elevationAt(world, { x: 58, y: 93 })).toBe(0); // 舟入 (南面の入り込み)
    expect(elevationAt(world, { x: 33, y: 92 })).toBe(0); // 城下町
  });

  it("drops straight to level 0 on the showcase edges: h5/h4/h3 faces, not h1 stacks", () => {
    const world = createInitialWorld(takaishigakiShowcaseScenario);
    // 本丸 S面 h5 / E面 h5
    expect(cellAt(world, { x: 24, y: 66 }).terrain).toBe("cliff");
    expect(cellAt(world, { x: 24, y: 66 }).cliffHeight).toBe(5);
    expect(cellAt(world, { x: 36, y: 55 }).cliffHeight).toBe(5);
    // 二の丸 S面 h4 / E面 h4
    expect(cellAt(world, { x: 40, y: 78 }).cliffHeight).toBe(4);
    expect(cellAt(world, { x: 52, y: 66 }).cliffHeight).toBe(4);
    // 三の丸 S面 h3 / E面 h3、南東出隅
    expect(cellAt(world, { x: 50, y: 96 }).cliffHeight).toBe(3);
    expect(cellAt(world, { x: 65, y: 96 }).cliffHeight).toBe(3);
    expect(cellAt(world, { x: 72, y: 85 }).cliffHeight).toBe(3);
    expect(cellAt(world, { x: 72, y: 96 }).terrain).toBe("cliff"); // corner.se.h3
    // 舟入の入隅 (北壁 S面 / 西壁 E面)
    expect(cellAt(world, { x: 57, y: 90 }).cliffHeight).toBe(3);
    expect(cellAt(world, { x: 56, y: 92 }).cliffHeight).toBe(3);
    // 全て石垣スキン
    expect(cellAt(world, { x: 24, y: 66 }).elevationSkin).toBe("ishigaki");
    expect(cellAt(world, { x: 50, y: 96 }).elevationSkin).toBe("ishigaki");
  });

  it("only the gated ramps climb: the tall faces themselves are impassable", () => {
    const world = createInitialWorld(takaishigakiShowcaseScenario);
    // 大手 0→1 の坂は軸方向のみ通行可。
    expect(cellAt(world, { x: 58, y: 55 }).slope).toBe("S");
    expect(canTraverseElevation(world, { x: 58, y: 54 }, { x: 58, y: 55 })).toBe(true);
    expect(canTraverseElevation(world, { x: 58, y: 55 }, { x: 58, y: 56 })).toBe(true);
    // 二の丸→本丸 4→5 の坂。
    expect(cellAt(world, { x: 32, y: 66 }).slope).toBe("N");
    expect(canTraverseElevation(world, { x: 32, y: 67 }, { x: 32, y: 66 })).toBe(true);
    // 高石垣の縁は崖 — 直登不可。
    expect(canTraverseElevation(world, { x: 43, y: 80 }, { x: 44, y: 80 })).toBe(false);
  });
});
