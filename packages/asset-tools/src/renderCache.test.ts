import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  computeRenderCacheKey,
  modelToDomain,
  readRenderCacheIndex,
  resolveRenderCacheHit,
  storeRenderCachePng
} from "./renderCache";
import type { BlenderRenderSpec, ProductionAssetSpec } from "./types";

describe("modelToDomain", () => {
  it("maps tree-* to vegetation", () => {
    expect(modelToDomain("tree-pine")).toBe("vegetation");
    expect(modelToDomain("tree-cedar")).toBe("vegetation");
    expect(modelToDomain("tree-broadleaf")).toBe("vegetation");
  });

  it("maps deco-* to vegetation", () => {
    expect(modelToDomain("deco-bush")).toBe("vegetation");
    expect(modelToDomain("deco-weeds")).toBe("vegetation");
  });

  it("maps bamboo-* to vegetation", () => {
    expect(modelToDomain("bamboo-cluster")).toBe("vegetation");
  });

  it("maps rock-* to vegetation", () => {
    expect(modelToDomain("rock-cluster")).toBe("vegetation");
  });

  it("maps reeds to vegetation", () => {
    expect(modelToDomain("reeds")).toBe("vegetation");
  });

  it("maps terrain-* to terrain", () => {
    expect(modelToDomain("terrain-grass-base")).toBe("terrain");
    expect(modelToDomain("terrain-grass-connected-1010")).toBe("terrain");
    expect(modelToDomain("terrain-water-connected-0101-v1")).toBe("terrain");
  });

  it("maps road-* to terrain", () => {
    expect(modelToDomain("road-connected-1111")).toBe("terrain");
  });

  it("maps dry-moat-* to terrain", () => {
    expect(modelToDomain("dry-moat-connected-1010")).toBe("terrain");
  });

  it("maps water-moat-* to terrain", () => {
    expect(modelToDomain("water-moat-connected-0110")).toBe("terrain");
  });

  it("maps *-bridge to terrain", () => {
    expect(modelToDomain("building-earth-bridge")).toBe("terrain");
    expect(modelToDomain("building-wood-bridge")).toBe("terrain");
  });

  it("maps unit-* to units", () => {
    expect(modelToDomain("unit-engineer")).toBe("units");
  });

  it("maps building-* and wall-* and gate-* to buildings", () => {
    expect(modelToDomain("building-yagura-small-graybox")).toBe("buildings");
    expect(modelToDomain("building-storehouse-graybox")).toBe("buildings");
    expect(modelToDomain("wall-plaster-connected-1010")).toBe("buildings");
    expect(modelToDomain("wall-ladder")).toBe("buildings");
    expect(modelToDomain("gate-wood-closed-nw_se-w2-1100")).toBe("buildings");
    expect(modelToDomain("fence-wood-connected-1010")).toBe("buildings");
  });

  it("maps calibration-* to buildings (fallthrough)", () => {
    expect(modelToDomain("calibration-tile")).toBe("buildings");
    expect(modelToDomain("calibration-cube")).toBe("buildings");
  });
});

