import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

/**
 * AI-art intake gate (hybrid asset policy): background removal, trim,
 * canvas/anchor normalization, and tone calibration against the tenshu
 * reference so generated sprites sit in the same world palette.
 */

export interface AiIntakeEntry {
  readonly input: string;
  readonly assetId: string;
  readonly output: string;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly anchor: { readonly x: number; readonly y: number };
}

export interface AiIntakeConfig {
  readonly version: number;
  readonly reference: string;
  readonly entries: readonly AiIntakeEntry[];
}

interface ToneStats {
  readonly meanLuma: number;
  readonly meanSat: number;
}

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

export async function loadAiIntakeConfig(path: string): Promise<AiIntakeConfig> {
  const config = JSON.parse(await readFile(path, "utf8")) as AiIntakeConfig;
  if (config.version !== 1 || !Array.isArray(config.entries)) {
    throw new Error("Unsupported ai-intake config");
  }
  return config;
}

async function loadRaw(path: string): Promise<RawImage> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Flood-fill the near-solid background from the image corners to alpha 0.
 * No-op when the corners are already transparent. */
export function removeSolidBackground(image: RawImage, tolerance = 26): { removed: boolean } {
  const { data, width, height } = image;
  const idx = (x: number, y: number) => (y * width + x) * 4;
  const corners = [idx(0, 0), idx(width - 1, 0), idx(0, height - 1), idx(width - 1, height - 1)];
  const opaqueCorners = corners.filter((i) => (data[i + 3] ?? 0) > 200);
  if (opaqueCorners.length < 3) {
    return { removed: false };
  }
  const bg = [0, 1, 2].map((c) => Math.round(opaqueCorners.reduce((sum, i) => sum + (data[i + c] ?? 0), 0) / opaqueCorners.length));
  const matches = (i: number) =>
    (data[i + 3] ?? 0) > 0 &&
    Math.abs((data[i] ?? 0) - (bg[0] ?? 0)) <= tolerance &&
    Math.abs((data[i + 1] ?? 0) - (bg[1] ?? 0)) <= tolerance &&
    Math.abs((data[i + 2] ?? 0) - (bg[2] ?? 0)) <= tolerance;

  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  for (let x = 0; x < width; x += 1) {
    queue.push(x, x + (height - 1) * width);
  }
  for (let y = 0; y < height; y += 1) {
    queue.push(y * width, y * width + width - 1);
  }
  while (queue.length > 0) {
    const p = queue.pop() as number;
    if (visited[p]) {
      continue;
    }
    visited[p] = 1;
    const i = p * 4;
    if (!matches(i)) {
      continue;
    }
    data[i + 3] = 0;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) queue.push(p - 1);
    if (x < width - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - width);
    if (y < height - 1) queue.push(p + width);
  }
  return { removed: true };
}

export function computeToneStats(image: RawImage): ToneStats {
  const { data } = image;
  let luma = 0;
  let sat = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 128) {
      continue;
    }
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    luma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sat += max === 0 ? 0 : (max - min) / max;
    count += 1;
  }
  if (count === 0) {
    throw new Error("Image has no opaque pixels");
  }
  return { meanLuma: luma / count, meanSat: sat / count };
}

/** Linear tone match: scale luminance and saturation of opaque pixels so
 * their means land on the reference values. Deterministic and reversible. */
export function calibrateTone(image: RawImage, reference: ToneStats): { lumaGain: number; satGain: number } {
  const stats = computeToneStats(image);
  const lumaGain = clamp(reference.meanLuma / Math.max(1, stats.meanLuma), 0.45, 1.6);
  const satGain = clamp(reference.meanSat / Math.max(0.02, stats.meanSat), 0.5, 1.5);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) {
      continue;
    }
    let r = (data[i] ?? 0) * lumaGain;
    let g = (data[i + 1] ?? 0) * lumaGain;
    let b = (data[i + 2] ?? 0) * lumaGain;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luma + (r - luma) * satGain;
    g = luma + (g - luma) * satGain;
    b = luma + (b - luma) * satGain;
    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }
  return { lumaGain, satGain };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export interface AiIntakeResult {
  readonly assetId: string;
  readonly output: string;
  readonly backgroundRemoved: boolean;
  readonly lumaGain: number;
  readonly satGain: number;
  readonly opaqueRatio: number;
  readonly contactRow: number;
}

