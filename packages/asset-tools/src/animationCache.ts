import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { AnimationActionSpec, AnimationAssetSpec } from "./types";
import { SHEET_DIRECTIONS } from "./animationConfig";

/**
 * Animation sheets cache under their own directory + index so the static
 * render cache (assets/intermediate/render-cache/index.json) is never read,
 * written, or invalidated by animation work. One cache entry = one composed
 * sheet PNG (64 frames render in ~3s; finer granularity is not worth it).
 */
export interface AnimationCacheMetadata {
  readonly cacheVersion: 1;
  readonly assetId: string;
  readonly model: string;
  readonly action: string;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly directions: readonly string[];
  readonly frameCanvas: {
    readonly width: number;
    readonly height: number;
    readonly anchorX: number;
    readonly anchorY: number;
  };
  readonly renderSpec: string;
  readonly supersample: number;
  readonly sharpenSigma: number | null;
  readonly renderScriptSha256: string;
}

export type AnimationCacheIndex = Record<string, AnimationCacheMetadata>;

export interface AnimationCacheKeyResult {
  readonly sha256: string;
  readonly metadata: AnimationCacheMetadata;
}

/**
 * Cache key = SHA256 over the full animation render script closure (entry
 * script + render_asset_lib/anim/* + the shared core/materials modules) plus
 * every parameter that affects sheet pixels. fps/loop are metadata-only but
 * included so a definition change always refreshes the manifest entry too.
 */
export async function computeAnimationCacheKey(
  asset: AnimationAssetSpec,
  action: AnimationActionSpec,
  entryScript: string
): Promise<AnimationCacheKeyResult> {
  const composite = await readAnimationScriptClosure(entryScript);
  const renderScriptSha256 = sha256Hex(composite);
  const sharpenSigma = asset.postprocess?.sharpen?.sigma ?? null;

  const metadata: AnimationCacheMetadata = {
    cacheVersion: 1,
    assetId: asset.assetId,
    model: asset.model,
    action: action.name,
    frames: action.frames,
    fps: action.fps,
    loop: action.loop,
    directions: [...SHEET_DIRECTIONS],
    frameCanvas: { ...asset.frameCanvas },
    renderSpec: asset.renderSpec,
    supersample: asset.supersample ?? 1,
    sharpenSigma,
    renderScriptSha256
  };

  const keyInput = {
    renderScript: composite.toString("utf8"),
    model: metadata.model,
    action: metadata.action,
    frames: metadata.frames,
    fps: metadata.fps,
    loop: metadata.loop,
    directions: metadata.directions,
    frameCanvas: metadata.frameCanvas,
    renderSpec: metadata.renderSpec,
    supersample: metadata.supersample,
    sharpenSigma: metadata.sharpenSigma
  };

  return { sha256: sha256Hex(stableJson(keyInput)), metadata };
}

async function readAnimationScriptClosure(entryScript: string): Promise<Buffer> {
  const libDir = join(dirname(entryScript), "render_asset_lib");
  const animDir = join(libDir, "anim");
  const animFiles = (await readdir(animDir)).filter((file) => file.endsWith(".py")).sort();
  const parts = await Promise.all([
    readFile(entryScript),
    readFile(join(libDir, "core.py")),
    readFile(join(libDir, "materials.py")),
    ...animFiles.map((file) => readFile(join(animDir, file)))
  ]);
  return Buffer.concat(parts);
}

export function animationCachePngPath(cacheDirectory: string, sha256: string): string {
  return join(cacheDirectory, `${sha256}.png`);
}

export async function resolveAnimationCacheHit(cacheDirectory: string, sha256: string): Promise<string | null> {
  const pngPath = animationCachePngPath(cacheDirectory, sha256);
  try {
    await readFile(pngPath);
    return pngPath;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function readAnimationCacheIndex(cacheDirectory: string): Promise<AnimationCacheIndex> {
  try {
    const raw = await readFile(animationCacheIndexPath(cacheDirectory), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Animation cache index must be an object");
    }
    const index: AnimationCacheIndex = {};
    for (const [sha256, metadata] of Object.entries(parsed)) {
      if (!/^[0-9a-f]{64}$/.test(sha256)) {
        throw new Error(`Invalid animation cache key: ${sha256}`);
      }
      // Older cache versions can never match a current key; treat as misses.
      if ((metadata as Partial<AnimationCacheMetadata>).cacheVersion === 1) {
        index[sha256] = metadata as AnimationCacheMetadata;
      }
    }
    return index;
  } catch (error) {
    if (isNotFound(error)) {
      return {};
    }
    throw error;
  }
}

export async function writeAnimationCacheIndex(cacheDirectory: string, index: AnimationCacheIndex): Promise<void> {
  await mkdir(cacheDirectory, { recursive: true });
  const ordered = Object.fromEntries(Object.entries(index).sort(([left], [right]) => left.localeCompare(right)));
  await writeFile(animationCacheIndexPath(cacheDirectory), `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}

export async function storeAnimationCachePng(
  cacheDirectory: string,
  sha256: string,
  sourcePng: string,
  index: AnimationCacheIndex,
  metadata: AnimationCacheMetadata
): Promise<void> {
  await mkdir(cacheDirectory, { recursive: true });
  await copyFile(sourcePng, animationCachePngPath(cacheDirectory, sha256));
  index[sha256] = metadata;
  await writeAnimationCacheIndex(cacheDirectory, index);
}

function animationCacheIndexPath(cacheDirectory: string): string {
  return join(cacheDirectory, "index.json");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
    .join(",")}}`;
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
