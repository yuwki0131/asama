import { describe, expect, it } from "vitest";
import { ogakiCastleScenario, concentricCastleScenario, mountainCastleScenario } from "@asama/content";
import { applyCommand, createInitialWorld } from "./index";

describe("decorations under buildings (V-18)", () => {
  it("clears scattered decorations under every initial building footprint", () => {
    for (const scenario of [ogakiCastleScenario, concentricCastleScenario]) {
      const world = createInitialWorld(scenario as never);
      const occupied = new Set(
        world.buildings.flatMap((building) => building.footprint.map((cell) => `${cell.x},${cell.y}`))
      );
      const offenders = world.map.decorations.filter((decoration) =>
        occupied.has(`${decoration.position.x},${decoration.position.y}`)
      );
      expect(offenders).toEqual([]);
    }
  });

  it("clears tall-tree decorations on the screen column right behind towers", () => {
    // V-18 mountain事案: (63,66)の杉が(66,69)の櫓と同一スクリーン列で整列し
    // 「屋根から木が生えた」ように見えた。塔系の同列背後1〜3セルに樹木デコが
    // 残らないこと。
    const world = createInitialWorld(mountainCastleScenario as never);
    const towers = world.buildings.filter(
      (b) => b.type === "yagura" || b.type === "honmaru" || b.type.startsWith("tenshu") || b.type.startsWith("gate_yagura")
    );
    const elevationAt = (x: number, y: number): number => world.map.cells[y * world.map.width + x]?.elevation ?? 0;
    const banned = new Set<string>();
    for (const tower of towers) {
      for (const cell of tower.footprint) {
        for (let k = 1; k <= 3; k += 1) {
          if (elevationAt(cell.x - k, cell.y - k) >= elevationAt(cell.x, cell.y)) {
            banned.add(`${cell.x - k},${cell.y - k}`);
          }
        }
      }
    }
    const offenders = world.map.decorations.filter(
      (d) => d.assetId.startsWith("deco.tree.") && banned.has(`${d.position.x},${d.position.y}`)
    );
    expect(offenders).toEqual([]);
  });

  it("clears decorations when the player places a building", () => {
    const world = createInitialWorld(ogakiCastleScenario as never);
    // 空き草地セルを探してデコを注入してから建設し、除去されることを確認。
    const occupied = new Set(
      world.buildings.flatMap((building) => building.footprint.map((cell) => `${cell.x},${cell.y}`))
    );
    const free = world.map.cells.find(
      (cell) =>
        cell.terrain === "grass" &&
        cell.passable &&
        cell.slope === null &&
        cell.elevation === 0 &&
        cell.coord.x > 16 && cell.coord.x < 110 &&
        cell.coord.y > 16 && cell.coord.y < 110 &&
        !occupied.has(`${cell.coord.x},${cell.coord.y}`)
    );
    expect(free).toBeDefined();
    const position = free!.coord;
    world.map.decorations.push({ assetId: "deco.tree.pine.1", position });
    const error = applyCommand(world, {
      type: "placeBuilding",
      buildingType: "fence",
      position,
      issuedAtTick: 0,
      clientSequence: 991
    });
    expect(error).toBeNull();
    const remaining = world.map.decorations.filter(
      (decoration) => decoration.position.x === position.x && decoration.position.y === position.y
    );
    expect(remaining).toEqual([]);
  });
});
