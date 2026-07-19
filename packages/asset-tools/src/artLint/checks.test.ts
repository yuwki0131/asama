import { describe, expect, it } from "vitest";
import {
  checkBuildingGeometry,
  checkFaceDrift,
  checkInteriorHoles,
  checkMatteFringe,
  checkSpeckles,
  checkTerrainFaceGeometry,
  terrainFaceSide,
  type RawImage
} from "./checks";

function makeImage(width: number, height: number): RawImage & { data: Buffer } {
  return { data: Buffer.alloc(width * height * 4), width, height };
}

function setPixel(image: RawImage & { data: Buffer }, x: number, y: number, rgba: readonly [number, number, number, number]): void {
  const i = (y * image.width + x) * 4;
  image.data[i] = rgba[0];
  image.data[i + 1] = rgba[1];
  image.data[i + 2] = rgba[2];
  image.data[i + 3] = rgba[3];
}

function fillRect(
  image: RawImage & { data: Buffer },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgba: readonly [number, number, number, number]
): void {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      setPixel(image, x, y, rgba);
    }
  }
}

const WOOD: readonly [number, number, number, number] = [150, 110, 70, 255];
const BLACK: readonly [number, number, number, number] = [5, 5, 5, 255];
const CLEAR: readonly [number, number, number, number] = [0, 0, 0, 0];

describe("GEO-01 checkBuildingGeometry", () => {
  it("passes a compliant H-32 standard lot", () => {
    expect(
      checkBuildingGeometry({ assetId: "building.storehouse", kind: "building", width: 224, height: 176, anchor: { x: 0.5, y: 144 / 176 } })
    ).toBeNull();
  });

  it("flags a standard lot off the H-32 row", () => {
    const violation = checkBuildingGeometry({
      assetId: "building.storehouse",
      kind: "building",
      width: 224,
      height: 176,
      anchor: { x: 0.5, y: 0.5 }
    });
    expect(violation?.ruleId).toBe("GEO-01");
    expect(violation?.message).toContain("H-32");
  });

  it("allows the half-tile X offset of non-square standard lots (4x3 barracks/market)", () => {
    // South-corner anchor sits (fw-fh)*16 = 16px right of canvas center.
    expect(
      checkBuildingGeometry({ assetId: "building.barracks", kind: "building", width: 256, height: 192, anchor: { x: 0.5625, y: 160 / 192 } })
    ).toBeNull();
    expect(
      checkBuildingGeometry({ assetId: "building.market", kind: "building", width: 256, height: 192, anchor: { x: 0.5625, y: 160 / 192 } })
    ).toBeNull();
  });

  it("flags a non-square standard lot whose anchor ignores the half-tile offset", () => {
    const violation = checkBuildingGeometry({
      assetId: "building.barracks",
      kind: "building",
      width: 256,
      height: 192,
      anchor: { x: 0.5, y: 160 / 192 }
    });
    expect(violation?.ruleId).toBe("GEO-01");
    expect(violation?.threshold).toContain("144.0");
  });

  it("flags the legacy benchmark tenshu.test canvas (90px apron)", () => {
    const violation = checkBuildingGeometry({
      assetId: "building.tenshu.test",
      kind: "building",
      width: 640,
      height: 520,
      anchor: { x: 0.5, y: 430 / 520 }
    });
    expect(violation?.ruleId).toBe("GEO-01");
  });

  it("passes ground tile kits with the diamond bottom on the canvas edge (height-16)", () => {
    expect(
      checkBuildingGeometry({ assetId: "building.fence.wood.connected.0101", kind: "building", width: 64, height: 64, anchor: { x: 0.5, y: 0.75 } })
    ).toBeNull();
    expect(
      checkBuildingGeometry({ assetId: "building.wall.plaster", kind: "building", width: 64, height: 96, anchor: { x: 0.5, y: 80 / 96 } })
    ).toBeNull();
    expect(
      checkBuildingGeometry({ assetId: "building.road.connected.1111", kind: "building", width: 64, height: 32, anchor: { x: 0.5, y: 0.5 } })
    ).toBeNull();
    expect(
      checkBuildingGeometry({ assetId: "deco.tree.pine.1", kind: "building", width: 64, height: 112, anchor: { x: 0.5, y: 96 / 112 } })
    ).toBeNull();
  });

  it("flags a ground tile whose anchor drifts off the diamond center", () => {
    const violation = checkBuildingGeometry({
      assetId: "building.fence.wood",
      kind: "building",
      width: 64,
      height: 64,
      anchor: { x: 0.5, y: 0.5 }
    });
    expect(violation?.ruleId).toBe("GEO-01");
    expect(violation?.message).toContain("ground-tile");
  });

  it("passes recessed moat kits anchored 16px from the canvas top", () => {
    expect(
      checkBuildingGeometry({ assetId: "building.dry_moat.connected.0101", kind: "building", width: 64, height: 48, anchor: { x: 0.5, y: 16 / 48 } })
    ).toBeNull();
    expect(
      checkBuildingGeometry({ assetId: "building.water_moat", kind: "building", width: 64, height: 32, anchor: { x: 0.5, y: 0.5 } })
    ).toBeNull();
  });

  it("passes gates on the 8px-pad block diamond formula (height-8-(n+1)*8)", () => {
    // 2-cell gate: 144 - 8 - 24 = row 112
    expect(
      checkBuildingGeometry({ assetId: "building.gate.wood.closed.width2", kind: "building", width: 160, height: 144, anchor: { x: 0.5, y: 112 / 144 } })
    ).toBeNull();
    // 3-cell gates: 160 - 8 - 32 = row 120
    expect(
      checkBuildingGeometry({ assetId: "building.gate.wood.closed.width3", kind: "building", width: 224, height: 160, anchor: { x: 0.5, y: 120 / 160 } })
    ).toBeNull();
    expect(
      checkBuildingGeometry({ assetId: "building.gate.wood.open.ne_sw.narrow3.connected.1010", kind: "building", width: 224, height: 160, anchor: { x: 0.5, y: 120 / 160 } })
    ).toBeNull();
  });

  it("flags a 3-cell gate anchored on the 2-cell row", () => {
    const violation = checkBuildingGeometry({
      assetId: "building.gate.wood.closed.width3",
      kind: "building",
      width: 224,
      height: 160,
      anchor: { x: 0.5, y: 128 / 160 }
    });
    expect(violation?.ruleId).toBe("GEO-01");
    expect(violation?.message).toContain("gate(3-cell)");
  });

  it("passes bridge decks at their per-material height (earth 24 / wood 32)", () => {
    expect(
      checkBuildingGeometry({ assetId: "building.earth_bridge.x.mid", kind: "building", width: 64, height: 48, anchor: { x: 0.5, y: 0.5 } })
    ).toBeNull();
    expect(
      checkBuildingGeometry({ assetId: "building.wood_bridge.y.start", kind: "building", width: 64, height: 72, anchor: { x: 0.5, y: 40 / 72 } })
    ).toBeNull();
  });

  it("passes a flat lot (farm) centered on its footprint diamond", () => {
    expect(
      checkBuildingGeometry({ assetId: "building.farm.autumn", kind: "building", width: 256, height: 128, anchor: { x: 0.5, y: 0.5 } })
    ).toBeNull();
  });

  it("flags a flat lot whose canvas breaks the diamond aspect", () => {
    const violation = checkBuildingGeometry({
      assetId: "building.farm",
      kind: "building",
      width: 256,
      height: 160,
      anchor: { x: 0.5, y: 0.5 }
    });
    expect(violation?.ruleId).toBe("GEO-01");
    expect(violation?.threshold).toContain("width=2*height");
  });

  it("ignores non-building assets", () => {
    expect(
      checkBuildingGeometry({ assetId: "terrain.grass.base", kind: "terrain", width: 64, height: 32, anchor: { x: 0.5, y: 0.5 } })
    ).toBeNull();
  });
});

