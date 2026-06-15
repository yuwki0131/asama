import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { blenderPlanLines, defaultBlenderRenderScript, validateBlenderAssetInputs } from "./blenderAdapter";
import { readProductionAssetConfig } from "./productionConfig";
import { importRasterAsset } from "./postprocess";
import {
  atlasOutputDir,
  generatedOutputDir,
  intermediateAssetsDir,
  productionConfigPath,
  repoRoot
} from "./paths";
import type { AtlasBuildSpec, GeneratedAsset, ProductionAssetSpec, RasterImportSpec } from "./types";

export async function importRasterAssets(): Promise<number> {
  const config = await readProductionAssetConfig(productionConfigPath);
  const rasterAssets = config.assets.filter((asset) => asset.source.type === "raster");
  for (const asset of rasterAssets) {
    await importRasterAsset(toRasterImportSpec(asset));
  }
  return rasterAssets.length;
}

export async function renderBlenderAssets(options: { readonly mock?: boolean } = {}): Promise<readonly string[]> {
  const config = await readProductionAssetConfig(productionConfigPath);
  const blenderAssets = config.assets.filter((asset) => asset.source.type === "blender");
  await mkdir(join(intermediateAssetsDir, "raw-renders"), { recursive: true });

  if (!options.mock) {
    await validateBlenderAssetInputs(blenderAssets);
  }

  return blenderPlanLines(blenderAssets, join(intermediateAssetsDir, "raw-renders"), defaultBlenderRenderScript(repoRoot));
}

export async function postprocessProductionAssets(): Promise<number> {
  return importRasterAssets();
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
  const config = await readProductionAssetConfig(productionConfigPath);
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
