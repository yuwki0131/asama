import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { readPlaceholderConfig } from "./config";
import { generatedConfigPath, generatedManifestPath, generatedOutputDir } from "./paths";
import { renderPlaceholderSvg } from "./templates";
import type { AssetManifest, GeneratedAsset, PlaceholderAssetSpec } from "./types";

interface ConnectedConstructionAssetFamily {
  readonly prefix: string;
  readonly outputPrefix: string;
  readonly pattern: NonNullable<PlaceholderAssetSpec["pattern"]>;
  readonly width: number;
  readonly height: number;
  readonly fill: string;
  readonly stroke: string;
  readonly accent?: string;
  readonly anchor: PlaceholderAssetSpec["anchor"];
}

export async function generateGeneratedAssets(): Promise<AssetManifest> {
  const config = await readPlaceholderConfig(generatedConfigPath);
  await mkdir(generatedOutputDir, { recursive: true });

  const assets: GeneratedAsset[] = [];
  for (const asset of [...config.assets, ...connectedConstructionAssets()]) {
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

function connectedConstructionAssets(): PlaceholderAssetSpec[] {
  const masks = Array.from({ length: 16 }, (_, value) => value.toString(2).padStart(4, "0"));
  const families: readonly ConnectedConstructionAssetFamily[] = [
    {
      prefix: "building.fence.wood.connected",
      outputPrefix: "building-fence-wood-connected",
      pattern: "connected-fence",
      width: 64,
      height: 64,
      fill: "#8a5f35",
      stroke: "#2f2116",
      anchor: { x: 0.5, y: 0.75 }
    },
    {
      prefix: "building.wall.plaster.connected",
      outputPrefix: "building-wall-plaster-connected",
      pattern: "connected-wall",
      width: 64,
      height: 72,
      fill: "#ded9c5",
      stroke: "#3f3a31",
      accent: "#59616a",
      anchor: { x: 0.5, y: 0.78 }
    },
    {
      prefix: "building.dry_moat.connected",
      outputPrefix: "building-dry-moat-connected",
      pattern: "connected-dry-moat",
      width: 64,
      height: 32,
      fill: "#715637",
      stroke: "#3f2c1f",
      anchor: { x: 0.5, y: 0.5 }
    },
    {
      prefix: "building.water_moat.connected",
      outputPrefix: "building-water-moat-connected",
      pattern: "connected-water-moat",
      width: 64,
      height: 32,
      fill: "#285f70",
      stroke: "#1c3d49",
      anchor: { x: 0.5, y: 0.5 }
    }
  ] as const;

  return families.flatMap((family) =>
    masks.map((mask) => ({
      assetId: `${family.prefix}.${mask}`,
      kind: "building",
      output: `${family.outputPrefix}-${mask}.png`,
      width: family.width,
      height: family.height,
      fill: family.fill,
      stroke: family.stroke,
      ...(family.accent === undefined ? {} : { accent: family.accent }),
      pattern: family.pattern,
      connectionMask: mask,
      anchor: family.anchor
    }))
  );
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
