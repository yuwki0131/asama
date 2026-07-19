import { describe, it, expect } from "vitest";
import { buildingDrawY, decorationDrawY, honmaruMarkerScale, isoBehind } from "./renderGeometry";
import type { FootprintRect } from "./renderGeometry";
import { cellToWorld, TILE_HEIGHT } from "./camera";
import type { BuildingSnapshot, MapDecoration } from "@asama/shared";

function mockBuilding(overrides: Partial<BuildingSnapshot> = {}): BuildingSnapshot {
  return {
    id: "b1",
    owner: "player",
    type: "wall",
    category: "castle",
    position: { x: 5, y: 5 },
    footprint: [{ x: 5, y: 5 }],
    hp: 100,
    maxHp: 100,
    lifecycleState: "intact",
    gateState: null,
    passable: false,
    movementCostModifier: 1,
    assetId: "building.wall.plaster",
    food: null,
    foodCapacity: null,
    connectedToHonmaru: false,
    ladderHp: null,
    fillProgress: 0,
    ...overrides
  };
}

describe("buildingDrawY", () => {
  it("returns consistent Y for a single-cell wall at (5, 5)", () => {
    const building = mockBuilding({ type: "wall", position: { x: 5, y: 5 }, footprint: [{ x: 5, y: 5 }] });
    const expected = cellToWorld({ x: 5, y: 5 }).y;
    expect(buildingDrawY(building)).toBe(expected);
  });

  it("south-anchored (tenshu) uses footprint south corner", () => {
    const fp = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }];
    const building = mockBuilding({ type: "tenshu", footprint: fp });
    // south corner is (maxX+1, maxY+1) = (5, 5) → gridCornerToWorld (5,5)
    const buildingY = buildingDrawY(building);
    const decorAtSouthPos = decorationDrawY({ assetId: "tree", position: { x: 5, y: 5 } });
    // building's south anchor is strictly higher (larger Y) than a decoration sitting at (3,3)
    const decorNorth = decorationDrawY({ assetId: "tree", position: { x: 3, y: 3 } });
    expect(buildingY).toBeGreaterThan(decorNorth);
  });
});

describe("decorationDrawY", () => {
  it("equals cellToWorld Y for the decoration position", () => {
    const dec: MapDecoration = { assetId: "tree", position: { x: 10, y: 8 } };
    expect(decorationDrawY(dec)).toBe(cellToWorld({ x: 10, y: 8 }).y);
  });

  it("decoration at larger grid-Y has larger drawY", () => {
    const north: MapDecoration = { assetId: "tree", position: { x: 5, y: 5 } };
    const south: MapDecoration = { assetId: "tree", position: { x: 5, y: 10 } };
    expect(decorationDrawY(south)).toBeGreaterThan(decorationDrawY(north));
  });
});

describe("Y-sort: decoration vs building", () => {
  it("decoration at (5,5) and building at (5,5) produce same Y (wall is center-anchored)", () => {
    const building = mockBuilding({ type: "wall", position: { x: 5, y: 5 }, footprint: [{ x: 5, y: 5 }] });
    const dec: MapDecoration = { assetId: "tree", position: { x: 5, y: 5 } };
    expect(buildingDrawY(building)).toBe(decorationDrawY(dec));
  });

  it("a decoration south of a wall sorts after the wall", () => {
    const wall = mockBuilding({ type: "wall", position: { x: 5, y: 5 }, footprint: [{ x: 5, y: 5 }] });
    const dec: MapDecoration = { assetId: "tree", position: { x: 5, y: 6 } };
    expect(decorationDrawY(dec)).toBeGreaterThan(buildingDrawY(wall));
  });

  it("a decoration north of a wall sorts before the wall", () => {
    const wall = mockBuilding({ type: "wall", position: { x: 5, y: 5 }, footprint: [{ x: 5, y: 5 }] });
    const dec: MapDecoration = { assetId: "tree", position: { x: 5, y: 4 } };
    expect(decorationDrawY(dec)).toBeLessThan(buildingDrawY(wall));
  });

  it("draw order is monotonically non-decreasing after sort", () => {
    const items: Array<{ y: number; label: string }> = [
      { y: buildingDrawY(mockBuilding({ type: "wall", footprint: [{ x: 2, y: 8 }], position: { x: 2, y: 8 } })), label: "wall@2,8" },
      { y: decorationDrawY({ assetId: "tree", position: { x: 5, y: 3 } }), label: "tree@5,3" },
      { y: decorationDrawY({ assetId: "tree", position: { x: 1, y: 10 } }), label: "tree@1,10" },
      { y: buildingDrawY(mockBuilding({ type: "tenshu", footprint: [{ x: 6, y: 6 }, { x: 7, y: 6 }, { x: 6, y: 7 }, { x: 7, y: 7 }], position: { x: 6, y: 6 } })), label: "tenshu@6,6" }
    ];
    const sorted = [...items].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.y).toBeGreaterThanOrEqual(sorted[i - 1]!.y);
    }
  });

  it("tile height constant is positive (sanity check)", () => {
    expect(TILE_HEIGHT).toBeGreaterThan(0);
  });
});

