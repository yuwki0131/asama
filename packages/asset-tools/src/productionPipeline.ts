import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  importBlenderRawAsset,
  renderBlenderAssetRaw,
  renderCalibrationSuite,
  resolveBlenderBinary,
  toHeadlessBlenderRenderSpec
} from "./blenderRender";
import { blenderRenderScriptForAsset, defaultBlenderRenderScript } from "./blenderAdapter";
import { readManifest } from "./manifest";
import { readProductionAssetConfigDir } from "./productionConfig";
import { importRasterAsset } from "./postprocess";
import {
  atlasOutputDir,
  generatedManifestPath,
  generatedOutputDir,
  intermediateAssetsDir,
  productionConfigDir,
  renderCacheDir,
  repoRoot
} from "./paths";
import {
  computeRenderCacheKey,
  readRenderCacheIndex,
  resolveRenderCacheHit,
  storeRenderCachePng,
  writeRenderCacheIndex
} from "./renderCache";
import type {
  AnimationManifestEntry,
  AtlasBuildSpec,
  GeneratedAsset,
  ProductionAssetSpec,
  RasterImportSpec
} from "./types";

export interface BlenderRenderBatchResult {
  readonly total: number;
  readonly rendered: number;
  readonly cachedHit: number;
}

export interface ProductionPostprocessResult {
  readonly total: number;
  readonly raster: number;
  readonly blender: BlenderRenderBatchResult;
}

export async function importRasterAssets(): Promise<number> {
  const config = await readProductionAssetConfigDir(productionConfigDir);
  const rasterAssets = config.assets.filter((asset) => asset.source.type === "raster");
  await mkdir(generatedOutputDir, { recursive: true });
  for (const asset of rasterAssets) {
    await importRasterAsset(toRasterImportSpec(asset));
  }
  const existingManifest = await readExistingGeneratedManifest();
  const productionAssets = config.assets.map(toGeneratedAsset);
  const productionIds = new Set(productionAssets.map((asset) => asset.assetId));
  const mergedAssets = [
    ...existingManifest.assets.filter((asset) => !productionIds.has(asset.assetId)),
    ...productionAssets
  ];
  await writeGeneratedManifest(mergedAssets, existingManifest.animations);
  return rasterAssets.length;
}

async function readExistingGeneratedManifest(): Promise<{
  readonly assets: readonly GeneratedAsset[];
  readonly animations?: readonly AnimationManifestEntry[];
}> {
  try {
    return await readManifest(generatedManifestPath);
  } catch {
    return { assets: [] };
  }
}

