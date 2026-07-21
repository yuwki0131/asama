import { describe, expect, it } from "vitest";
import {
  CELL_SIZE,
  ELEVATION_HEIGHT,
  buildingAnchorToThreeWorld,
  cellCenterToThreeWorld,
  cellToThreeWorld,
  threeWorldToCell,
  threeWorldToCellFloat
} from "./coord";

describe("cellToThreeWorld", () => {
  it("maps integer cells linearly to world units", () => {
    expect(cellToThreeWorld({ x: 0, y: 0 })).toEqual({ x: 0, y: 0, z: 0 });
    expect(cellToThreeWorld({ x: 4, y: 3 })).toEqual({
      x: 4 * CELL_SIZE,
      y: 0,
      z: 3 * CELL_SIZE
    });
  });
  it("lifts by elevation * ELEVATION_HEIGHT", () => {
    expect(cellToThreeWorld({ x: 2, y: 1 }, 2)).toEqual({
      x: 2 * CELL_SIZE,
      y: 2 * ELEVATION_HEIGHT,
      z: 1 * CELL_SIZE
    });
  });
});

describe("cellCenterToThreeWorld", () => {
  it("shifts the anchor by half a cell so billboards sit on the cell center", () => {
    expect(cellCenterToThreeWorld({ x: 4, y: 3 }, 0)).toEqual({
      x: 4.5 * CELL_SIZE,
      y: 0,
      z: 3.5 * CELL_SIZE
    });
  });
});

describe("threeWorldToCell", () => {
  it("floors world coords into integer cell coords", () => {
    expect(threeWorldToCell(0, 0)).toEqual({ x: 0, y: 0 });
    expect(threeWorldToCell(3.9 * CELL_SIZE, 2.1 * CELL_SIZE)).toEqual({ x: 3, y: 2 });
  });
  it("is inverse-consistent with cellToThreeWorld for integer inputs", () => {
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const w = cellToThreeWorld({ x, y });
        expect(threeWorldToCell(w.x + CELL_SIZE / 2, w.z + CELL_SIZE / 2)).toEqual({ x, y });
      }
    }
  });
});

describe("threeWorldToCellFloat", () => {
  it("returns fractional cell coords for interpolated positions", () => {
    expect(threeWorldToCellFloat(1.5 * CELL_SIZE, 2.25 * CELL_SIZE)).toEqual({
      x: 1.5,
      y: 2.25
    });
  });
});

describe("buildingAnchorToThreeWorld", () => {
  it("places the anchor at the footprint center", () => {
    expect(buildingAnchorToThreeWorld({ x: 10, y: 10 }, 2, 2)).toEqual({
      x: 11 * CELL_SIZE,
      y: 0,
      z: 11 * CELL_SIZE
    });
    expect(buildingAnchorToThreeWorld({ x: 10, y: 10 }, 3, 1)).toEqual({
      x: 11.5 * CELL_SIZE,
      y: 0,
      z: 10.5 * CELL_SIZE
    });
  });
  it("respects elevation", () => {
    expect(buildingAnchorToThreeWorld({ x: 0, y: 0 }, 2, 2, 3)).toEqual({
      x: 1 * CELL_SIZE,
      y: 3 * ELEVATION_HEIGHT,
      z: 1 * CELL_SIZE
    });
  });
});
