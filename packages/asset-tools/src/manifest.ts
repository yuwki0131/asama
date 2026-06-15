import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { AssetManifest, GeneratedAsset } from "./types";

export async function readManifest(path: string): Promise<AssetManifest> {
  const raw = await readFile(path, "utf8");
  const manifest = JSON.parse(raw) as Partial<AssetManifest>;

  if (manifest.version !== 1 || !Array.isArray(manifest.assets)) {
    throw new Error(`Invalid asset manifest: ${path}`);
  }

  return manifest as AssetManifest;
}

export async function validateManifest(manifest: AssetManifest, publicAssetsDir: string): Promise<void> {
  const seen = new Set<string>();

  for (const asset of manifest.assets) {
    validateAssetShape(asset);

    if (seen.has(asset.assetId)) {
      throw new Error(`Duplicate assetId in manifest: ${asset.assetId}`);
    }
    seen.add(asset.assetId);

    const path = join(publicAssetsDir, asset.file);
    await access(path);

    const metadata = await sharp(path).metadata();
    if (metadata.width !== asset.width || metadata.height !== asset.height) {
      throw new Error(`Manifest dimensions do not match image: ${asset.assetId}`);
    }
  }
}

function validateAssetShape(asset: GeneratedAsset): void {
  if (typeof asset.assetId !== "string" || asset.assetId.length === 0) {
    throw new Error("Manifest asset is missing assetId");
  }

  if (typeof asset.file !== "string" || !asset.file.endsWith(".png")) {
    throw new Error(`Manifest asset has invalid file: ${asset.assetId}`);
  }

  if (!Number.isFinite(asset.width) || !Number.isFinite(asset.height)) {
    throw new Error(`Manifest asset has invalid dimensions: ${asset.assetId}`);
  }

  if (
    asset.anchor === undefined ||
    !Number.isFinite(asset.anchor.x) ||
    !Number.isFinite(asset.anchor.y) ||
    asset.anchor.x < 0 ||
    asset.anchor.x > 1 ||
    asset.anchor.y < 0 ||
    asset.anchor.y > 1
  ) {
    throw new Error(`Manifest asset has invalid anchor: ${asset.assetId}`);
  }
}
