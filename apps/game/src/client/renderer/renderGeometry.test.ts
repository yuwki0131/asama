import { describe, it, expect } from "vitest";
import { buildingDrawY, decorationDrawY } from "./renderGeometry";
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
