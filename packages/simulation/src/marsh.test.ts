import { describe, expect, it } from "vitest";
import { createInitialMap } from "./map";

describe("marsh lowland terrain (岩尾根の代替戦術障害)", () => {
  const map = createInitialMap();
  const at = (x: number, y: number) => map.cells[y * map.width + x]!;
  const marshCells = map.cells.filter((cell) => cell.terrain === "marsh");

  it("places marsh lobes along the river lowlands", () => {
    expect(marshCells.length).toBeGreaterThan(50);
    // 全て川の周辺低地(手続き川の帯 y≈33-45 の±7セル圏)にあること
    for (const cell of marshCells) {
      expect(cell.coord.y).toBeGreaterThan(26);
      expect(cell.coord.y).toBeLessThan(53);
    }
  });

  it("keeps marsh off the river bank cells (斜め遷移タイル保護)", () => {
    // 水面に直交隣接するセルが marsh だと riverTransitionCorner が
    // 成立しなくなり階段状の岸が復活する。必ず grass を1セル挟む。
    for (const cell of marshCells) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cell.coord.x + dx;
        const ny = cell.coord.y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        expect(at(nx, ny).terrain).not.toBe("water");
      }
    }
  });

  it("is passable but slow (movementCost 4 > dirt 3)", () => {
    for (const cell of marshCells.slice(0, 20)) {
      expect(cell.passable).toBe(true);
      expect(cell.movementCost).toBe(4);
    }
  });

  it("uses connected marsh sprites, never the (unrendered) macro field", () => {
    for (const cell of marshCells) {
      expect(cell.assetId).toMatch(/^terrain\.marsh\.(base|connected\.[01]{4})$/);
    }
  });

  it("breaks the belt into lobes instead of one continuous band", () => {
    // 帯が一様に繋がると人工的なベルトに見える。marsh の無い川スパン
    // (x方向)が相応にあることを確認。
    const columnsWithMarsh = new Set(marshCells.map((cell) => cell.coord.x));
    expect(columnsWithMarsh.size).toBeGreaterThan(30);
    expect(columnsWithMarsh.size).toBeLessThan(120);
  });
});
