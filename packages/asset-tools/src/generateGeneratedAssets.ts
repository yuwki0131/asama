import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { readPlaceholderConfig } from "./config";
import { generatedConfigPath, generatedManifestPath, generatedOutputDir } from "./paths";
import { renderPlaceholderSvg } from "./templates";
import type { AssetManifest, GeneratedAsset, PlaceholderAssetSpec } from "./types";

export async function generateGeneratedAssets(): Promise<AssetManifest> {
  const config = await readPlaceholderConfig(generatedConfigPath);
  await mkdir(generatedOutputDir, { recursive: true });

  const assets: GeneratedAsset[] = [];
  for (const asset of config.assets) {
    assets.push(await writeGeneratedAsset(asset));
  }

  const manifest: AssetManifest = {
    version: 1,
    generatedBy: "img-agent",
    generatedAt: new Date().toISOString(),
    assets
  };

  await writeFile(generatedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function writeGeneratedAsset(asset: PlaceholderAssetSpec): Promise<GeneratedAsset> {
  const outputPath = join(generatedOutputDir, asset.output);
  const metadata = await sharp(Buffer.from(renderPlaceholderSvg(asset))).png().toFile(outputPath);

  return {
    assetId: asset.assetId,
    kind: asset.kind,
    file: `generated/${asset.output}`,
    width: metadata.width ?? asset.width,
    height: metadata.height ?? asset.height,
    anchor: asset.anchor
  };
}
