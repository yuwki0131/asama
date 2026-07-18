import { describe, expect, it } from "vitest";
import type { CellCoord } from "@asama/shared";
import { canTraverseElevation, createInitialWorld, elevationAt, updateWorld } from "@asama/simulation";
import { DEFAULT_SCENARIO, mountainCastleScenario, scenarios } from "./index";

// Logic-level validation for the 2.0 mountain-castle showcase
// (docs/10_development/yamajiro-scenario-design.md). The renderer work for
// elevation (P4b/P4c) is parallel work in progress — these tests pin the
// simulation-side contract: the scenario boots through the elevation
// validators, terraces and slopes are shaped as designed, the enemy has a
// slope-only route to the honmaru, defenders hold high-ground positions, and
// the food supply chain spans all three levels.

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

type World = ReturnType<typeof createInitialWorld>;

function cellAt(world: World, coord: CellCoord) {
  return world.map.cells[coord.y * world.map.width + coord.x]!;
}

/** Terrain reachability BFS mirroring the sim's edge rule. Buildings block
 *  unless passable; player gates are treated as open (supply perspective —
 *  the enemy breaches them, so they are not terrain). Units are ignored.
 *  `blockSlopes` proves the slope-only access property. */
function reachable(world: World, start: CellCoord, goal: CellCoord, blockSlopes = false): boolean {
  const blockedByBuilding = new Set<string>();
  for (const building of world.buildings) {
    const gate = building.type.startsWith("gate");
    const open = building.passable || (gate && building.owner === "player") || (gate && building.owner === "enemy");
    if (!open) {
      for (const cell of building.footprint) {
        blockedByBuilding.add(`${cell.x},${cell.y}`);
      }
    }
  }

  const passable = (coord: CellCoord): boolean => {
    if (coord.x < 0 || coord.y < 0 || coord.x >= world.map.width || coord.y >= world.map.height) {
      return false;
    }
    const cell = cellAt(world, coord);
    if (blockSlopes && cell.slope !== null) {
      return false;
    }
    return cell.passable && !blockedByBuilding.has(`${coord.x},${coord.y}`);
  };

  const key = (coord: CellCoord) => `${coord.x},${coord.y}`;
  const visited = new Set([key(start)]);
  const queue: CellCoord[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.x === goal.x && current.y === goal.y) {
      return true;
    }
    for (const step of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const next = { x: current.x + step.x, y: current.y + step.y };
      if (visited.has(key(next)) || !passable(next)) {
        continue;
      }
      // The sim's real elevation edge rule: cliffs block, slopes connect.
      if (!canTraverseElevation(world, current, next)) {
        continue;
      }
      visited.add(key(next));
      queue.push(next);
    }
  }
  return false;
}

