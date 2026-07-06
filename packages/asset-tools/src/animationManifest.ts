import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { SHEET_DIRECTIONS, animationManifestId, animationSheetFileName } from "./animationConfig";
import { sheetDimensions } from "./spriteSheet";
import type { AnimationActionSpec, AnimationAssetSpec, AnimationManifestEntry, AssetManifest, GeneratedAsset } from "./types";

export function toAnimationManifestEntry(asset: AnimationAssetSpec, action: AnimationActionSpec): AnimationManifestEntry {
  const dimensions = sheetDimensions(SHEET_DIRECTIONS.length, action.frames, asset.frameCanvas.width, asset.frameCanvas.height);
  return {
    assetId: animationManifestId(asset.assetId, action.name),
    unitAssetId: asset.assetId,
    action: action.name,
    kind: asset.kind,
    file: `generated/${animationSheetFileName(asset.assetId, action.name)}`,
    sheet: { width: dimensions.width, height: dimensions.height },
    frame: { width: asset.frameCanvas.width, height: asset.frameCanvas.height },
    frames: action.frames,
    fps: action.fps,
    loop: action.loop,
    directions: [...SHEET_DIRECTIONS],
    layout: { columns: "frames", rows: "directions" },
    anchor: {
      x: asset.frameCanvas.anchorX / asset.frameCanvas.width,
      y: asset.frameCanvas.anchorY / asset.frameCanvas.height
    }
  };
}

export function toAnimationManifestEntries(assets: readonly AnimationAssetSpec[]): readonly AnimationManifestEntry[] {
  return assets
    .flatMap((asset) => asset.actions.map((action) => toAnimationManifestEntry(asset, action)))
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
}

/**
 * Merges animation entries into the generated manifest, preserving the
 * static `assets` section byte-for-byte semantics. The `animations` key is
 * additive: manifests without it stay valid, and pre-2.0 clients that only
 * read `assets` are unaffected.
 */
export async function mergeAnimationManifest(
  manifestPath: string,
  entries: readonly AnimationManifestEntry[]
): Promise<void> {
  const existing = await readManifestOrEmpty(manifestPath);
  const updatedIds = new Set(entries.map((entry) => entry.assetId));
  const merged = [
    ...(existing.animations ?? []).filter((entry) => !updatedIds.has(entry.assetId)),
    ...entries
  ].sort((left, right) => left.assetId.localeCompare(right.assetId));
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        version: 1,
        generatedBy: "@asama/asset-tools production",
        assets: existing.assets,
        animations: merged
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

export async function validateAnimationManifest(manifest: AssetManifest, publicAssetsDir: string): Promise<void> {
  const seen = new Set<string>();
  for (const entry of manifest.animations ?? []) {
    validateAnimationEntryShape(entry);
    if (seen.has(entry.assetId)) {
      throw new Error(`Duplicate animation assetId in manifest: ${entry.assetId}`);
    }
    seen.add(entry.assetId);

    const path = join(publicAssetsDir, entry.file);
    await access(path);
    const metadata = await sharp(path).metadata();
    if (metadata.width !== entry.sheet.width || metadata.height !== entry.sheet.height) {
      throw new Error(`Animation sheet dimensions do not match manifest: ${entry.assetId}`);
    }
  }
}

function validateAnimationEntryShape(entry: AnimationManifestEntry): void {
  if (typeof entry.assetId !== "string" || entry.assetId.length === 0) {
    throw new Error("Animation manifest entry is missing assetId");
  }
  if (typeof entry.file !== "string" || !entry.file.endsWith(".png")) {
    throw new Error(`Animation manifest entry has invalid file: ${entry.assetId}`);
  }
  if (!Number.isInteger(entry.frames) || entry.frames <= 0) {
    throw new Error(`Animation manifest entry has invalid frames: ${entry.assetId}`);
  }
  if (!Number.isFinite(entry.fps) || entry.fps <= 0) {
    throw new Error(`Animation manifest entry has invalid fps: ${entry.assetId}`);
  }
  if (typeof entry.loop !== "boolean") {
    throw new Error(`Animation manifest entry has invalid loop: ${entry.assetId}`);
  }
  if (
    !Array.isArray(entry.directions) ||
    entry.directions.length !== SHEET_DIRECTIONS.length ||
    entry.directions.some((direction, index) => direction !== SHEET_DIRECTIONS[index])
  ) {
    throw new Error(`Animation manifest entry has invalid directions: ${entry.assetId}`);
  }
  const expected = sheetDimensions(SHEET_DIRECTIONS.length, entry.frames, entry.frame.width, entry.frame.height);
  if (entry.sheet.width !== expected.width || entry.sheet.height !== expected.height) {
    throw new Error(`Animation manifest entry has inconsistent sheet size: ${entry.assetId}`);
  }
  if (
    entry.anchor === undefined ||
    !Number.isFinite(entry.anchor.x) ||
    !Number.isFinite(entry.anchor.y) ||
    entry.anchor.x < 0 ||
    entry.anchor.x > 1 ||
    entry.anchor.y < 0 ||
    entry.anchor.y > 1
  ) {
    throw new Error(`Animation manifest entry has invalid anchor: ${entry.assetId}`);
  }
}

async function readManifestOrEmpty(
  manifestPath: string
): Promise<{ readonly assets: readonly GeneratedAsset[]; readonly animations?: readonly AnimationManifestEntry[] }> {
  try {
    const raw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as Partial<AssetManifest>;
    if (manifest.version !== 1 || !Array.isArray(manifest.assets)) {
      throw new Error(`Invalid asset manifest: ${manifestPath}`);
    }
    return {
      assets: manifest.assets,
      ...(manifest.animations === undefined ? {} : { animations: manifest.animations })
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { assets: [] };
    }
    throw error;
  }
}
