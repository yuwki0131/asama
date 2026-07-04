import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import { delimiter } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { importRasterAsset } from "./postprocess";
import type { BlenderRenderSpec, ProductionAssetSpec, RasterImportSpec } from "./types";

const execFileAsync = promisify(execFile);
const alphaThreshold = 8;

export interface BlenderRunResult {
  readonly assetId: string;
  readonly rawOutput: string;
  readonly runtimeOutput: string;
  readonly stdout: string;
}

export interface BlenderRawRenderResult {
  readonly assetId: string;
  readonly rawOutput: string;
  readonly stdout: string;
}

export interface AlphaBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
  readonly widestRowWidth: number;
}

export interface CalibrationCheckResult {
  readonly model: string;
  readonly passed: boolean;
  readonly output: string;
  readonly bounds: AlphaBounds | null;
  readonly messages: readonly string[];
}

export async function resolveBlenderBinary(env = process.env): Promise<string> {
  if (env.ASAMA_BLENDER_BIN !== undefined && env.ASAMA_BLENDER_BIN.length > 0) {
    await assertExecutable(env.ASAMA_BLENDER_BIN, "ASAMA_BLENDER_BIN");
    return env.ASAMA_BLENDER_BIN;
  }

  for (const directory of (env.PATH ?? "").split(delimiter).filter((value) => value.length > 0)) {
    const candidate = join(directory, "blender");
    try {
      await assertExecutable(candidate, "blender");
      return candidate;
    } catch {
      // Continue scanning PATH.
    }
  }

  throw new Error("Blender binary not found. Set ASAMA_BLENDER_BIN or install blender on PATH.");
}

export function toHeadlessBlenderRenderSpec(
  asset: ProductionAssetSpec,
  outputDirectory: string,
  reportDirectory?: string
): BlenderRenderSpec {
  if (asset.source.type !== "blender") {
    throw new Error(`Asset is not a Blender source: ${asset.assetId}`);
  }
  if (asset.source.model === undefined) {
    throw new Error(`render_asset.py requires a registered model for Blender asset: ${asset.assetId}`);
  }

  const outputName = outputNameForAsset(asset);
  return {
    model: asset.source.model,
    ...(asset.source.scene === undefined ? {} : { scene: asset.source.scene }),
    ...(asset.source.collection === undefined ? {} : { collection: asset.source.collection }),
    outputDirectory,
    outputName,
    resolution: {
      width: asset.geometry.canvasWidth,
      height: asset.geometry.canvasHeight
    },
    anchor: {
      x: asset.geometry.anchorX,
      y: asset.geometry.anchorY
    },
    transparentBackground: true,
    renderSpec: asset.source.renderSpec,
    ...(asset.source.supersample === undefined ? {} : { supersample: asset.source.supersample }),
    ...(reportDirectory === undefined ? {} : { reportJson: join(reportDirectory, `${outputName}.json`) })
  };
}

export function buildHeadlessBlenderArgs(spec: BlenderRenderSpec, pythonScript: string): readonly string[] {
  const args = [
    "--background",
    "--factory-startup",
    "--python",
    pythonScript,
    "--",
    "--model",
    spec.model ?? "",
    "--canvas",
    `${spec.resolution.width}x${spec.resolution.height}`,
    "--anchor",
    `${spec.anchor.x},${spec.anchor.y}`,
    "--output-directory",
    spec.outputDirectory,
    "--render-spec",
    spec.renderSpec,
    "--transparent-background",
    String(spec.transparentBackground)
  ];

  appendOptional(args, "--output-name", spec.outputName);
  appendOptional(args, "--report-json", spec.reportJson);
  appendOptional(args, "--supersample", spec.supersample);

  if (spec.model === undefined || spec.model.length === 0) {
    throw new Error("render_asset.py requires --model");
  }

  return args;
}

export async function renderBlenderAsset(
  asset: ProductionAssetSpec,
  options: {
    readonly blenderBinary: string;
    readonly pythonScript: string;
    readonly rawOutputDirectory: string;
    readonly runtimeOutputDirectory: string;
    readonly reportDirectory?: string;
  }
): Promise<BlenderRunResult> {
  const result = await renderBlenderAssetRaw(asset, options);
  const runtimeOutput = join(options.runtimeOutputDirectory, asset.output);
  await importBlenderRawAsset(asset, result.rawOutput, runtimeOutput);

  return {
    assetId: asset.assetId,
    rawOutput: result.rawOutput,
    runtimeOutput,
    stdout: result.stdout
  };
}

