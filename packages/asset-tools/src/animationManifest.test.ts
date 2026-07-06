import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { readAnimationAssetConfigDir, animationManifestId, animationSheetFileName } from "./animationConfig";
import {
  mergeAnimationManifest,
  toAnimationManifestEntries,
  toAnimationManifestEntry,
  validateAnimationManifest
} from "./animationManifest";
import { readManifest } from "./manifest";
import type { AnimationAssetSpec, AssetManifest } from "./types";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const asset: AnimationAssetSpec = {
  assetId: "unit.spear_ashigaru",
  kind: "unit",
  model: "unit-spear-ashigaru-rigged",
  renderSpec: "painterly",
  supersample: 2,
  directions: 8,
  frameCanvas: { width: 48, height: 64, anchorX: 24, anchorY: 52.48 },
  actions: [
    { name: "walk", frames: 8, fps: 10, loop: true },
    { name: "death", frames: 3, fps: 8, loop: false }
  ]
};

describe("naming helpers", () => {
  it("derives sheet file names from assetId + action", () => {
    expect(animationSheetFileName("unit.spear_ashigaru", "walk")).toBe("unit-spear-ashigaru-walk-sheet.png");
    expect(animationManifestId("unit.spear_ashigaru", "walk")).toBe("unit.spear_ashigaru.anim.walk");
  });
});

describe("toAnimationManifestEntry", () => {
  it("computes sheet geometry and normalized anchor", () => {
    const entry = toAnimationManifestEntry(asset, asset.actions[0]!);
    expect(entry).toEqual({
      assetId: "unit.spear_ashigaru.anim.walk",
      unitAssetId: "unit.spear_ashigaru",
      action: "walk",
      kind: "unit",
      file: "generated/unit-spear-ashigaru-walk-sheet.png",
      sheet: { width: 384, height: 512 },
      frame: { width: 48, height: 64 },
      frames: 8,
      fps: 10,
      loop: true,
      directions: ["s", "se", "e", "ne", "n", "nw", "w", "sw"],
      layout: { columns: "frames", rows: "directions" },
      anchor: { x: 0.5, y: 0.82 }
    });
  });

  it("keeps loop=false for death and sizes the narrow sheet", () => {
    const entry = toAnimationManifestEntry(asset, asset.actions[1]!);
    expect(entry.loop).toBe(false);
    expect(entry.sheet).toEqual({ width: 144, height: 512 });
  });
});

describe("mergeAnimationManifest", () => {
  it("adds an animations section while preserving assets, and stays readable by the legacy reader", async () => {
    const dir = await makeTempDir("anim-manifest-");
    const manifestPath = join(dir, "manifest.json");
    const staticAssets = [
      {
        assetId: "unit.spear_ashigaru.idle.south",
        kind: "unit",
        file: "generated/unit-spear-ashigaru-idle-south.png",
        width: 48,
        height: 64,
        anchor: { x: 0.5, y: 0.82 }
      }
    ];
    await writeFile(
      manifestPath,
      JSON.stringify({ version: 1, generatedBy: "@asama/asset-tools production", assets: staticAssets }, null, 2),
      "utf8"
    );

    await mergeAnimationManifest(manifestPath, toAnimationManifestEntries([asset]));

    const merged = JSON.parse(await readFile(manifestPath, "utf8")) as AssetManifest;
    expect(merged.version).toBe(1);
    expect(merged.assets).toEqual(staticAssets);
    expect(merged.animations?.map((entry) => entry.assetId)).toEqual([
      "unit.spear_ashigaru.anim.death",
      "unit.spear_ashigaru.anim.walk"
    ]);

    // Backward compatibility: the pre-2.0 manifest reader still accepts it.
    const legacyView = await readManifest(manifestPath);
    expect(legacyView.assets.length).toBe(1);
  });

  it("replaces entries by assetId on re-merge instead of duplicating", async () => {
    const dir = await makeTempDir("anim-manifest-remerge-");
    const manifestPath = join(dir, "manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({ version: 1, generatedBy: "x", assets: [] }, null, 2),
      "utf8"
    );
    await mergeAnimationManifest(manifestPath, toAnimationManifestEntries([asset]));
    const updated: AnimationAssetSpec = {
      ...asset,
      actions: [{ name: "walk", frames: 8, fps: 12, loop: true }]
    };
    await mergeAnimationManifest(manifestPath, toAnimationManifestEntries([updated]));

    const merged = JSON.parse(await readFile(manifestPath, "utf8")) as AssetManifest;
    const walkEntries = (merged.animations ?? []).filter((entry) => entry.assetId === "unit.spear_ashigaru.anim.walk");
    expect(walkEntries.length).toBe(1);
    expect(walkEntries[0]?.fps).toBe(12);
    // Entries not re-merged this time survive.
    expect(merged.animations?.some((entry) => entry.assetId === "unit.spear_ashigaru.anim.death")).toBe(true);
  });
});

