import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { BlenderRenderSpec, ProductionAssetSpec } from "./types";

export interface RenderCacheMetadata {
  readonly cacheVersion: 2;
  readonly assetId: string;
  readonly model: string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly anchor: {
    readonly x: number;
    readonly y: number;
  };
  readonly renderSpec: string;
  readonly transparentBackground: boolean;
  readonly supersample: number;
  readonly renderScriptSha256: string;
  /** Isolated model registry (absent for legacy static assets). */
  readonly registry?: string;
}

export type RenderCacheIndex = Record<string, RenderCacheMetadata>;

export interface RenderCacheKeyResult {
  readonly sha256: string;
  readonly metadata: RenderCacheMetadata;
}

/** Maps a Blender model name to the render_asset_lib domain module that builds it. */
export function modelToDomain(model: string): string {
  if (
    model.startsWith("tree-") ||
    model.startsWith("deco-") ||
    model.startsWith("bamboo-") ||
    model.startsWith("rock-") ||
    model === "reeds"
  ) {
    return "vegetation";
  }
  if (
    model.startsWith("terrain-") ||
    model.startsWith("road-") ||
    model.startsWith("dry-moat-") ||
    model.startsWith("water-moat-") ||
    model.endsWith("-bridge")
  ) {
    return "terrain";
  }
  if (model.startsWith("unit-")) {
    return "units";
  }
  return "buildings";
}

export async function computeRenderCacheKey(
  asset: ProductionAssetSpec,
  spec: BlenderRenderSpec,
  pythonScript: string
): Promise<RenderCacheKeyResult> {
  if (asset.source.type !== "blender") {
    throw new Error(`Asset is not a Blender source: ${asset.assetId}`);
  }
  if (spec.model === undefined || spec.model.length === 0) {
    throw new Error(`Render cache requires a Blender model for asset: ${asset.assetId}`);
  }

  const libDir = join(dirname(pythonScript), "render_asset_lib");
  const registry = asset.source.registry;
  let composite: Buffer;
  if (registry === undefined) {
    // Legacy static path: byte-identical key input so the 387 existing
    // renders stay cached forever.
    const domain = modelToDomain(spec.model);
    const [entry, coreModule, materialsModule, registryModule, domainModule] = await Promise.all([
      readFile(pythonScript),
      readFile(join(libDir, "core.py")),
      readFile(join(libDir, "materials.py")),
      readFile(join(libDir, "registry.py")),
      readFile(join(libDir, `${domain}.py`))
    ]);
    composite = Buffer.concat([entry, coreModule, materialsModule, registryModule, domainModule]);
  } else {
    // Isolated registry: hash its entry script plus every module of
    // render_asset_lib/<registry>/ (and the shared core/materials, which the
    // isolated builders also import). The static registry.py stays out.
    const registryDir = join(libDir, registry);
    const moduleNames = (await readdir(registryDir)).filter((name) => name.endsWith(".py")).sort();
    const buffers = await Promise.all([
      readFile(pythonScript),
      readFile(join(libDir, "core.py")),
      readFile(join(libDir, "materials.py")),
      ...moduleNames.map((name) => readFile(join(registryDir, name)))
    ]);
    composite = Buffer.concat(buffers);
  }
  const renderScriptSha256 = sha256Hex(composite);

  const metadata: RenderCacheMetadata = {
    cacheVersion: 2,
    assetId: asset.assetId,
    model: spec.model,
    canvas: {
      width: spec.resolution.width,
      height: spec.resolution.height
    },
    anchor: {
      x: spec.anchor.x,
      y: spec.anchor.y
    },
    renderSpec: spec.renderSpec,
    transparentBackground: spec.transparentBackground,
    supersample: spec.supersample ?? 1,
    renderScriptSha256,
    ...(registry === undefined ? {} : { registry })
  };

  const keyInput = {
    renderScript: composite.toString("utf8"),
    model: metadata.model,
    canvas: metadata.canvas,
    anchor: metadata.anchor,
    renderSpec: metadata.renderSpec,
    transparentBackground: metadata.transparentBackground,
    supersample: metadata.supersample,
    ...(registry === undefined ? {} : { registry })
  };

  return {
    sha256: sha256Hex(stableJson(keyInput)),
    metadata
  };
}