export async function intakeAiAsset(options: {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly previewPath: string;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly anchor: { readonly x: number; readonly y: number };
  readonly reference: ToneStats;
  readonly assetId: string;
}): Promise<AiIntakeResult> {
  const image = await loadRaw(options.inputPath);
  const { removed } = removeSolidBackground(image);
  const gains = calibrateTone(image, options.reference);

  const cleaned = sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png();
  const trimmed = await sharp(await cleaned.toBuffer()).trim({ threshold: 8 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const srcW = meta.width ?? 1;
  const srcH = meta.height ?? 1;

  // Fit by width, cap by anchor height, keep the base on the anchor row.
  const scale = Math.min(options.canvas.width / srcW, options.anchor.y / srcH);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));
  const resized = await sharp(trimmed).resize(dstW, dstH, { kernel: "lanczos3" }).png().toBuffer();
  const left = Math.round(options.anchor.x - dstW / 2);
  const top = Math.round(options.anchor.y - dstH);

  const composed = await sharp({
    create: { width: options.canvas.width, height: options.canvas.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
  await writeFile(options.outputPath, composed);

  // Verification: opaque coverage and contact row (lowest opaque row must
  // hit the anchor row so the sprite stands on its cell).
  const { data, info } = await sharp(composed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  let contactRow = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if ((data[(y * info.width + x) * 4 + 3] ?? 0) > 8) {
        opaque += 1;
        if (y > contactRow) {
          contactRow = y;
        }
      }
    }
  }
  const opaqueRatio = opaque / (info.width * info.height);
  if (Math.abs(contactRow - (options.anchor.y - 1)) > 1) {
    throw new Error(`${options.assetId}: contact row ${contactRow} does not meet anchor ${options.anchor.y}`);
  }

  // Preview: original vs calibrated at 3x.
  const before = await sharp(options.inputPath).resize(options.canvas.width * 3, options.canvas.height * 3, { fit: "inside", kernel: "lanczos3" }).png().toBuffer();
  const after = await sharp(composed).resize(options.canvas.width * 3, options.canvas.height * 3, { kernel: "nearest" }).png().toBuffer();
  const beforeMeta = await sharp(before).metadata();
  await sharp({
    create: {
      width: (beforeMeta.width ?? 0) + options.canvas.width * 3 + 30,
      height: Math.max(beforeMeta.height ?? 0, options.canvas.height * 3) + 20,
      channels: 4,
      background: { r: 42, g: 46, b: 48, alpha: 255 }
    }
  })
    .composite([
      { input: before, left: 10, top: 10 },
      { input: after, left: (beforeMeta.width ?? 0) + 20, top: 10 }
    ])
    .png()
    .toFile(options.previewPath);

  return {
    assetId: options.assetId,
    output: options.outputPath,
    backgroundRemoved: removed,
    lumaGain: gains.lumaGain,
    satGain: gains.satGain,
    opaqueRatio,
    contactRow
  };
}

export async function runAiIntake(repoRoot: string): Promise<readonly AiIntakeResult[]> {
  const config = await loadAiIntakeConfig(join(repoRoot, "assets/definitions/ai-intake.json"));
  const reference = computeToneStats(await loadRaw(join(repoRoot, config.reference)));
  const inputDirectory = join(repoRoot, "assets/source/ai");
  const outputDirectory = join(repoRoot, "assets/source/raster");
  const previewDirectory = join(repoRoot, "assets/intermediate/ai-intake");
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(previewDirectory, { recursive: true });

  const results: AiIntakeResult[] = [];
  for (const entry of config.entries) {
    const inputPath = join(inputDirectory, entry.input);
    try {
      await readFile(inputPath);
    } catch {
      continue; // Source not generated yet; intake what exists.
    }
    results.push(
      await intakeAiAsset({
        inputPath,
        outputPath: join(outputDirectory, entry.output),
        previewPath: join(previewDirectory, `${entry.assetId.replace(/\./g, "-")}-preview.png`),
        canvas: entry.canvas,
        anchor: entry.anchor,
        reference,
        assetId: entry.assetId
      })
    );
  }
  return results;
}
