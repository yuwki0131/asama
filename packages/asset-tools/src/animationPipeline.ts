import { execFile } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  SHEET_DIRECTIONS,
  animationSheetFileName,
  readAnimationAssetConfigDir
} from "./animationConfig";
import {
  computeAnimationCacheKey,
  readAnimationCacheIndex,
  resolveAnimationCacheHit,
  storeAnimationCachePng,
  writeAnimationCacheIndex
} from "./animationCache";
import { mergeAnimationManifest, toAnimationManifestEntries } from "./animationManifest";
import { composeSpriteSheet } from "./spriteSheet";
import { resolveBlenderBinary } from "./blenderRender";
import {
  generatedManifestPath,
  generatedOutputDir,
  intermediateAssetsDir,
  productionConfigDir,
  renderCacheDir,
  repoRoot
} from "./paths";
import type { AnimationActionSpec, AnimationAssetSpec } from "./types";

const execFileAsync = promisify(execFile);

/** Own cache directory; the static render cache is never touched. */
export const animationRenderCacheDir = join(renderCacheDir, "anim");

export interface AnimationRenderBatchResult {
  readonly total: number;
  readonly rendered: number;
  readonly cachedHit: number;
}

export function defaultAnimationRenderScript(root: string): string {
  return join(root, "assets/source/blender/scripts/render_anim_asset.py");
}

/**
 * Renders every animation asset (one Blender process per unit x action,
 * 8 directions x N frames), composes the sprite sheets, and publishes them
 * to public/assets/generated/ plus the manifest `animations` section.
 * Sheets are cached by SHA256 (script closure + parameters).
 */
export async function renderAnimationAssets(): Promise<AnimationRenderBatchResult> {
  const config = await readAnimationAssetConfigDir(productionConfigDir);
  if (config.animations.length === 0) {
    return { total: 0, rendered: 0, cachedHit: 0 };
  }

  const entryScript = defaultAnimationRenderScript(repoRoot);
  const cacheIndex = await readAnimationCacheIndex(animationRenderCacheDir);
  let cacheIndexDirty = false;
  let blenderBinary: string | undefined;
  let total = 0;
  let rendered = 0;
  let cachedHit = 0;

  await mkdir(generatedOutputDir, { recursive: true });
  for (const asset of config.animations) {
    for (const action of asset.actions) {
      total += 1;
      const outputPath = join(generatedOutputDir, animationSheetFileName(asset.assetId, action.name));
      const cacheKey = await computeAnimationCacheKey(asset, action, entryScript);
      const cachedPng = await resolveAnimationCacheHit(animationRenderCacheDir, cacheKey.sha256);

      if (cachedPng !== null) {
        await copyFile(cachedPng, outputPath);
        cachedHit += 1;
        if (cacheIndex[cacheKey.sha256] === undefined) {
          cacheIndex[cacheKey.sha256] = cacheKey.metadata;
          cacheIndexDirty = true;
        }
        continue;
      }

      blenderBinary ??= await resolveBlenderBinary();
      const sheet = await renderAnimationSheet(asset, action, { blenderBinary, entryScript });
      await writeFile(outputPath, sheet);
      await storeAnimationCachePng(animationRenderCacheDir, cacheKey.sha256, outputPath, cacheIndex, cacheKey.metadata);
      rendered += 1;
    }
  }
  if (cacheIndexDirty) {
    await writeAnimationCacheIndex(animationRenderCacheDir, cacheIndex);
  }

  await mergeAnimationManifest(generatedManifestPath, toAnimationManifestEntries(config.animations));
  return { total, rendered, cachedHit };
}

export async function renderAnimationSheet(
  asset: AnimationAssetSpec,
  action: AnimationActionSpec,
  options: {
    readonly blenderBinary: string;
    readonly entryScript: string;
    readonly rawOutputDirectory?: string;
    readonly reportJson?: string;
  }
): Promise<Buffer> {
  const outputName = `${asset.model}-${action.name}`;
  const rawDirectory =
    options.rawOutputDirectory ?? join(intermediateAssetsDir, "anim-renders", outputName);
  const reportJson = options.reportJson ?? join(rawDirectory, "render-report.json");
  await mkdir(rawDirectory, { recursive: true });

  const args = [
    "--background",
    "--factory-startup",
    "--python",
    options.entryScript,
    "--",
    "--model",
    asset.model,
    "--action",
    action.name,
    "--frames",
    String(action.frames),
    "--canvas",
    `${asset.frameCanvas.width}x${asset.frameCanvas.height}`,
    "--anchor",
    `${asset.frameCanvas.anchorX},${asset.frameCanvas.anchorY}`,
    "--output-directory",
    rawDirectory,
    "--output-name",
    outputName,
    "--render-spec",
    asset.renderSpec,
    "--transparent-background",
    "true",
    "--supersample",
    String(asset.supersample ?? 1),
    "--report-json",
    reportJson
  ];
  await execFileAsync(options.blenderBinary, args, { maxBuffer: 1024 * 1024 * 32 });

  const framePaths = SHEET_DIRECTIONS.map((direction) =>
    Array.from({ length: action.frames }, (_, frameIndex) =>
      join(rawDirectory, `${outputName}-${direction}-f${String(frameIndex + 1).padStart(2, "0")}.png`)
    )
  );
  return composeSpriteSheet({
    framePaths,
    frameWidth: asset.frameCanvas.width,
    frameHeight: asset.frameCanvas.height,
    ...(asset.postprocess?.sharpen === undefined ? {} : { sharpenSigma: asset.postprocess.sharpen.sigma })
  });
}