describe("honmaruMarkerScale", () => {
  it("returns 1 for a single-cell footprint", () => {
    const b = mockBuilding({ type: "honmaru", footprint: [{ x: 5, y: 5 }] });
    expect(honmaruMarkerScale(b)).toBe(1);
  });

  it("returns the span for a 3x3 footprint", () => {
    const fp: Array<{ x: number; y: number }> = [];
    for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) fp.push({ x, y });
    const b = mockBuilding({ type: "honmaru", position: { x: 4, y: 4 }, footprint: fp });
    expect(honmaruMarkerScale(b)).toBe(3);
  });

  it("falls back to 1 for an empty footprint", () => {
    const b = mockBuilding({ type: "honmaru", footprint: [] });
    expect(honmaruMarkerScale(b)).toBe(1);
  });
});

// Helper: runs the same two-step isoSort algorithm (mirrors sceneLayer.ts)
// on abstract {id, rect} items so we can test it without importing pixi.
function isoSortRects(items: Array<{ id: string; rect: FootprintRect }>): string[] {
  const arr = [...items];
  arr.sort((a, b) => {
    const diff = (a.rect.maxX + a.rect.maxY) - (b.rect.maxX + b.rect.maxY);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
  const PASSES = 3;
  for (let pass = 0; pass < PASSES; pass++) {
    let swapped = false;
    for (let i = 0; i < arr.length - 1; i++) {
      if (isoBehind(arr[i + 1]!.rect, arr[i]!.rect) && !isoBehind(arr[i]!.rect, arr[i + 1]!.rect)) {
        const tmp = arr[i]!;
        arr[i] = arr[i + 1]!;
        arr[i + 1] = tmp;
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return arr.map((x) => x.id);
}

describe("isoBehind", () => {
  it("A with smaller maxX than B.minX → A behind B (x-axis separation)", () => {
    // a is completely to the west: every x in a < every x in b
    const a: FootprintRect = { minX: 2, maxX: 4, minY: 5, maxY: 7 };
    const b: FootprintRect = { minX: 5, maxX: 8, minY: 4, maxY: 9 };
    expect(isoBehind(a, b)).toBe(true);
    expect(isoBehind(b, a)).toBe(false);
  });

  it("A with smaller maxY than B.minY → A behind B (y-axis separation)", () => {
    // a is completely to the north: every y in a < every y in b
    const a: FootprintRect = { minX: 3, maxX: 8, minY: 2, maxY: 4 };
    const b: FootprintRect = { minX: 5, maxX: 7, minY: 5, maxY: 9 };
    expect(isoBehind(a, b)).toBe(true);
    expect(isoBehind(b, a)).toBe(false);
  });

  it("overlapping rects → neither is behind the other", () => {
    const a: FootprintRect = { minX: 3, maxX: 7, minY: 3, maxY: 7 };
    const b: FootprintRect = { minX: 5, maxX: 9, minY: 5, maxY: 9 };
    expect(isoBehind(a, b)).toBe(false);
    expect(isoBehind(b, a)).toBe(false);
  });

  it("8x8 tenshu (0-7,0-7) is behind tree at (3,8) via Y separation — unambiguous", () => {
    const tenshu: FootprintRect = { minX: 0, maxX: 7, minY: 0, maxY: 7 };
    const tree: FootprintRect = { minX: 3, maxX: 3, minY: 8, maxY: 8 };
    expect(isoBehind(tenshu, tree)).toBe(true); // tenshu.maxY=7 < tree.minY=8
    expect(isoBehind(tree, tenshu)).toBe(false); // tree.maxX=3 >= tenshu.minX=0
  });

  it("building (1-4,1-4) is behind wall at (6,1) via X separation — unambiguous", () => {
    // building's entire footprint is to the west (smaller x) of the wall
    const building: FootprintRect = { minX: 1, maxX: 4, minY: 1, maxY: 4 };
    const wall: FootprintRect = { minX: 6, maxX: 6, minY: 1, maxY: 1 };
    expect(isoBehind(building, wall)).toBe(true); // building.maxX=4 < wall.minX=6
    expect(isoBehind(wall, building)).toBe(false); // wall.maxY=1 is NOT < building.minY=1 (equal)
  });

  it("diagonal case: each is behind the other in a different axis (both true)", () => {
    // wall at (9,3): to the east AND north of building (5-8,5-8)
    // This creates an ambiguous ordering that the sort handles via depth fallback.
    const building: FootprintRect = { minX: 5, maxX: 8, minY: 5, maxY: 8 };
    const wall: FootprintRect = { minX: 9, maxX: 9, minY: 3, maxY: 3 };
    expect(isoBehind(building, wall)).toBe(true); // building.maxX=8 < wall.minX=9
    expect(isoBehind(wall, building)).toBe(true); // wall.maxY=3 < building.minY=5
  });
});

describe("isoSort: footprint-based painter's order", () => {
  it("bug(a): tree at south of 8x8 tenshu drawn after tenshu", () => {
    // tenshu (0-7,0-7) maxX+maxY=14, tree at (3,8) maxX+maxY=11
    // Primary sort puts tree first (smaller depth) — wrong
    // Bubble: tenshu.maxY=7 < tree.minY=8 (unambiguous) → swap to [tenshu, tree]
    const tenshu = { id: "tenshu", rect: { minX: 0, maxX: 7, minY: 0, maxY: 7 } };
    const tree = { id: "tree", rect: { minX: 3, maxX: 3, minY: 8, maxY: 8 } };
    expect(isoSortRects([tree, tenshu])).toEqual(["tenshu", "tree"]);
    expect(isoSortRects([tenshu, tree])).toEqual(["tenshu", "tree"]);
  });

  it("bug(b): south-anchored building drawn before wall to its east", () => {
    // Building (1-4, 1-4) maxX+maxY=8, wall at (6,1) maxX+maxY=7
    // Primary sort puts wall first (smaller depth) — wrong: building.maxX=4 < wall.minX=6
    // isoBehind(wall,building) false (wall.maxY=1 NOT < building.minY=1), so unambiguous swap
    const building = { id: "bldg", rect: { minX: 1, maxX: 4, minY: 1, maxY: 4 } };
    const wall = { id: "wall", rect: { minX: 6, maxX: 6, minY: 1, maxY: 1 } };
    expect(isoSortRects([wall, building])).toEqual(["bldg", "wall"]);
    expect(isoSortRects([building, wall])).toEqual(["bldg", "wall"]);
  });

  it("diagonal/ambiguous case: uses depth fallback, no oscillation", () => {
    // wall(9,3) and building(5-8,5-8): each is behind the other along a different axis
    // → mutual isoBehind → skip swap → depth fallback: wall(12) before building(16)
    const wall = { id: "wall", rect: { minX: 9, maxX: 9, minY: 3, maxY: 3 } };
    const building = { id: "bldg", rect: { minX: 5, maxX: 8, minY: 5, maxY: 8 } };
    expect(isoBehind(wall.rect, building.rect)).toBe(true); // mutual diagonal
    expect(isoBehind(building.rect, wall.rect)).toBe(true);
    // No swap: wall(12) stays before building(16)
    expect(isoSortRects([wall, building])).toEqual(["wall", "bldg"]);
    expect(isoSortRects([building, wall])).toEqual(["wall", "bldg"]);
  });

  it("three items: chain resolved correctly via multiple bubble passes", () => {
    // wall(5,1) behind building(5-8,5-8) via Y [unambiguous]
    // building behind tree(5,9) via Y [unambiguous]
    // Primary sort by depth: wall=6, tree=14, building=16 → [wall, tree, building] (wrong)
    // Bubble pass 1: swap tree↔building → [wall, building, tree] ✓
    const wall = { id: "wall", rect: { minX: 5, maxX: 5, minY: 1, maxY: 1 } };
    const building = { id: "bldg", rect: { minX: 5, maxX: 8, minY: 5, maxY: 8 } };
    const tree = { id: "tree", rect: { minX: 5, maxX: 5, minY: 9, maxY: 9 } };
    expect(isoSortRects([tree, wall, building])).toEqual(["wall", "bldg", "tree"]);
    expect(isoSortRects([building, tree, wall])).toEqual(["wall", "bldg", "tree"]);
  });
});
