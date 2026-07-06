import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  computeAnimationCacheKey,
  readAnimationCacheIndex,
  resolveAnimationCacheHit,
  storeAnimationCachePng,
  writeAnimationCacheIndex
} from "./animationCache";
import type { AnimationActionSpec, AnimationAssetSpec } from "./types";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeScriptTree(): Promise<{ readonly entryScript: string; readonly animDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "anim-cache-test-"));
  tempDirs.push(root);
  const libDir = join(root, "render_asset_lib");
  const animDir = join(libDir, "anim");
  await mkdir(animDir, { recursive: true });
  const entryScript = join(root, "render_anim_asset.py");
  await writeFile(entryScript, "entry-v1\n");
  await writeFile(join(libDir, "core.py"), "core-v1\n");
  await writeFile(join(libDir, "materials.py"), "materials-v1\n");
  await writeFile(join(animDir, "ashigaru.py"), "ashigaru-v1\n");
  await writeFile(join(animDir, "actions.py"), "actions-v1\n");
  return { entryScript, animDir };
}

const baseAsset: AnimationAssetSpec = {
  assetId: "unit.spear_ashigaru",
  kind: "unit",
  model: "unit-spear-ashigaru-rigged",
  renderSpec: "painterly",
  supersample: 2,
  directions: 8,
  frameCanvas: { width: 48, height: 64, anchorX: 24, anchorY: 52.48 },
  actions: [{ name: "walk", frames: 8, fps: 10, loop: true }],
  postprocess: { sharpen: { sigma: 0.45 } }
};

const walk: AnimationActionSpec = { name: "walk", frames: 8, fps: 10, loop: true };

describe("computeAnimationCacheKey", () => {
  it("is deterministic for identical inputs", async () => {
    const { entryScript } = await makeScriptTree();
    const first = await computeAnimationCacheKey(baseAsset, walk, entryScript);
    const second = await computeAnimationCacheKey(baseAsset, walk, entryScript);
    expect(first.sha256).toBe(second.sha256);
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.metadata.action).toBe("walk");
    expect(first.metadata.directions).toEqual(["s", "se", "e", "ne", "n", "nw", "w", "sw"]);
  });

  it("changes when any animation library file changes", async () => {
    const { entryScript, animDir } = await makeScriptTree();
    const before = await computeAnimationCacheKey(baseAsset, walk, entryScript);
    await writeFile(join(animDir, "actions.py"), "actions-v2\n");
    const after = await computeAnimationCacheKey(baseAsset, walk, entryScript);
    expect(after.sha256).not.toBe(before.sha256);
  });

  it("changes when a new animation library file is added", async () => {
    const { entryScript, animDir } = await makeScriptTree();
    const before = await computeAnimationCacheKey(baseAsset, walk, entryScript);
    await writeFile(join(animDir, "cavalry.py"), "cavalry-v1\n");
    const after = await computeAnimationCacheKey(baseAsset, walk, entryScript);
    expect(after.sha256).not.toBe(before.sha256);
  });

  it("changes with render parameters (frames, supersample, sharpen)", async () => {
    const { entryScript } = await makeScriptTree();
    const base = await computeAnimationCacheKey(baseAsset, walk, entryScript);
    const differentFrames = await computeAnimationCacheKey(baseAsset, { ...walk, frames: 6 }, entryScript);
    const differentSupersample = await computeAnimationCacheKey({ ...baseAsset, supersample: 3 }, walk, entryScript);
    const differentSharpen = await computeAnimationCacheKey(
      { ...baseAsset, postprocess: { sharpen: { sigma: 0.6 } } },
      walk,
      entryScript
    );
    expect(new Set([base.sha256, differentFrames.sha256, differentSupersample.sha256, differentSharpen.sha256]).size).toBe(4);
  });

  it("distinguishes actions of the same model", async () => {
    const { entryScript } = await makeScriptTree();
    const walkKey = await computeAnimationCacheKey(baseAsset, walk, entryScript);
    const idleKey = await computeAnimationCacheKey(baseAsset, { name: "idle", frames: 8, fps: 10, loop: true }, entryScript);
    expect(walkKey.sha256).not.toBe(idleKey.sha256);
  });
});

describe("animation cache store/hit", () => {
  it("round-trips PNGs and index entries in an isolated directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "anim-cache-store-"));
    tempDirs.push(root);
    const cacheDir = join(root, "render-cache", "anim");
    const { entryScript } = await makeScriptTree();
    const key = await computeAnimationCacheKey(baseAsset, walk, entryScript);

    expect(await resolveAnimationCacheHit(cacheDir, key.sha256)).toBeNull();

    const sheetPath = join(root, "sheet.png");
    await writeFile(sheetPath, Buffer.from("not-a-real-png"));
    const index = await readAnimationCacheIndex(cacheDir);
    await storeAnimationCachePng(cacheDir, key.sha256, sheetPath, index, key.metadata);

    expect(await resolveAnimationCacheHit(cacheDir, key.sha256)).toBe(join(cacheDir, `${key.sha256}.png`));
    const reloaded = await readAnimationCacheIndex(cacheDir);
    expect(reloaded[key.sha256]).toEqual(key.metadata);
  });

  it("ignores entries from other cache versions", async () => {
    const root = await mkdtemp(join(tmpdir(), "anim-cache-version-"));
    tempDirs.push(root);
    const cacheDir = join(root, "anim");
    const staleKey = "a".repeat(64);
    await mkdir(cacheDir, { recursive: true });
    await writeAnimationCacheIndex(cacheDir, {});
    await writeFile(
      join(cacheDir, "index.json"),
      `${JSON.stringify({ [staleKey]: { cacheVersion: 99 } }, null, 2)}\n`,
      "utf8"
    );
    const index = await readAnimationCacheIndex(cacheDir);
    expect(index[staleKey]).toBeUndefined();
  });
});
