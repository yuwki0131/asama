import { readFile } from "node:fs/promises";
import type { PlaceholderAssetConfig, PlaceholderAssetSpec } from "./types";

export async function readPlaceholderConfig(path: string): Promise<PlaceholderAssetConfig> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<PlaceholderAssetConfig>;

  if (parsed.version !== 1 || !Array.isArray(parsed.assets)) {
    throw new Error(`Invalid placeholder config: ${path}`);
  }

  const seen = new Set<string>();
  const assets = parsed.assets.map((asset, index) => parseAsset(asset, index, seen));

  return {
    version: 1,
    assets
  };
}

function parseAsset(value: unknown, index: number, seen: Set<string>): PlaceholderAssetSpec {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid asset spec at index ${index}`);
  }

  const asset = value as Partial<PlaceholderAssetSpec>;
  assertString(asset.assetId, `assets[${index}].assetId`);
  assertString(asset.output, `assets[${index}].output`);
  assertString(asset.fill, `assets[${index}].fill`);
  assertString(asset.stroke, `assets[${index}].stroke`);
  assertNumber(asset.width, `assets[${index}].width`);
  assertNumber(asset.height, `assets[${index}].height`);

  if (!["terrain", "unit", "building", "overlay"].includes(String(asset.kind))) {
    throw new Error(`Invalid assets[${index}].kind`);
  }

  if (asset.anchor === undefined || typeof asset.anchor !== "object") {
    throw new Error(`Invalid assets[${index}].anchor`);
  }

  assertNumber(asset.anchor.x, `assets[${index}].anchor.x`);
  assertNumber(asset.anchor.y, `assets[${index}].anchor.y`);

  if (seen.has(asset.assetId)) {
    throw new Error(`Duplicate assetId: ${asset.assetId}`);
  }
  seen.add(asset.assetId);

  const spec: PlaceholderAssetSpec = {
    assetId: asset.assetId,
    kind: asset.kind as PlaceholderAssetSpec["kind"],
    output: asset.output,
    width: asset.width,
    height: asset.height,
    fill: asset.fill,
    stroke: asset.stroke,
    anchor: {
      x: asset.anchor.x,
      y: asset.anchor.y
    }
  };

  const withOptionalFields: PlaceholderAssetSpec = {
    ...spec,
    ...(asset.pattern === undefined ? {} : { pattern: asset.pattern }),
    ...(asset.direction === undefined ? {} : { direction: asset.direction }),
    ...(asset.connectionMask === undefined ? {} : { connectionMask: asset.connectionMask })
  };

  if (asset.accent !== undefined) {
    assertString(asset.accent, `assets[${index}].accent`);
    return {
      ...withOptionalFields,
      accent: asset.accent
    };
  }

  return withOptionalFields;
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
