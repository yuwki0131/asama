import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  AssetGeometry,
  AssetKind,
  AssetSource,
  ProductionPostprocessSpec,
  ProductionAssetConfig,
  ProductionAssetSpec,
  RasterPostprocessCategory
} from "./types";

const assetKinds = new Set<AssetKind>(["terrain", "unit", "building", "overlay"]);
const categories = new Set<RasterPostprocessCategory>(["terrain", "building", "unit", "vegetation", "effect"]);

export async function readProductionAssetConfigDir(dir: string): Promise<ProductionAssetConfig> {
  const entries = await readdir(dir);
  const jsonFiles = entries.filter((f) => f.endsWith(".json")).sort();
  const seen = new Set<string>();
  const merged: ProductionAssetSpec[] = [];
  for (const file of jsonFiles) {
    const config = await readProductionAssetConfig(join(dir, file), seen);
    merged.push(...config.assets);
  }
  return { version: 1, assets: merged };
}

export async function readProductionAssetConfig(path: string, seen = new Set<string>()): Promise<ProductionAssetConfig> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<ProductionAssetConfig>;

  if (parsed.version !== 1 || !Array.isArray(parsed.assets)) {
    throw new Error(`Invalid production asset config: ${path}`);
  }

  return {
    version: 1,
    assets: parsed.assets.map((asset, index) => parseProductionAsset(asset, index, seen))
  };
}

export function parseProductionAsset(value: unknown, index: number, seen = new Set<string>()): ProductionAssetSpec {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid production asset at index ${index}`);
  }

  const asset = value as Partial<ProductionAssetSpec>;
  assertString(asset.assetId, `assets[${index}].assetId`);
  assertString(asset.output, `assets[${index}].output`);

  if (seen.has(asset.assetId)) {
    throw new Error(`Duplicate assetId: ${asset.assetId}`);
  }
  seen.add(asset.assetId);

  if (!assetKinds.has(asset.kind as AssetKind)) {
    throw new Error(`Invalid assets[${index}].kind`);
  }

  return {
    assetId: asset.assetId,
    kind: asset.kind as AssetKind,
    output: asset.output,
    source: parseSource(asset.source, index),
    geometry: parseGeometry(asset.geometry, index),
    ...(asset.category === undefined ? {} : { category: parseCategory(asset.category, index) }),
    ...(asset.postprocess === undefined ? {} : { postprocess: parsePostprocess(asset.postprocess, index) }),
    ...(asset.variants === undefined ? {} : { variants: parseVariants(asset.variants, index) })
  };
}

function parseSource(value: unknown, index: number): AssetSource {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid assets[${index}].source`);
  }

  const source = value as Partial<AssetSource>;
  if (source.type === "procedural-svg") {
    assertString(source.pattern, `assets[${index}].source.pattern`);
    return { type: "procedural-svg", pattern: source.pattern };
  }
  if (source.type === "blender") {
    const hasModel = source.model !== undefined;
    const hasScene = source.scene !== undefined;
    if (hasModel === hasScene) {
      throw new Error(`assets[${index}].source must specify exactly one of model or scene`);
    }
    if (hasModel) {
      assertString(source.model, `assets[${index}].source.model`);
    }
    if (hasScene) {
      assertString(source.scene, `assets[${index}].source.scene`);
    }
    assertString(source.renderSpec, `assets[${index}].source.renderSpec`);
    const supersample = parseSupersample(source.supersample, index);
    return {
      type: "blender",
      ...(source.model === undefined ? {} : { model: source.model }),
      ...(source.scene === undefined ? {} : { scene: source.scene }),
      ...(source.collection === undefined ? {} : { collection: source.collection }),
      renderSpec: source.renderSpec,
      ...(supersample === undefined ? {} : { supersample })
    };
  }
  if (source.type === "raster") {
    assertString(source.file, `assets[${index}].source.file`);
    return { type: "raster", file: source.file };
  }

  throw new Error(`Unknown assets[${index}].source.type`);
}

function parseGeometry(value: unknown, index: number): AssetGeometry {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid assets[${index}].geometry`);
  }

  const geometry = value as Partial<AssetGeometry>;
  assertPositiveInteger(geometry.footprintWidth, `assets[${index}].geometry.footprintWidth`);
  assertPositiveInteger(geometry.footprintHeight, `assets[${index}].geometry.footprintHeight`);
  assertPositiveInteger(geometry.canvasWidth, `assets[${index}].geometry.canvasWidth`);
  assertPositiveInteger(geometry.canvasHeight, `assets[${index}].geometry.canvasHeight`);
  assertNumber(geometry.anchorX, `assets[${index}].geometry.anchorX`);
  assertNumber(geometry.anchorY, `assets[${index}].geometry.anchorY`);

  if (geometry.anchorX < 0 || geometry.anchorX > geometry.canvasWidth) {
    throw new Error(`assets[${index}].geometry.anchorX is outside canvas`);
  }
  if (geometry.anchorY < 0 || geometry.anchorY > geometry.canvasHeight) {
    throw new Error(`assets[${index}].geometry.anchorY is outside canvas`);
  }

  return {
    footprintWidth: geometry.footprintWidth,
    footprintHeight: geometry.footprintHeight,
    canvasWidth: geometry.canvasWidth,
    canvasHeight: geometry.canvasHeight,
    anchorX: geometry.anchorX,
    anchorY: geometry.anchorY
  };
}

function parseCategory(value: unknown, index: number): RasterPostprocessCategory {
  if (!categories.has(value as RasterPostprocessCategory)) {
    throw new Error(`Invalid assets[${index}].category`);
  }
  return value as RasterPostprocessCategory;
}

function parseVariants(value: unknown, index: number): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`Invalid assets[${index}].variants`);
  }
  return value;
}

function parsePostprocess(value: unknown, index: number): ProductionPostprocessSpec {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid assets[${index}].postprocess`);
  }

  const postprocess = value as Partial<ProductionPostprocessSpec>;
  if (postprocess.trim !== undefined && typeof postprocess.trim !== "boolean") {
    throw new Error(`Invalid assets[${index}].postprocess.trim`);
  }
  if (
    postprocess.resizeMode !== undefined &&
    !["contain", "cover", "exact"].includes(postprocess.resizeMode)
  ) {
    throw new Error(`Invalid assets[${index}].postprocess.resizeMode`);
  }
  if (postprocess.sharpen !== undefined) {
    if (typeof postprocess.sharpen !== "object" || postprocess.sharpen === null) {
      throw new Error(`Invalid assets[${index}].postprocess.sharpen`);
    }
    assertNumber(postprocess.sharpen.sigma, `assets[${index}].postprocess.sharpen.sigma`);
  }

  return {
    ...(postprocess.trim === undefined ? {} : { trim: postprocess.trim }),
    ...(postprocess.resizeMode === undefined ? {} : { resizeMode: postprocess.resizeMode }),
    ...(postprocess.sharpen === undefined ? {} : { sharpen: { sigma: postprocess.sharpen.sigma } })
  };
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${label}`);
  }
}

function assertNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

function parseSupersample(value: unknown, index: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  assertPositiveInteger(value, `assets[${index}].source.supersample`);
  return value;
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  assertNumber(value, label);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}`);
  }
}