export async function readRenderCacheIndex(cacheDirectory: string): Promise<RenderCacheIndex> {
  try {
    const raw = await readFile(renderCacheIndexPath(cacheDirectory), "utf8");
    return parseRenderCacheIndex(JSON.parse(raw));
  } catch (error) {
    if (isNotFound(error)) {
      return {};
    }
    throw error;
  }
}

export async function writeRenderCacheIndex(cacheDirectory: string, index: RenderCacheIndex): Promise<void> {
  await mkdir(cacheDirectory, { recursive: true });
  const ordered = Object.fromEntries(Object.entries(index).sort(([left], [right]) => left.localeCompare(right)));
  await writeFile(renderCacheIndexPath(cacheDirectory), `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}

export async function resolveRenderCacheHit(cacheDirectory: string, sha256: string): Promise<string | null> {
  const pngPath = renderCachePngPath(cacheDirectory, sha256);
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

export async function storeRenderCachePng(
  cacheDirectory: string,
  sha256: string,
  sourcePng: string,
  index: RenderCacheIndex,
  metadata: RenderCacheMetadata
): Promise<void> {
  await mkdir(cacheDirectory, { recursive: true });
  await copyFile(sourcePng, renderCachePngPath(cacheDirectory, sha256));
  index[sha256] = metadata;
  await writeRenderCacheIndex(cacheDirectory, index);
}

export function renderCachePngPath(cacheDirectory: string, sha256: string): string {
  return join(cacheDirectory, `${sha256}.png`);
}

function renderCacheIndexPath(cacheDirectory: string): string {
  return join(cacheDirectory, "index.json");
}

function parseRenderCacheIndex(value: unknown): RenderCacheIndex {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Render cache index must be an object");
  }
  const index: RenderCacheIndex = {};
  for (const [sha256, metadata] of Object.entries(value)) {
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error(`Invalid render cache key: ${sha256}`);
    }
    // Entries written by older cache versions are simply misses, not errors:
    // the key scheme changed, so they can never match a v2 key anyway.
    const parsed = parseRenderCacheMetadata(metadata);
    if (parsed !== null) {
      index[sha256] = parsed;
    }
  }
  return index;
}

function parseRenderCacheMetadata(value: unknown): RenderCacheMetadata | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Render cache metadata must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.cacheVersion !== 2) {
    return null;
  }
  return {
    cacheVersion: 2,
    assetId: requiredString(record.assetId, "assetId"),
    model: requiredString(record.model, "model"),
    canvas: parsePoint(record.canvas, "canvas", "width", "height"),
    anchor: parsePoint(record.anchor, "anchor", "x", "y"),
    renderSpec: requiredString(record.renderSpec, "renderSpec"),
    transparentBackground: requiredBoolean(record.transparentBackground, "transparentBackground"),
    supersample: typeof record.supersample === "number" ? record.supersample : 1,
    renderScriptSha256: requiredString(record.renderScriptSha256, "renderScriptSha256"),
    ...(typeof record.registry === "string" && record.registry.length > 0 ? { registry: record.registry } : {})
  };
}

function parsePoint<XKey extends string, YKey extends string>(
  value: unknown,
  label: string,
  xKey: XKey,
  yKey: YKey
): Record<XKey | YKey, number> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Render cache ${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  return {
    [xKey]: requiredNumber(record[xKey], `${label}.${xKey}`),
    [yKey]: requiredNumber(record[yKey], `${label}.${yKey}`)
  } as Record<XKey | YKey, number>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Render cache ${label} must be a non-empty string`);
  }
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Render cache ${label} must be a finite number`);
  }
  return value;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Render cache ${label} must be a boolean`);
  }
  return value;
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