// The `animations` section is owned by the animation pipeline; static
// manifest rewrites must carry it through untouched (backward compatible:
// the key is simply absent until animations are generated).
async function writeGeneratedManifest(
  assets: readonly GeneratedAsset[],
  animations: readonly AnimationManifestEntry[] | undefined
): Promise<void> {
  await writeFile(
    generatedManifestPath,
    `${JSON.stringify(
      {
        version: 1,
        generatedBy: "@asama/asset-tools production",
        assets,
        ...(animations === undefined ? {} : { animations })
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

export async function renderBlenderAssets(): Promise<BlenderRenderBatchResult> {
  const config = await readProductionAssetConfigDir(productionConfigDir);
  const blenderAssets = config.assets.filter((asset) => asset.source.type === "blender");
  if (blenderAssets.length === 0) {
    return { total: 0, rendered: 0, cachedHit: 0 };
  }

  let blenderBinary: string | undefined;
  const rawOutputDirectory = join(intermediateAssetsDir, "raw-renders");
  const reportDirectory = join(intermediateAssetsDir, "render-reports");
  const cacheIndex = await readRenderCacheIndex(renderCacheDir);
  let cacheIndexDirty = false;
  let rendered = 0;
  let cachedHit = 0;

  await mkdir(generatedOutputDir, { recursive: true });
  for (const asset of blenderAssets) {
    // Per-asset entry script: isolated registries (source.registry) render
    // via their own script; everything else keeps render_asset.py.
    const pythonScript = blenderRenderScriptForAsset(repoRoot, asset);
    const spec = toHeadlessBlenderRenderSpec(asset, rawOutputDirectory, reportDirectory);
    const cacheKey = await computeRenderCacheKey(asset, spec, pythonScript);
    const cachedPng = await resolveRenderCacheHit(renderCacheDir, cacheKey.sha256);
    const runtimeOutput = join(generatedOutputDir, asset.output);

    if (cachedPng !== null) {
      await importBlenderRawAsset(asset, cachedPng, runtimeOutput);
      cachedHit += 1;
      if (cacheIndex[cacheKey.sha256] === undefined) {
        cacheIndex[cacheKey.sha256] = cacheKey.metadata;
        cacheIndexDirty = true;
      }
      continue;
    }

    blenderBinary ??= await resolveBlenderBinary();
    const result = await renderBlenderAssetRaw(asset, {
      blenderBinary,
      pythonScript,
      rawOutputDirectory,
      reportDirectory
    });
    await importBlenderRawAsset(asset, result.rawOutput, runtimeOutput);
    await storeRenderCachePng(renderCacheDir, cacheKey.sha256, result.rawOutput, cacheIndex, cacheKey.metadata);
    rendered += 1;
  }
  if (cacheIndexDirty) {
    await writeRenderCacheIndex(renderCacheDir, cacheIndex);
  }
  await mergeProductionManifest(blenderAssets);
  return { total: blenderAssets.length, rendered, cachedHit };
}

export async function postprocessProductionAssets(): Promise<ProductionPostprocessResult> {
  // Both steps overwrite the SVG-generated PNGs for their source type, so
  // assets:all must run them or placeholder art would ship as production.
  const rasterCount = await importRasterAssets();
  const blenderResult = await renderBlenderAssets();
  return {
    total: rasterCount + blenderResult.total,
    raster: rasterCount,
    blender: blenderResult
  };
}

export async function runBlenderCalibration(): Promise<void> {
  const blenderBinary = await resolveBlenderBinary();
  const results = await renderCalibrationSuite({
    blenderBinary,
    pythonScript: defaultBlenderRenderScript(repoRoot),
    artifactDirectory: join(repoRoot, "artifacts/blender-calibration")
  });
  const failures = results.filter((result) => !result.passed);
  if (failures.length > 0) {
    throw new Error(`Blender calibration failed; see artifacts/blender-calibration/report.md`);
  }
}

export async function buildAtlas(spec: AtlasBuildSpec = { padding: 2 }): Promise<void> {
  validateAtlasSpec(spec);
  await mkdir(atlasOutputDir, { recursive: true });
  await writeFile(
    join(atlasOutputDir, "atlas-plan.json"),
    `${JSON.stringify({ version: 1, padding: spec.padding, atlases: [] }, null, 2)}\n`,
    "utf8"
  );
}

export async function validateProductionAssetDefinitions(): Promise<void> {
  const config = await readProductionAssetConfigDir(productionConfigDir);
  const seenOutputs = new Set<string>();
  for (const asset of config.assets) {
    if (seenOutputs.has(asset.output)) {
      throw new Error(`Duplicate production output: ${asset.output}`);
    }
    seenOutputs.add(asset.output);
  }
}

export function toGeneratedAsset(asset: ProductionAssetSpec): GeneratedAsset {
  return {
    assetId: asset.assetId,
    kind: asset.kind,
    file: `generated/${asset.output}`,
    width: asset.geometry.canvasWidth,
    height: asset.geometry.canvasHeight,
    anchor: {
      x: asset.geometry.anchorX / asset.geometry.canvasWidth,
      y: asset.geometry.anchorY / asset.geometry.canvasHeight
    }
  };
}

async function mergeProductionManifest(assets: readonly ProductionAssetSpec[]): Promise<void> {
  const existingManifest = await readExistingGeneratedManifest();
  const productionAssets = assets.map(toGeneratedAsset);
  const productionIds = new Set(productionAssets.map((asset) => asset.assetId));
  const mergedAssets = [
    ...existingManifest.assets.filter((asset) => !productionIds.has(asset.assetId)),
    ...productionAssets
  ];
  await writeGeneratedManifest(mergedAssets, existingManifest.animations);
}

function toRasterImportSpec(asset: ProductionAssetSpec): RasterImportSpec {
  if (asset.source.type !== "raster") {
    throw new Error(`Asset is not a raster source: ${asset.assetId}`);
  }
  return {
    sourceFile: resolveRepoPath(asset.source.file),
    outputFile: join(generatedOutputDir, asset.output),
    canvasWidth: asset.geometry.canvasWidth,
    canvasHeight: asset.geometry.canvasHeight,
    anchorX: asset.geometry.anchorX,
    anchorY: asset.geometry.anchorY,
    trim: asset.postprocess?.trim ?? true,
    resizeMode: asset.postprocess?.resizeMode ?? "contain",
    category: asset.category ?? categoryForKind(asset.kind),
    ...(asset.postprocess?.sharpen === undefined ? {} : { sharpen: asset.postprocess.sharpen })
  };
}

function resolveRepoPath(path: string): string {
  return isAbsolute(path) ? path : join(repoRoot, path);
}

function categoryForKind(kind: ProductionAssetSpec["kind"]): RasterImportSpec["category"] {
  if (kind === "terrain") {
    return "terrain";
  }
  if (kind === "unit") {
    return "unit";
  }
  if (kind === "building") {
    return "building";
  }
  return "effect";
}

function validateAtlasSpec(spec: AtlasBuildSpec): void {
  if (!Number.isInteger(spec.padding) || spec.padding < 0) {
    throw new Error("Atlas padding must be a non-negative integer");
  }
}
