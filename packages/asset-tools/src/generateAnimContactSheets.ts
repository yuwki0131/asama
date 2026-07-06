/**
 * Writes enlarged (nearest-neighbor) contact sheets of every animation sheet
 * in the generated manifest to assets/intermediate/spike/, for art review.
 *
 * Run: pnpm --filter @asama/asset-tools assets:anim:contact-sheet
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { generatedManifestPath, intermediateAssetsDir, publicAssetsDir } from "./paths";
import type { AssetManifest } from "./types";

const SCALE = 3;
const GRID_COLOR = { r: 70, g: 70, b: 78, alpha: 255 };
const BACKGROUND = { r: 58, g: 58, b: 64, alpha: 255 };

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(generatedManifestPath, "utf8")) as AssetManifest;
  const animations = manifest.animations ?? [];
  if (animations.length === 0) {
    console.log("No animations in the generated manifest.");
    return;
  }
  const outputDir = join(intermediateAssetsDir, "spike");
  await mkdir(outputDir, { recursive: true });

  for (const entry of animations) {
    const sheetPath = join(publicAssetsDir, entry.file);
    const scaledWidth = entry.sheet.width * SCALE;
    const scaledHeight = entry.sheet.height * SCALE;
    const scaled = await sharp(sheetPath)
      .resize(scaledWidth, scaledHeight, { kernel: "nearest" })
      .ensureAlpha()
      .raw()
      .toBuffer();

    // Grid lines on cell boundaries so frame/direction alignment is obvious.
    const cellW = entry.frame.width * SCALE;
    const cellH = entry.frame.height * SCALE;
    for (let y = 0; y < scaledHeight; y += 1) {
      for (let x = 0; x < scaledWidth; x += 1) {
        const onGrid = x % cellW === 0 || y % cellH === 0;
        const offset = (y * scaledWidth + x) * 4;
        if (onGrid) {
          scaled[offset] = GRID_COLOR.r;
          scaled[offset + 1] = GRID_COLOR.g;
          scaled[offset + 2] = GRID_COLOR.b;
          scaled[offset + 3] = GRID_COLOR.alpha;
        }
      }
    }

    const outputName = `anim-${entry.assetId.replace(/\./g, "-")}-contact.png`;
    const outputPath = join(outputDir, outputName);
    const png = await sharp(scaled, { raw: { width: scaledWidth, height: scaledHeight, channels: 4 } })
      .flatten({ background: BACKGROUND })
      .png()
      .toBuffer();
    await writeFile(outputPath, png);
    console.log(`Wrote ${outputPath}`);
  }
}

await main();
