import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { readPlaceholderConfig } from "./config";
import { placeholderConfigPath, placeholderManifestPath, placeholderOutputDir } from "./paths";
import { renderPlaceholderSvg } from "./templates";
import type { AssetManifest, GeneratedAsset, PlaceholderAssetSpec } from "./types";

export async function generatePlaceholders(): Promise<AssetManifest> {
  const config = await readPlaceholderConfig(placeholderConfigPath);
  await mkdir(placeholderOutputDir, { recursive: true });

  const assets: GeneratedAsset[] = [];
  for (const asset of config.assets) {
    assets.push(await writePlaceholder(asset));
  }

  const manifest: AssetManifest = {
    version: 1,
    generatedBy: "@asama/asset-tools",
    generatedAt: new Date().toISOString(),
    assets
  };

  await writeFile(placeholderManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function writePlaceholder(asset: PlaceholderAssetSpec): Promise<GeneratedAsset> {
  const outputPath = join(placeholderOutputDir, asset.output);
  const metadata = await sharp(Buffer.from(renderPlaceholderSvg(asset))).png().toFile(outputPath);

  return {
    assetId: asset.assetId,
    kind: asset.kind,
    file: `placeholders/${asset.output}`,
    width: metadata.width ?? asset.width,
    height: metadata.height ?? asset.height,
    anchor: asset.anchor
  };
}
