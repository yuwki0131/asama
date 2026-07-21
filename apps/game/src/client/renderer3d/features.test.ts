import { describe, expect, it } from "vitest";
import { validateAreaPolygon, validateLinearPath } from "./features";

describe("validateLinearPath", () => {
  it("rejects zero and single-point paths", () => {
    expect(validateLinearPath([])).toBeTruthy();
    expect(validateLinearPath([{ x: 0, y: 0 }])).toBeTruthy();
  });
  it("rejects duplicate consecutive points", () => {
    expect(
      validateLinearPath([
        { x: 0, y: 0 },
        { x: 0, y: 0 }
      ])
    ).toBeTruthy();
  });
  it("accepts a valid polyline", () => {
    expect(
      validateLinearPath([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 }
      ])
    ).toBeNull();
  });
});

describe("validateAreaPolygon", () => {
  it("rejects polygons with fewer than 3 vertices", () => {
    expect(validateAreaPolygon([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBeTruthy();
  });
  it("rejects duplicate adjacent vertices", () => {
    expect(
      validateAreaPolygon([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      ])
    ).toBeTruthy();
  });
  it("accepts a valid triangle", () => {
    expect(
      validateAreaPolygon([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 }
      ])
    ).toBeNull();
  });
});