describe("mountainCastleScenario: definition shape", () => {
  it("has a non-empty id and name and is in the roster without changing the default", () => {
    expect(mountainCastleScenario.id.length).toBeGreaterThan(0);
    expect(mountainCastleScenario.name.length).toBeGreaterThan(0);
    expect(scenarios).toContain(mountainCastleScenario);
    expect(DEFAULT_SCENARIO.id).toBe("concentric-castle");
  });

  it("all building/unit/wave entries use valid types and in-bounds positions", () => {
    for (const b of mountainCastleScenario.initialBuildings) {
      expect(VALID_BUILDING_TYPES.has(b.type)).toBe(true);
      expect(b.position.x).toBeGreaterThanOrEqual(0);
      expect(b.position.x).toBeLessThan(MAP_WIDTH);
      expect(b.position.y).toBeGreaterThanOrEqual(0);
      expect(b.position.y).toBeLessThan(MAP_HEIGHT);
    }
    const spawns = [
      ...mountainCastleScenario.initialUnits,
      ...mountainCastleScenario.waves.flatMap((wave) => wave.spawns),
    ];
    for (const u of spawns) {
      expect(VALID_UNIT_TYPES.has(u.type)).toBe(true);
      expect(u.position.x).toBeGreaterThanOrEqual(0);
      expect(u.position.x).toBeLessThan(MAP_WIDTH);
      expect(u.position.y).toBeGreaterThanOrEqual(0);
      expect(u.position.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it("wave ticks are strictly ascending and end before the hold deadline", () => {
    const ticks = mountainCastleScenario.waves.map((w) => w.tick);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
    }
    expect(mountainCastleScenario.victory.holdTicks).not.toBeNull();
    expect(ticks.at(-1)!).toBeLessThan(mountainCastleScenario.victory.holdTicks!);
  });

  it("has exactly one honmaru and one tenshu, and supply carts from wave 1", () => {
    const count = (type: string) =>
      mountainCastleScenario.initialBuildings.filter((b) => b.type === type).length;
    expect(count("honmaru")).toBe(1);
    expect(count("tenshu")).toBe(1);
    for (const wave of mountainCastleScenario.waves) {
      expect(wave.spawns.map((s) => s.type)).toContain("supply_cart");
    }
  });

  it("uses the full 0..3 elevation range with ishigaki terraces and cliff hillside", () => {
    const levels = mountainCastleScenario.elevation!.patches.map((p) => p.level);
    expect(levels).toContain(1);
    expect(levels).toContain(2);
    expect(levels).toContain(3);
    const skins = mountainCastleScenario.elevation!.patches.map((p) => p.skin ?? "cliff");
    expect(skins).toContain("ishigaki");
    expect(skins).toContain("cliff");
  });
});

describe("mountainCastleScenario: boot and terrain", () => {
  it("boots without exception (slope + building placement validators pass)", () => {
    expect(() => createInitialWorld(mountainCastleScenario)).not.toThrow();
  });

  it("runs 1000 ticks without exception", () => {
    const world = createInitialWorld(mountainCastleScenario);
    expect(() => {
      for (let i = 0; i < 1000; i++) {
        updateWorld(world);
      }
    }).not.toThrow();
  });

  it("shapes the three terraces: honmaru L3, ninomaru L2, sannomaru L1, town L0", () => {
    const world = createInitialWorld(mountainCastleScenario);
    expect(elevationAt(world, { x: 60, y: 60 })).toBe(3); // 本丸マーカー
    expect(elevationAt(world, { x: 55, y: 60 })).toBe(3); // 天守敷地
    expect(elevationAt(world, { x: 49, y: 60 })).toBe(2); // 二の丸西帯
    expect(elevationAt(world, { x: 60, y: 68 })).toBe(2); // 二の丸南帯
    expect(elevationAt(world, { x: 56, y: 80 })).toBe(1); // 三の丸南帯曲輪
    expect(elevationAt(world, { x: 45, y: 60 })).toBe(1); // 三の丸西
    expect(elevationAt(world, { x: 56, y: 92 })).toBe(0); // 城下
    expect(elevationAt(world, { x: 76, y: 90 })).toBe(0); // 搦手の東廊下
  });

  it("marks the five approach slopes with the designed directions and skins", () => {
    const world = createInitialWorld(mountainCastleScenario);
    // 大手道 0→1 (幅2)
    expect(cellAt(world, { x: 56, y: 86 }).slope).toBe("N");
    expect(cellAt(world, { x: 57, y: 86 }).slope).toBe("N");
    // 搦手道 0→1
    expect(cellAt(world, { x: 74, y: 79 }).slope).toBe("W");
    // 大手道 1→2 (幅2)
    expect(cellAt(world, { x: 52, y: 72 }).slope).toBe("N");
    expect(cellAt(world, { x: 53, y: 72 }).slope).toBe("N");
    // 虎口 2→3
    expect(cellAt(world, { x: 60, y: 65 }).slope).toBe("N");
    // 搦手 1→2
    expect(cellAt(world, { x: 68, y: 72 }).slope).toBe("N");
    // 曲輪の縁は石垣スキン、自然山体の縁は岩肌スキン。
    expect(cellAt(world, { x: 56, y: 85 }).elevationSkin).toBe("ishigaki");
    expect(cellAt(world, { x: 40, y: 66 }).elevationSkin).toBe("cliff");
  });

  it("keeps kuruwa edges as cliffs: stepping straight up the terrace face is illegal", () => {
    const world = createInitialWorld(mountainCastleScenario);
    // 三の丸南縁 (L0→L1) の非坂セル境界は崖。
    expect(canTraverseElevation(world, { x: 60, y: 86 }, { x: 60, y: 85 })).toBe(false);
    // 大手坂は軸方向のみ通行できる。
    expect(canTraverseElevation(world, { x: 56, y: 87 }, { x: 56, y: 86 })).toBe(true);
    expect(canTraverseElevation(world, { x: 56, y: 86 }, { x: 56, y: 85 })).toBe(true);
    // 坂の側面から入るのは不可。
    expect(canTraverseElevation(world, { x: 55, y: 86 }, { x: 56, y: 86 })).toBe(false);
  });
});

describe("mountainCastleScenario: routes, high ground and supply", () => {
  it("enemy spawn points reach the honmaru via the slopes (both approach columns)", () => {
    const world = createInitialWorld(mountainCastleScenario);
    const honmaru = { x: 60, y: 60 };
    // 大手 (南) の集結地から。
    expect(reachable(world, { x: 56, y: 116 }, honmaru)).toBe(true);
    // 搦手 (南東廊下) の側面隊スポーンから。
    expect(reachable(world, { x: 76, y: 104 }, honmaru)).toBe(true);
  });

  it("the slopes are the only way up: with slope cells blocked the honmaru is unreachable", () => {
    const world = createInitialWorld(mountainCastleScenario);
    expect(reachable(world, { x: 56, y: 116 }, { x: 60, y: 60 }, true)).toBe(false);
  });

  it("terrace defenders hold high ground over the slope approaches below them", () => {
    const world = createInitialWorld(mountainCastleScenario);
    // 三の丸の大手門守備 (L1) は坂下の城下 (L0) より高い。
    expect(elevationAt(world, { x: 55, y: 84 })).toBeGreaterThan(elevationAt(world, { x: 56, y: 87 }));
    // 二の丸の坂上槍衾 (L2) は三の丸帯曲輪 (L1) より高い。
    expect(elevationAt(world, { x: 52, y: 70 })).toBeGreaterThan(elevationAt(world, { x: 52, y: 73 }));
    // 本丸南縁の弓兵 (L3) は虎口前の二の丸 (L2) より高い。
    expect(elevationAt(world, { x: 59, y: 64 })).toBeGreaterThan(elevationAt(world, { x: 60, y: 66 }));
    // 初期配置の弓兵・鉄砲兵は全員が段上 (elevation >= 1) にいる…城下の遅滞要員を除く。
    const elevatedShooters = mountainCastleScenario.initialUnits.filter(
      (u) => u.owner === "player" && (u.type === "archer" || u.type === "musketeer") && u.position.y < 100
    );
    for (const shooter of elevatedShooters) {
      expect(elevationAt(world, shooter.position)).toBeGreaterThanOrEqual(1);
    }
  });

  it("watchtowers (yagura) stand on the terraces overlooking each slope", () => {
    const world = createInitialWorld(mountainCastleScenario);
    const yagura = world.buildings.filter((b) => b.type === "yagura");
    expect(yagura.length).toBe(4);
    for (const tower of yagura) {
      expect(elevationAt(world, tower.position)).toBeGreaterThanOrEqual(1);
    }
  });

  it("food connectivity spans all three levels: every storehouse links to the honmaru", () => {
    const world = createInitialWorld(mountainCastleScenario);
    const storehouses = world.buildings.filter((b) => b.type === "storehouse");
    expect(storehouses.length).toBe(2);
    for (let i = 0; i < 10; i++) {
      updateWorld(world);
    }
    expect(new Set(world.food.connectedStorehouseIds).size).toBe(storehouses.length);
  });

  it("survives the pre-wave phase: no starvation or early defeat in 2000 ticks", () => {
    const world = createInitialWorld(mountainCastleScenario);
    for (let i = 0; i < 2000; i++) {
      updateWorld(world);
    }
    expect(world.outcome).toBeNull();
  });
});
