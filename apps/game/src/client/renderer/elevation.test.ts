import { describe, expect, it } from "vitest";
import type { SlopeDirection, TerrainCellSnapshot } from "@asama/shared";
import { cellToWorld, screenToCell, type CameraState } from "./camera";
import {
  cliffInfoFor,
  edgeSurfaceHeight,
  ELEVATION_PIXELS_PER_LEVEL,
  mapHasElevation,
  pickCellAtScreenPoint,
  surfaceOffsetYAt,
  tileOffsetYAt,
  type ElevationMapLike
} from "./elevation";

interface CellSpec {
  readonly elevation?: number;
  readonly slope?: SlopeDirection | null;
  readonly skin?: "cliff" | "ishigaki";
  readonly terrain?: "grass" | "water";
}

/** Builds a width×height map; `specs` overrides cells by "x,y" key. */
function makeMap(width: number, height: number, specs: Record<string, CellSpec> = {}): ElevationMapLike {
  const cells: TerrainCellSnapshot[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const spec = specs[`${x},${y}`] ?? {};
      cells.push({
        coord: { x, y },
        terrain: spec.terrain ?? "grass",
        movementCost: 1,
        passable: true,
        assetId: "terrain.grass.base",
        elevation: spec.elevation ?? 0,
        slope: spec.slope ?? null,
        elevationSkin: spec.skin ?? "cliff"
      });
    }
  }
  return { width, height, cells };
}

function cellAt(map: ElevationMapLike, x: number, y: number): TerrainCellSnapshot {
  const cell = map.cells[y * map.width + x];
  if (cell === undefined) throw new Error(`no cell ${x},${y}`);
  return cell;
}

const CAMERA: CameraState = { x: 0, y: 0, zoom: 1 };

describe("offsets", () => {
  it("lifts tiles 40px per elevation level", () => {
    const map = makeMap(4, 4, { "1,1": { elevation: 2 } });
    expect(tileOffsetYAt(map, { x: 1, y: 1 })).toBe(-80);
    expect(tileOffsetYAt(map, { x: 0, y: 0 })).toBe(0);
    expect(tileOffsetYAt(map, { x: -1, y: 0 })).toBe(0);
    expect(tileOffsetYAt(null, { x: 1, y: 1 })).toBe(0);
  });

  it("puts the walking surface of a slope half a level up", () => {
    const map = makeMap(4, 4, { "1,1": { elevation: 1, slope: "N" } });
    expect(surfaceOffsetYAt(map, { x: 1, y: 1 })).toBe(-1.5 * ELEVATION_PIXELS_PER_LEVEL);
    expect(surfaceOffsetYAt(map, { x: 0, y: 0 })).toBe(0);
  });
});

describe("edgeSurfaceHeight", () => {
  it("returns the elevation on every edge of a flat cell", () => {
    const cell = { elevation: 2, slope: null };
    for (const direction of ["N", "E", "S", "W"] as const) {
      expect(edgeSurfaceHeight(cell, direction)).toBe(2);
    }
  });

  it("returns high uphill, low downhill and null on the sides of a slope", () => {
    const cell = { elevation: 1, slope: "N" as const };
    expect(edgeSurfaceHeight(cell, "N")).toBe(2);
    expect(edgeSurfaceHeight(cell, "S")).toBe(1);
    expect(edgeSurfaceHeight(cell, "E")).toBeNull();
    expect(edgeSurfaceHeight(cell, "W")).toBeNull();
  });
});

describe("cliffInfoFor", () => {
  it("emits no faces for flat ground or when neighbours match", () => {
    const map = makeMap(4, 4, {
      "1,1": { elevation: 1 },
      "2,1": { elevation: 1 },
      "1,2": { elevation: 1 }
    });
    expect(cliffInfoFor(map, cellAt(map, 0, 0)).faces).toHaveLength(0);
    // (1,1) has S and E neighbours at the same level → no faces.
    expect(cliffInfoFor(map, cellAt(map, 1, 1)).faces).toHaveLength(0);
  });

  it("emits S and E faces plus the SE corner where both neighbours are lower", () => {
    const map = makeMap(4, 4, { "1,1": { elevation: 2, skin: "ishigaki" } });
    const info = cliffInfoFor(map, cellAt(map, 1, 1));
    expect(info.faces.map((f) => f.assetId).sort()).toEqual([
      "terrain.ishigaki.face.e.h2",
      "terrain.ishigaki.face.s.h2"
    ]);
    for (const face of info.faces) {
      expect(face.topA).toBe(2);
      expect(face.topB).toBe(2);
      expect(face.bottom).toBe(0);
    }
    expect(info.cornerAssetId).toBe("terrain.ishigaki.corner.se.h2");
  });

  it("uses the partial drop height against a mid-level neighbour", () => {
    const map = makeMap(4, 4, {
      "1,1": { elevation: 3 },
      "1,2": { elevation: 1 }
    });
    const info = cliffInfoFor(map, cellAt(map, 1, 1));
    const south = info.faces.find((f) => f.edge === "s");
    expect(south?.assetId).toBe("terrain.cliff.face.s.h2");
    expect(south?.bottom).toBe(1);
  });

  it("draws no face on the up/downhill edges of a valid slope chain", () => {
    // (1,0) level 1 flat, (1,1) slope N at level 0, (1,2) level 0 flat.
    const map = makeMap(4, 4, {
      "1,0": { elevation: 1 },
      "1,1": { elevation: 0, slope: "N" }
    });
    // The high cell's S edge meets the slope's top edge (both 1): no S face.
    const high = cliffInfoFor(map, cellAt(map, 1, 0));
    expect(high.faces.find((f) => f.edge === "s")).toBeUndefined();
    // The slope's own S edge meets the flat ground (both 0): no face there,
    // but its E side is a slanted slope side wall.
    const slope = cliffInfoFor(map, cellAt(map, 1, 1));
    const east = slope.faces.find((f) => f.edge === "e");
    expect(east?.assetId).toBe("terrain.slope.cliff.n.side.e");
    expect(east?.topA).toBe(0); // S corner (downhill end)
    expect(east?.topB).toBe(1); // E corner (uphill end)
    expect(slope.faces.find((f) => f.edge === "s")).toBeUndefined();
  });

  it("treats the map border as level 0", () => {
    const map = makeMap(2, 2, { "1,1": { elevation: 1 } });
    const info = cliffInfoFor(map, cellAt(map, 1, 1));
    expect(info.faces).toHaveLength(2);
    expect(info.faces.every((f) => f.bottom === 0)).toBe(true);
  });
});

