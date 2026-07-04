import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  computeRenderCacheKey,
  readRenderCacheIndex,
  resolveRenderCacheHit,
  storeRenderCachePng
} from "./renderCache";
import type { BlenderRenderSpec, ProductionAssetSpec } from "./types";

describe("Blender render cache", () => {
  it("computes stable keys from render inputs without output paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asama-render-cache-key-"));
    try {
      const script = join(dir, "render_asset.py");
      await writeFile(script, "print('render v1')\n", "utf8");

      const first = await computeRenderCacheKey(testAsset(), testSpec({ outputName: "first" }), script);
      const second = await computeRenderCacheKey(testAsset(), testSpec({ outputName: "second" }), script);

      expect(first.sha256).toBe(second.sha256);
      expect(first.metadata).toEqual({
        cacheVersion: 1,
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

  it("changes keys when script contents or render inputs change", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asama-render-cache-invalidates-"));
    try {
      const script = join(dir, "render_asset.py");
      await writeFile(script, "print('render v1')\n", "utf8");

      const base = await computeRenderCacheKey(testAsset(), testSpec(), script);
      const resized = await computeRenderCacheKey(testAsset(), testSpec({ resolution: { width: 256, height: 176 } }), script);
      await writeFile(script, "print('render v2')\n", "utf8");
      const changedScript = await computeRenderCacheKey(testAsset(), testSpec(), script);

      expect(resized.sha256).not.toBe(base.sha256);
      expect(changedScript.sha256).not.toBe(base.sha256);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects hit and miss by cached PNG and persists a deterministic index", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asama-render-cache-hit-"));
    try {
      const cacheDir = join(dir, "cache");
      const rawPng = join(dir, "raw.png");
      const script = join(dir, "render_asset.py");
      await writeFile(rawPng, "fake-png", "utf8");
      await writeFile(script, "print('render')\n", "utf8");

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