export async function renderBlenderAssetRaw(
  asset: ProductionAssetSpec,
  options: {
    readonly blenderBinary: string;
    readonly pythonScript: string;
    readonly rawOutputDirectory: string;
    readonly reportDirectory?: string;
  }
): Promise<BlenderRawRenderResult> {
  const spec = toHeadlessBlenderRenderSpec(asset, options.rawOutputDirectory, options.reportDirectory);
  if (spec.reportJson !== undefined) {
    await mkdir(dirname(spec.reportJson), { recursive: true });
  }
  await mkdir(options.rawOutputDirectory, { recursive: true });

  const { stdout } = await execFileAsync(options.blenderBinary, buildHeadlessBlenderArgs(spec, options.pythonScript), {
    maxBuffer: 1024 * 1024 * 8
  });

  return {
    assetId: asset.assetId,
    rawOutput: join(options.rawOutputDirectory, `${spec.outputName ?? spec.model ?? "render"}.png`),
    stdout
  };
}

export async function importBlenderRawAsset(
  asset: ProductionAssetSpec,
  rawOutput: string,
  runtimeOutput: string
): Promise<void> {
  await importRasterAsset(toBlenderRasterImportSpec(asset, rawOutput, runtimeOutput));
}

export async function renderCalibrationSuite(options: {
  readonly blenderBinary: string;
  readonly pythonScript: string;
  readonly artifactDirectory: string;
  readonly renderSpec?: string;
}): Promise<readonly CalibrationCheckResult[]> {
  const renderSpec = options.renderSpec ?? "cycles-cpu";
  const outputDirectory = join(options.artifactDirectory, "raw-renders");
  await mkdir(outputDirectory, { recursive: true });

  const checks: CalibrationSpec[] = [
    {
      model: "calibration-tile",
      canvas: { width: 64, height: 32 },
      anchor: { x: 32, y: 16 },
      validate: (bounds) => [
        expectBounds(bounds, 0, 0, 63, 31),
        bounds?.widestRowWidth === 64 ? null : `widest row must be 64px, got ${bounds?.widestRowWidth ?? "none"}`
      ]
    },
    {
      model: "calibration-cube",
      canvas: { width: 64, height: 80 },
      anchor: { x: 32, y: 56 },
      validate: (bounds) => [
        bounds?.width === 64 ? null : `bounds width must be 64px, got ${bounds?.width ?? "none"}`
      ]
    },
    {
      model: "calibration-grid",
      canvas: { width: 192, height: 96 },
      anchor: { x: 96, y: 48 },
      validate: (bounds) => [expectBounds(bounds, 0, 0, 191, 95)]
    },
    {
      // Guards the map-to-world mirror convention (worldY = -mapY). The
      // east-neighbor cube must project to screen lower-right; a mirrored
      // camera or model space puts it left (bounds x roughly 16..112).
      model: "calibration-chirality",
      canvas: { width: 160, height: 128 },
      anchor: { x: 80, y: 48 },
      validate: (bounds) =>
        bounds === null
          ? ["no opaque pixels"]
          : [
              bounds.minX > 40 && bounds.maxX > 140
                ? null
                : `east cube must render lower-right; bounds x ${bounds.minX}..${bounds.maxX} suggests a mirrored projection`
            ]
    }
  ];

  const results: CalibrationCheckResult[] = [];
  for (const check of checks) {
    const output = join(outputDirectory, `${check.model}.png`);
    const reportJson = join(options.artifactDirectory, `${check.model}.json`);
    const spec: BlenderRenderSpec = {
      model: check.model,
      outputDirectory,
      outputName: check.model,
      resolution: check.canvas,
      anchor: check.anchor,
      transparentBackground: true,
      renderSpec,
      reportJson
    };
    await execFileAsync(options.blenderBinary, buildHeadlessBlenderArgs(spec, options.pythonScript), {
      maxBuffer: 1024 * 1024 * 8
    });
    const bounds = await readAlphaBounds(output, alphaThreshold);
    const messages = check.validate(bounds).filter((message): message is string => message !== null);
    results.push({
      model: check.model,
      passed: messages.length === 0,
      output,
      bounds,
      messages
    });
  }

  await writeCalibrationReport(join(options.artifactDirectory, "report.md"), results);
  return results;
}

