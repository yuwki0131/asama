import type { BuildingType, ScenarioBuildingPlacement } from "@asama/shared";

// 新シナリオ群の共通レイアウト補助。壁・柵・堀の直線/矩形リングを座標列挙の
// 代わりに宣言的に生成する(既存シナリオの逐次列挙と等価なデータを返す)。

/** 横一列 (y固定, x0..x1) の1x1建物列。skipX のセルは飛ばす(門・橋の開口)。 */
export function hLine(
  type: BuildingType,
  x0: number,
  x1: number,
  y: number,
  skipX: readonly number[] = []
): ScenarioBuildingPlacement[] {
  const cells: ScenarioBuildingPlacement[] = [];
  for (let x = x0; x <= x1; x += 1) {
    if (!skipX.includes(x)) {
      cells.push({ type, position: { x, y } });
    }
  }
  return cells;
}

/** 縦一列 (x固定, y0..y1) の1x1建物列。skipY のセルは飛ばす。 */
export function vLine(
  type: BuildingType,
  x: number,
  y0: number,
  y1: number,
  skipY: readonly number[] = []
): ScenarioBuildingPlacement[] {
  const cells: ScenarioBuildingPlacement[] = [];
  for (let y = y0; y <= y1; y += 1) {
    if (!skipY.includes(y)) {
      cells.push({ type, position: { x, y } });
    }
  }
  return cells;
}

/** 矩形リング(周囲一周)。skip は "x,y" 形式のセルキー集合。 */
export function ring(
  type: BuildingType,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  skip: readonly string[] = []
): ScenarioBuildingPlacement[] {
  const skipSet = new Set(skip);
  const cells: ScenarioBuildingPlacement[] = [];
  const push = (x: number, y: number) => {
    if (!skipSet.has(`${x},${y}`)) {
      cells.push({ type, position: { x, y } });
    }
  };
  for (let x = x0; x <= x1; x += 1) {
    push(x, y0);
    push(x, y1);
  }
  for (let y = y0 + 1; y <= y1 - 1; y += 1) {
    push(x0, y);
    push(x1, y);
  }
  return cells;
}