describe("validateAnimationManifest", () => {
  it("passes for a sheet whose PNG matches the declared grid", async () => {
    const dir = await makeTempDir("anim-validate-");
    const publicDir = join(dir, "public");
    await mkdir(join(publicDir, "generated"), { recursive: true });
    const entry = toAnimationManifestEntry(asset, asset.actions[1]!);
    await sharp({
      create: { width: entry.sheet.width, height: entry.sheet.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .png()
      .toFile(join(publicDir, entry.file));
    const manifest = { version: 1, generatedBy: "x", generatedAt: "", assets: [], animations: [entry] } as AssetManifest;
    await expect(validateAnimationManifest(manifest, publicDir)).resolves.toBeUndefined();
  });

  it("fails when the PNG size disagrees with the manifest", async () => {
    const dir = await makeTempDir("anim-validate-bad-");
    const publicDir = join(dir, "public");
    await mkdir(join(publicDir, "generated"), { recursive: true });
    const entry = toAnimationManifestEntry(asset, asset.actions[1]!);
    await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toFile(join(publicDir, entry.file));
    const manifest = { version: 1, generatedBy: "x", generatedAt: "", assets: [], animations: [entry] } as AssetManifest;
    await expect(validateAnimationManifest(manifest, publicDir)).rejects.toThrow(/dimensions/);
  });

  it("fails on direction order drift", async () => {
    const dir = await makeTempDir("anim-validate-dir-");
    const publicDir = join(dir, "public");
    await mkdir(join(publicDir, "generated"), { recursive: true });
    const entry = {
      ...toAnimationManifestEntry(asset, asset.actions[1]!),
      directions: ["n", "ne", "e", "se", "s", "sw", "w", "nw"]
    } as unknown as AssetManifest["animations"] extends readonly (infer T)[] | undefined ? T : never;
    const manifest = { version: 1, generatedBy: "x", generatedAt: "", assets: [], animations: [entry] } as AssetManifest;
    await expect(validateAnimationManifest(manifest, publicDir)).rejects.toThrow(/directions/);
  });
});

describe("readAnimationAssetConfigDir", () => {
  it("reads animations arrays and skips files without them", async () => {
    const dir = await makeTempDir("anim-config-");
    await writeFile(
      join(dir, "units.json"),
      JSON.stringify({ version: 1, assets: [] }),
      "utf8"
    );
    await writeFile(
      join(dir, "unit-animations.json"),
      JSON.stringify({
        version: 1,
        assets: [],
        animations: [
          {
            assetId: "unit.spear_ashigaru",
            kind: "unit",
            model: "unit-spear-ashigaru-rigged",
            renderSpec: "painterly",
            supersample: 2,
            directions: 8,
            frameCanvas: { width: 48, height: 64, anchorX: 24, anchorY: 52.48 },
            postprocess: { sharpen: { sigma: 0.45 } },
            actions: [{ name: "walk", frames: 8, fps: 10, loop: true }]
          }
        ]
      }),
      "utf8"
    );

    const config = await readAnimationAssetConfigDir(dir);
    expect(config.animations.length).toBe(1);
    expect(config.animations[0]?.model).toBe("unit-spear-ashigaru-rigged");
    expect(config.animations[0]?.postprocess?.sharpen?.sigma).toBe(0.45);
  });

  it("rejects duplicate assetIds across files", async () => {
    const dir = await makeTempDir("anim-config-dup-");
    const animation = {
      assetId: "unit.spear_ashigaru",
      kind: "unit",
      model: "m",
      renderSpec: "painterly",
      directions: 8,
      frameCanvas: { width: 48, height: 64, anchorX: 24, anchorY: 52.48 },
      actions: [{ name: "walk", frames: 8, fps: 10, loop: true }]
    };
    await writeFile(join(dir, "a.json"), JSON.stringify({ version: 1, animations: [animation] }), "utf8");
    await writeFile(join(dir, "b.json"), JSON.stringify({ version: 1, animations: [animation] }), "utf8");
    await expect(readAnimationAssetConfigDir(dir)).rejects.toThrow(/Duplicate animation assetId/);
  });

  it("rejects direction counts other than 8", async () => {
    const dir = await makeTempDir("anim-config-dirs-");
    await writeFile(
      join(dir, "a.json"),
      JSON.stringify({
        version: 1,
        animations: [
          {
            assetId: "unit.x",
            kind: "unit",
            model: "m",
            renderSpec: "painterly",
            directions: 4,
            frameCanvas: { width: 48, height: 64, anchorX: 24, anchorY: 52.48 },
            actions: [{ name: "walk", frames: 8, fps: 10, loop: true }]
          }
        ]
      }),
      "utf8"
    );
    await expect(readAnimationAssetConfigDir(dir)).rejects.toThrow(/directions must be 8/);
  });
});