describe("GEO-02 checkTerrainFaceGeometry", () => {
  it("passes the canonical 64x(32+40h) canvas", () => {
    expect(
      checkTerrainFaceGeometry({
        assetId: "terrain.ishigaki.face.e.h2",
        kind: "terrain",
        width: 64,
        height: 112,
        anchor: { x: 0.5, y: 16 / 112 }
      })
    ).toBeNull();
  });

  it("flags a wrong canvas height", () => {
    const violation = checkTerrainFaceGeometry({
      assetId: "terrain.cliff.corner.se.h3",
      kind: "terrain",
      width: 64,
      height: 160,
      anchor: { x: 0.5, y: 0.1 }
    });
    expect(violation?.ruleId).toBe("GEO-02");
    expect(violation?.threshold).toContain("64x152");
  });

  it("ignores assets outside the elevation family", () => {
    expect(
      checkTerrainFaceGeometry({ assetId: "terrain.grass.base", kind: "terrain", width: 48, height: 48, anchor: { x: 0.5, y: 0.5 } })
    ).toBeNull();
  });
});

describe("GEO-03 checkFaceDrift", () => {
  it("resolves face sides from assetIds", () => {
    expect(terrainFaceSide("terrain.ishigaki.face.e.h4")).toBe("e");
    expect(terrainFaceSide("terrain.cliff.face.s.h1")).toBe("s");
    expect(terrainFaceSide("terrain.ishigaki.corner.se.h4")).toBeNull();
  });

  it("passes an e face whose top band stays in the right half", () => {
    const image = makeImage(64, 72);
    fillRect(image, 32, 16, 63, 60, WOOD);
    expect(checkFaceDrift("terrain.ishigaki.face.e.h1", image)).toBeNull();
  });

  it("flags an e face drifting left across the seam (ishigaki h4/h5 bug)", () => {
    const image = makeImage(64, 192);
    fillRect(image, 0, 16, 63, 180, WOOD); // minX=0 < 32-13
    const violation = checkFaceDrift("terrain.ishigaki.face.e.h4", image);
    expect(violation?.ruleId).toBe("GEO-03");
    expect(violation?.measured).toContain("minX=0");
  });

  it("flags an s face drifting right across the seam", () => {
    const image = makeImage(64, 72);
    fillRect(image, 0, 16, 39, 60, WOOD); // maxX=39 > 32+2 (cliff margin)
    const violation = checkFaceDrift("terrain.cliff.face.s.h1", image);
    expect(violation?.ruleId).toBe("GEO-03");
    expect(violation?.measured).toContain("maxX=39");
  });

  it("allows the 2px margin on cliffs", () => {
    const image = makeImage(64, 72);
    fillRect(image, 30, 16, 63, 60, WOOD); // minX=30 is inside the margin
    expect(checkFaceDrift("terrain.cliff.face.e.h1", image)).toBeNull();
  });

  it("allows the 13px sori projection on ishigaki (ISHIGAKI-01 cap)", () => {
    const image = makeImage(64, 112);
    fillRect(image, 21, 16, 63, 100, WOOD); // minX=21 >= 32-13
    expect(checkFaceDrift("terrain.ishigaki.face.e.h2", image)).toBeNull();
    const drifted = makeImage(64, 112);
    fillRect(drifted, 11, 16, 63, 100, WOOD); // pre-fix h2 bug: minX=11
    expect(checkFaceDrift("terrain.ishigaki.face.e.h2", drifted)?.ruleId).toBe("GEO-03");
  });
});

