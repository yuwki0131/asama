import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import type { RasterImportSpec } from "./types";

const categoryDefaults: Record<RasterImportSpec["category"], { readonly trimThreshold: number; readonly sharpenSigma?: number }> = {
  terrain: { trimThreshold: 8, sharpenSigma: 0.35 },
  building: { trimThreshold: 10, sharpenSigma: 0.45 },
  unit: { trimThreshold: 10, sharpenSigma: 0.5 },
  vegetation: { trimThreshold: 8, sharpenSigma: 0.35 },
  effect: { trimThreshold: 4 }
};

export async function importRasterAsset(spec: RasterImportSpec): Promise<void> {
  validateRasterImportSpec(spec);
  await mkdir(dirname(spec.outputFile), { recursive: true });

  let image = sharp(spec.sourceFile, { failOn: "error" }).ensureAlpha();
  const sourceMetadata = await image.metadata();
  if (sourceMetadata.hasAlpha !== true) {
    throw new Error(`Raster source must have an alpha channel: ${spec.sourceFile}`);
  }

  if (spec.trim) {
    image = image.trim({ threshold: categoryDefaults[spec.category].trimThreshold });
  }

  image = image.resize(resizeOptions(spec));

  // Use raw RGBA bytes so that tEXt/eXIf metadata from the source file
  // (e.g. Blender's Date/Time chunks) are not carried through to the output.
  const { data: rawPixels, info: rawInfo } = await image.raw().toBuffer({ resolveWithObject: true });
  const left = Math.floor((spec.canvasWidth - rawInfo.width) / 2);
  const top = Math.floor((spec.canvasHeight - rawInfo.height) / 2);

  image = sharp({
    create: {
      width: spec.canvasWidth,
      height: spec.canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite([{
    input: rawPixels,
    raw: { width: rawInfo.width, height: rawInfo.height, channels: rawInfo.channels as 1 | 2 | 3 | 4 },
    left: Math.max(0, left),
    top: Math.max(0, top)
  }]);

  const sharpenSigma = spec.sharpen?.sigma ?? categoryDefaults[spec.category].sharpenSigma;
  if (sharpenSigma !== undefined) {
    image = image.sharpen({ sigma: sharpenSigma });
  }

  if (spec.palette !== undefined) {
    // Art direction asks for a reduced-palette pseudo-pixel look; per-asset
    // quantization keeps the game-wide palette rich while giving each sprite
    // retro grain.
    await image.png({ palette: true, colors: spec.palette.colors, dither: spec.palette.dither }).toFile(spec.outputFile);
  } else {
    await image.png().toFile(spec.outputFile);
  }
  await validateOutputPng(spec.outputFile, spec.canvasWidth, spec.canvasHeight);
}

export function validateRasterImportSpec(spec: RasterImportSpec): void {
  assertPositiveInteger(spec.canvasWidth, "canvasWidth");
  assertPositiveInteger(spec.canvasHeight, "canvasHeight");
  assertNumberInRange(spec.anchorX, 0, spec.canvasWidth, "anchorX");
  assertNumberInRange(spec.anchorY, 0, spec.canvasHeight, "anchorY");

  if (!["contain", "cover", "exact"].includes(spec.resizeMode)) {
    throw new Error(`Invalid resizeMode: ${spec.resizeMode}`);
  }
  if (!["terrain", "building", "unit", "vegetation", "effect"].includes(spec.category)) {
    throw new Error(`Invalid raster category: ${spec.category}`);
  }
}

async function validateOutputPng(path: string, width: number, height: number): Promise<void> {
  const metadata = await sharp(path).metadata();
  if (metadata.format !== "png") {
    throw new Error(`Postprocess output is not PNG: ${path}`);
  }
  if (metadata.width !== width || metadata.height !== height) {
    throw new Error(`Postprocess output has wrong dimensions: ${path}`);
  }
  if (metadata.hasAlpha !== true) {
    throw new Error(`Postprocess output must preserve alpha: ${path}`);
  }
}

function resizeOptions(spec: RasterImportSpec): sharp.ResizeOptions {
  if (spec.resizeMode === "exact") {
    return {
      width: spec.canvasWidth,
      height: spec.canvasHeight,
      fit: "fill"
    };
  }

  return {
    width: spec.canvasWidth,
    height: spec.canvasHeight,
    fit: spec.resizeMode,
    withoutEnlargement: false,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  };
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}`);
  }
}

function assertNumberInRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}`);
  }
}
