import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceDir = path.join(root, "assets/source/raster/approved-production/large-building-scale");
const outputDir = path.join(root, "assets/source/raster/approved-production/building-scale-up");

const assets = [
  ["building.tenshu.medium", "building-tenshu-medium.png", "building-tenshu-large.png", 192, 176, 96, 156, 2, 2],
  ["building.storehouse.large", "building-storehouse-large.png", "building-storehouse-large.png", 128, 112, 64, 94, 2, 1],
  ["building.market.large", "building-market-large.png", "building-market-large.png", 144, 112, 72, 94, 2, 1],
  ["building.barracks.large", "building-barracks-large.png", "building-barracks-large.png", 144, 112, 72, 94, 2, 1],
  ["building.samurai_residence.large", "building-samurai-residence-large.png", "building-samurai-residence-large.png", 144, 112, 72, 94, 2, 1],
  ["building.town_block.large", "building-town-block-large.png", "building-town-block-large.png", 144, 112, 72, 94, 2, 1]
] as const;

async function render(
  source: string,
  width: number,
  height: number,
  anchorY: number
): Promise<Buffer> {
  const trimmed = await sharp(source).trim().png().toBuffer();
  const resized = await sharp(trimmed)
    .resize(width - 8, anchorY - 6, { fit: "inside", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const metadata = await sharp(resized).metadata();
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{
      input: resized,
      left: Math.round((width - (metadata.width ?? width)) / 2),
      top: anchorY - (metadata.height ?? anchorY)
    }])
    .png()
    .toBuffer();
}

async function build(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const assetMap = [];
  const validation = [];
  const previews: sharp.OverlayOptions[] = [];

  for (const [index, asset] of assets.entries()) {
    const [id, file, sourceFile, width, height, anchorX, anchorY, footprintWidth, footprintHeight] = asset;
    const rendered = await render(path.join(sourceDir, sourceFile), width, height, anchorY);
    await writeFile(path.join(outputDir, file), rendered);
    const { data, info } = await sharp(rendered).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assetMap.push({
      id,
      file,
      canvas: { width, height },
      anchor: { x: anchorX, y: anchorY },
      footprint: { width: footprintWidth, height: footprintHeight },
      source: `../large-building-scale/${sourceFile}`
    });
    validation.push({
      id,
      file,
      width: info.width,
      height: info.height,
      hasAlpha: info.channels === 4,
      cornerAlpha: [
        data[3],
        data[(info.width - 1) * 4 + 3],
        data[(info.height - 1) * info.width * 4 + 3],
        data[(info.width * info.height - 1) * 4 + 3]
      ]
    });
    previews.push({
      input: rendered,
      left: 16 + (index % 3) * 208 + Math.round((192 - width) / 2),
      top: 16 + Math.floor(index / 3) * 208 + (176 - height)
    });
  }

  await sharp({ create: { width: 640, height: 432, channels: 4, background: "#355443" } })
    .composite(previews)
    .png()
    .toFile(path.join(outputDir, "contact-sheet.png"));

  await sharp({ create: { width: 800, height: 420, channels: 4, background: "#55714d" } })
    .composite(previews.map((entry) => ({
      ...entry,
      left: (entry.left ?? 0) + 80,
      top: (entry.top ?? 0) - 4
    })))
    .png()
    .toFile(path.join(outputDir, "in-game-composite-preview.png"));

  await writeFile(path.join(outputDir, "asset-map.json"), `${JSON.stringify(assetMap, null, 2)}\n`);
  await writeFile(path.join(outputDir, "validation-summary.json"), `${JSON.stringify(validation, null, 2)}\n`);
}

await build();