describe("NOISE-01 checkSpeckles", () => {
  it("passes a single solid body", () => {
    const image = makeImage(32, 32);
    fillRect(image, 8, 8, 24, 24, WOOD);
    expect(checkSpeckles("building.test", image)).toBeNull();
  });

  it("flags an isolated component under 4px", () => {
    const image = makeImage(32, 32);
    fillRect(image, 8, 8, 24, 24, WOOD);
    setPixel(image, 2, 2, WOOD);
    setPixel(image, 3, 2, WOOD); // 2px isolated speckle
    const violation = checkSpeckles("building.test", image);
    expect(violation?.ruleId).toBe("NOISE-01");
    expect(violation?.measured).toContain("smallest=2px");
  });

  it("accepts detached components of at least 4px", () => {
    const image = makeImage(32, 32);
    fillRect(image, 8, 8, 24, 24, WOOD);
    fillRect(image, 2, 2, 3, 3, WOOD); // 4px block is allowed
    expect(checkSpeckles("building.test", image)).toBeNull();
  });
});

describe("NOISE-02 checkMatteFringe", () => {
  it("passes a body with clean bright edges", () => {
    const image = makeImage(32, 32);
    fillRect(image, 8, 8, 24, 24, WOOD);
    expect(checkMatteFringe("building.test", image)).toBeNull();
  });

  it("flags a near-black fringe around the silhouette", () => {
    const image = makeImage(32, 32);
    fillRect(image, 8, 8, 24, 24, WOOD);
    // 1px black matte ring around the body.
    fillRect(image, 7, 7, 25, 7, BLACK);
    fillRect(image, 7, 25, 25, 25, BLACK);
    fillRect(image, 7, 8, 7, 24, BLACK);
    fillRect(image, 25, 8, 25, 24, BLACK);
    const violation = checkMatteFringe("building.test", image);
    expect(violation?.ruleId).toBe("NOISE-02");
    expect(violation?.threshold).toBe("<=8%");
  });

  it("tolerates dark pixels below the ratio threshold", () => {
    const image = makeImage(32, 32);
    fillRect(image, 8, 8, 24, 24, WOOD);
    setPixel(image, 8, 8, BLACK); // one dark corner pixel only
    expect(checkMatteFringe("building.test", image)).toBeNull();
  });
});

describe("NOISE-03 checkInteriorHoles", () => {
  it("passes a solid body", () => {
    const image = makeImage(32, 32);
    fillRect(image, 4, 4, 28, 28, WOOD);
    expect(checkInteriorHoles("building.test", image)).toBeNull();
  });

  it("flags a fully enclosed transparent hole", () => {
    const image = makeImage(32, 32);
    fillRect(image, 4, 4, 28, 28, WOOD);
    fillRect(image, 14, 14, 16, 15, CLEAR); // 6px pinhole inside the body
    const violation = checkInteriorHoles("building.test", image);
    expect(violation?.ruleId).toBe("NOISE-03");
    expect(violation?.measured).toContain("largest=6px");
  });

  it("does not count transparent regions reaching the border", () => {
    const image = makeImage(32, 32);
    fillRect(image, 4, 4, 28, 28, WOOD);
    fillRect(image, 0, 14, 16, 15, CLEAR); // notch open to the border
    expect(checkInteriorHoles("building.test", image)).toBeNull();
  });
});