export async function readAlphaBounds(path: string, threshold = alphaThreshold): Promise<AlphaBounds | null> {
  const image = sharp(path).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (width === undefined || height === undefined) {
    throw new Error(`Unable to read PNG dimensions: ${path}`);
  }

  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  return alphaBoundsFromRgba(data, width, height, threshold);
}

export function alphaBoundsFromRgba(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  threshold = alphaThreshold
): AlphaBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let widestRowWidth = 0;

  for (let y = 0; y < height; y += 1) {
    let rowMinX = width;
    let rowMaxX = -1;
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        rowMinX = Math.min(rowMinX, x);
        rowMaxX = Math.max(rowMaxX, x);
      }
    }
    if (rowMaxX >= rowMinX) {
      widestRowWidth = Math.max(widestRowWidth, rowMaxX - rowMinX + 1);
    }
  }

  if (maxX < 0) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    widestRowWidth
  };
}

export async function writeCalibrationReport(path: string, results: readonly CalibrationCheckResult[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const lines = [
    "# Blender Calibration Report",
    "",
    `Status: ${results.every((result) => result.passed) ? "passed" : "failed"}`,
    "",
    "| Model | Status | Bounds | Widest row | Output |",
    "| --- | --- | --- | ---: | --- |",
    ...results.map((result) => {
      const bounds =
        result.bounds === null
          ? "none"
          : `(${result.bounds.minX},${result.bounds.minY})-(${result.bounds.maxX},${result.bounds.maxY})`;
      return `| ${result.model} | ${result.passed ? "passed" : "failed"} | ${bounds} | ${result.bounds?.widestRowWidth ?? 0} | ${result.output} |`;
    }),
    "",
    ...results.flatMap((result) =>
      result.messages.length === 0 ? [] : [`## ${result.model}`, "", ...result.messages.map((message) => `- ${message}`), ""]
    )
  ];
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

function toBlenderRasterImportSpec(asset: ProductionAssetSpec, sourceFile: string, outputFile: string): RasterImportSpec {
  return {
    sourceFile,
    outputFile,
    canvasWidth: asset.geometry.canvasWidth,
    canvasHeight: asset.geometry.canvasHeight,
    anchorX: asset.geometry.anchorX,
    anchorY: asset.geometry.anchorY,
    trim: false,
    resizeMode: "exact",
    category: asset.category ?? categoryForKind(asset.kind),
    ...(asset.postprocess?.sharpen === undefined ? {} : { sharpen: asset.postprocess.sharpen })
  };
}

function outputNameForAsset(asset: ProductionAssetSpec): string {
  const extension = extname(asset.output);
  return basename(asset.output, extension);
}

function expectBounds(bounds: AlphaBounds | null, minX: number, minY: number, maxX: number, maxY: number): string | null {
  if (bounds === null) {
    return `bounds must be (${minX},${minY})-(${maxX},${maxY}), got none`;
  }
  if (bounds.minX !== minX || bounds.minY !== minY || bounds.maxX !== maxX || bounds.maxY !== maxY) {
    return `bounds must be (${minX},${minY})-(${maxX},${maxY}), got (${bounds.minX},${bounds.minY})-(${bounds.maxX},${bounds.maxY})`;
  }
  return null;
}

function categoryForKind(kind: ProductionAssetSpec["kind"]): RasterImportSpec["category"] {
  if (kind === "terrain") {
    return "terrain";
  }
  if (kind === "unit") {
    return "unit";
  }
  if (kind === "building") {
    return "building";
  }
  return "effect";
}

async function assertExecutable(path: string, label: string): Promise<void> {
  if (!isAbsolute(path) && label === "ASAMA_BLENDER_BIN") {
    throw new Error(`ASAMA_BLENDER_BIN must be an absolute path: ${path}`);
  }
  try {
    await access(path, constants.X_OK);
  } catch {
    throw new Error(`Blender binary is not executable (${label}): ${path}`);
  }
}

function appendOptional(args: string[], flag: string, value: string | number | undefined): void {
  if (value !== undefined) {
    args.push(flag, String(value));
  }
}

interface CalibrationSpec {
  readonly model: string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly anchor: {
    readonly x: number;
    readonly y: number;
  };
  readonly validate: (bounds: AlphaBounds | null) => readonly (string | null)[];
}