describe("mapHasElevation", () => {
  it("is false for flat maps and true when any cell is raised or sloped", () => {
    expect(mapHasElevation(makeMap(3, 3))).toBe(false);
    expect(mapHasElevation(makeMap(3, 3, { "2,2": { elevation: 1 } }))).toBe(true);
    expect(mapHasElevation(makeMap(3, 3, { "2,2": { slope: "N" } }))).toBe(true);
  });
});

describe("pickCellAtScreenPoint", () => {
  it("matches the flat inverse on flat maps and without a map", () => {
    const map = makeMap(8, 8);
    const point = cellToWorld({ x: 3, y: 2 });
    expect(pickCellAtScreenPoint(point.x, point.y, CAMERA, map)).toEqual({ x: 3, y: 2 });
    expect(pickCellAtScreenPoint(point.x, point.y, CAMERA, null)).toEqual(
      screenToCell(point.x, point.y, CAMERA)
    );
  });

  it("hits an elevated cell at its lifted position", () => {
    const map = makeMap(8, 8, { "3,3": { elevation: 2 } });
    const point = cellToWorld({ x: 3, y: 3 });
    const lifted = { x: point.x, y: point.y - 2 * ELEVATION_PIXELS_PER_LEVEL };
    expect(pickCellAtScreenPoint(lifted.x, lifted.y, CAMERA, map)).toEqual({ x: 3, y: 3 });
    // The unlifted center now shows the cell's own cliff wall (the S/E faces
    // hang inside the flat diamond footprint), so the flat fallback resolves
    // cliff-face clicks to the owning high cell.
    expect(pickCellAtScreenPoint(point.x, point.y, CAMERA, map)).toEqual({ x: 3, y: 3 });
  });

  it("prefers the high cell where its lifted diamond covers cells behind it", () => {
    // (3,3) at level 3: flat center (0, 96) lifts to (0, 96-3*40) = (0, -24).
    // The flat-grid inverse of (0, -24) would be (-1, -1) — but what is
    // painted there is the summit of (3,3), so the pick must return (3,3).
    const map = makeMap(8, 8, { "3,3": { elevation: 3 } });
    const summit = cellToWorld({ x: 3, y: 3 });
    const lifted = { x: summit.x, y: summit.y - 3 * ELEVATION_PIXELS_PER_LEVEL };
    expect(screenToCell(lifted.x, lifted.y, CAMERA)).toEqual({ x: -1, y: -1 });
    expect(pickCellAtScreenPoint(lifted.x, lifted.y, CAMERA, map)).toEqual({ x: 3, y: 3 });
    // The uncovered ground of (2,2) (screen y 64: below the lifted summit
    // diamond, above the flat position of (3,3)) still picks (2,2).
    const behind = cellToWorld({ x: 2, y: 2 });
    expect(pickCellAtScreenPoint(behind.x, behind.y, CAMERA, map)).toEqual({ x: 2, y: 2 });
  });

  it("accepts a slope cell at both its base and lifted level", () => {
    const map = makeMap(8, 8, { "3,3": { elevation: 1, slope: "N" } });
    const point = cellToWorld({ x: 3, y: 3 });
    // Base level (1): lifted by 24px.
    const base = { x: point.x, y: point.y - ELEVATION_PIXELS_PER_LEVEL };
    expect(pickCellAtScreenPoint(base.x, base.y, CAMERA, map)).toEqual({ x: 3, y: 3 });
    // Upper level (2): lifted by 48px.
    const upper = { x: point.x, y: point.y - 2 * ELEVATION_PIXELS_PER_LEVEL };
    expect(pickCellAtScreenPoint(upper.x, upper.y, CAMERA, map)).toEqual({ x: 3, y: 3 });
  });

  it("honours camera pan and zoom", () => {
    const camera: CameraState = { x: 120, y: -60, zoom: 2 };
    const map = makeMap(8, 8, { "4,2": { elevation: 1 } });
    const world = cellToWorld({ x: 4, y: 2 });
    const screenX = camera.x + world.x * camera.zoom;
    const screenY = camera.y + (world.y - ELEVATION_PIXELS_PER_LEVEL) * camera.zoom;
    expect(pickCellAtScreenPoint(screenX, screenY, camera, map)).toEqual({ x: 4, y: 2 });
  });

  it("falls back to the flat inverse for off-map points", () => {
    const map = makeMap(4, 4, { "1,1": { elevation: 1 } });
    const far = cellToWorld({ x: 40, y: 40 });
    expect(pickCellAtScreenPoint(far.x, far.y, CAMERA, map)).toEqual({ x: 40, y: 40 });
  });
});