describe("Blender render cache", () => {
  it("computes stable keys from render inputs without output paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asama-render-cache-key-"));
    try {
      const script = await makeLibStub(dir);

      const first = await computeRenderCacheKey(testAsset(), testSpec({ outputName: "first" }), script);
      const second = await computeRenderCacheKey(testAsset(), testSpec({ outputName: "second" }), script);

      expect(first.sha256).toBe(second.sha256);
      expect(first.metadata).toEqual({
        cacheVersion: 2,
        assetId: "building.yagura.small.normal",
        model: "yagura-small",
        canvas: { width: 192, height: 176 },
        anchor: { x: 96, y: 156 },
        renderSpec: "iso-building-default",
        transparentBackground: true,
        supersample: 1,
        renderScriptSha256: expect.stringMatching(/^[0-9a-f]{64}$/)
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("changes keys when a module's contents change", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asama-render-cache-invalidates-"));
    try {
      const script = await makeLibStub(dir);
      const libDir = join(dir, "render_asset_lib");

      const base = await computeRenderCacheKey(testAsset(), testSpec(), script);
      const resized = await computeRenderCacheKey(testAsset(), testSpec({ resolution: { width: 256, height: 176 } }), script);

      await writeFile(join(libDir, "core.py"), "# core v2\n", "utf8");
      const changedCore = await computeRenderCacheKey(testAsset(), testSpec(), script);

      await writeFile(join(libDir, "core.py"), "# core v1\n", "utf8");
      await writeFile(join(libDir, "buildings.py"), "# buildings v2\n", "utf8");
      const changedDomain = await computeRenderCacheKey(testAsset(), testSpec(), script);

      expect(resized.sha256).not.toBe(base.sha256);
      expect(changedCore.sha256).not.toBe(base.sha256);
      expect(changedDomain.sha256).not.toBe(base.sha256);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects hit and miss by cached PNG and persists a deterministic index", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asama-render-cache-hit-"));
    try {
      const cacheDir = join(dir, "cache");
      const rawPng = join(dir, "raw.png");
      const script = await makeLibStub(dir);
      await writeFile(rawPng, "fake-png", "utf8");

      const key = await computeRenderCacheKey(testAsset(), testSpec(), script);
      expect(await resolveRenderCacheHit(cacheDir, key.sha256)).toBeNull();

      const index = await readRenderCacheIndex(cacheDir);
      await storeRenderCachePng(cacheDir, key.sha256, rawPng, index, key.metadata);

      expect(await resolveRenderCacheHit(cacheDir, key.sha256)).toBe(join(cacheDir, `${key.sha256}.png`));
      expect(await readRenderCacheIndex(cacheDir)).toEqual({ [key.sha256]: key.metadata });
      expect(await readFile(join(cacheDir, "index.json"), "utf8")).not.toContain("renderedAt");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/** Creates a minimal render_asset_lib stub under dir and returns the entry script path. */
async function makeLibStub(dir: string): Promise<string> {
  const libDir = join(dir, "render_asset_lib");
  await mkdir(libDir, { recursive: true });
  const script = join(dir, "render_asset.py");
  await writeFile(script, "# entry\n", "utf8");
  await writeFile(join(libDir, "core.py"), "# core v1\n", "utf8");
  await writeFile(join(libDir, "materials.py"), "# materials v1\n", "utf8");
  await writeFile(join(libDir, "registry.py"), "# registry v1\n", "utf8");
  await writeFile(join(libDir, "buildings.py"), "# buildings v1\n", "utf8");
  await writeFile(join(libDir, "terrain.py"), "# terrain v1\n", "utf8");
  await writeFile(join(libDir, "vegetation.py"), "# vegetation v1\n", "utf8");
  await writeFile(join(libDir, "units.py"), "# units v1\n", "utf8");
  return script;
}

function testAsset(): ProductionAssetSpec {
  return {
    assetId: "building.yagura.small.normal",
    kind: "building",
    output: "building-yagura-small-normal.png",
    source: {
      type: "blender",
      model: "yagura-small",
      renderSpec: "iso-building-default"
    },
    geometry: {
      footprintWidth: 2,
      footprintHeight: 2,
      canvasWidth: 192,
      canvasHeight: 176,
      anchorX: 96,
      anchorY: 156
    }
  };
}

function testSpec(overrides: Partial<BlenderRenderSpec> = {}): BlenderRenderSpec {
  return {
    model: "yagura-small",
    outputDirectory: "assets/intermediate/raw-renders",
    outputName: "building-yagura-small-normal",
    resolution: { width: 192, height: 176 },
    anchor: { x: 96, y: 156 },
    transparentBackground: true,
    renderSpec: "iso-building-default",
    ...overrides
  };
}
