import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import { repoRoot } from "./paths";

interface Target {
  readonly assetId: string;
  readonly file: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly footprintWidth: number;
  readonly footprintHeight: number;
  readonly scaleX: number;
}

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const sourceDir = join(repoRoot, "assets/source/raster/approved-production/large-building-scale");
const backupDir = join(sourceDir, "original-footprint-correction");

const targets: readonly Target[] = [
  {
    assetId: "building.town_block",
    file: "building-town-block-large.png",
    canvasWidth: 640,
    canvasHeight: 420,
    anchorX: 320,
    anchorY: 338,
    footprintWidth: 8,
    footprintHeight: 8,
    scaleX: 0.96
  },
  {
    assetId: "building.market",
    file: "building-market-large.png",
    canvasWidth: 420,
    canvasHeight: 280,
    anchorX: 210,
    anchorY: 196,
    footprintWidth: 6,
    footprintHeight: 4,
    scaleX: 0.9
  },
  {
    assetId: "building.barracks",
    file: "building-barracks-large.png",
    canvasWidth: 420,
    canvasHeight: 280,
    anchorX: 210,
    anchorY: 210,
    footprintWidth: 6,
    footprintHeight: 4,
    scaleX: 0.9
  },
  {
    assetId: "building.samurai_residence",
    file: "building-samurai-residence-large.png",
    canvasWidth: 460,
    canvasHeight: 360,
    anchorX: 230,
    anchorY: 273,
    footprintWidth: 6,
    footprintHeight: 6,
    scaleX: 1
  },
  {
    assetId: "building.storehouse",
    file: "building-storehouse-large.png",
    canvasWidth: 320,
    canvasHeight: 260,
    anchorX: 160,
    anchorY: 203,
    footprintWidth: 4,
    footprintHeight: 4,
    scaleX: 1
  }
];

export async function correctLargeBuildingFootprints(): Promise<string> {
  await mkdir(backupDir, { recursive: true });
  const rows = [
    "# Large Building Footprint Corrections",
    "",
    "| assetId | canvas | anchor | footprint | scaleX | before bounds | after bounds | base match |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- |"
  ];

  for (const target of targets) {
    const sourcePath = join(sourceDir, target.file);
    const backupPath = join(backupDir, target.file);
    await ensureBackup(sourcePath, backupPath);

    const before = await measureBounds(backupPath);
    const corrected = await renderCorrected(target, backupPath);
    await corrected.toFile(sourcePath);
    const after = await measureBounds(sourcePath);
    rows.push(
      `| \`${target.assetId}\` | ${target.canvasWidth}x${target.canvasHeight} | ${target.anchorX},${target.anchorY} | ${target.footprintWidth}x${target.footprintHeight} | ${target.scaleX} | ${formatBounds(before)} | ${formatBounds(after)} | corrected 64x32 footprint foundation |`
    );
  }

  const outputDir = join(repoRoot, "artifacts/isometric-alignment");
  await mkdir(outputDir, { recursive: true });
  const reportPath = join(outputDir, "large-building-footprint-report.md");
  await writeFile(reportPath, `${rows.join("\n")}\n`, "utf8");
  return reportPath;
}

async function ensureBackup(sourcePath: string, backupPath: string): Promise<void> {
  try {
    await access(backupPath, constants.F_OK);
  } catch {
    await copyFile(sourcePath, backupPath);
  }
}

async function renderCorrected(target: Target, backupPath: string): Promise<sharp.Sharp> {
  const base = Buffer.from(footprintSvg(target));
  const image = await scaleSource(target, backupPath);
  const composited = await sharp({
    create: {
      width: target.canvasWidth,
      height: target.canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: base, left: 0, top: 0 }, { input: image, left: 0, top: 0 }])
    .png()
    .toBuffer();
  return sharp(await clipBelowAnchor(composited, target.canvasWidth, target.canvasHeight, target.anchorY)).png();
}

async function scaleSource(target: Target, sourcePath: string): Promise<Buffer> {
  if (target.scaleX === 1) {
    return sharp(sourcePath).ensureAlpha().png().toBuffer();
  }

  const scaledWidth = Math.round(target.canvasWidth * target.scaleX);
  const scaled = await sharp(sourcePath)
    .resize({ width: scaledWidth, height: target.canvasHeight, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const left = Math.round(target.anchorX - target.anchorX * target.scaleX);
  return sharp({
    create: {
      width: target.canvasWidth,
      height: target.canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: scaled, left, top: 0 }])
    .png()
    .toBuffer();
}

function footprintSvg(target: Target): string {
  const halfWidth = ((target.footprintWidth + target.footprintHeight) * 64) / 4;
  const halfHeight = ((target.footprintWidth + target.footprintHeight) * 32) / 4;
  const centerY = target.anchorY - halfHeight;
  const top = `${target.anchorX},${centerY - halfHeight}`;
  const right = `${target.anchorX + halfWidth},${centerY}`;
  const south = `${target.anchorX},${target.anchorY}`;
  const left = `${target.anchorX - halfWidth},${centerY}`;
  const innerTop = `${target.anchorX},${centerY - halfHeight + 10}`;
  const innerRight = `${target.anchorX + halfWidth - 20},${centerY}`;
  const innerSouth = `${target.anchorX},${target.anchorY - 10}`;
  const innerLeft = `${target.anchorX - halfWidth + 20},${centerY}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${target.canvasWidth}" height="${target.canvasHeight}">
    <defs>
      <clipPath id="footprint-${basename(target.file, ".png")}">
        <polygon points="${top} ${right} ${south} ${left}"/>
      </clipPath>
      <linearGradient id="earth" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8b7a55" stop-opacity="0.48"/>
        <stop offset="0.55" stop-color="#6f6044" stop-opacity="0.42"/>
        <stop offset="1" stop-color="#3d3326" stop-opacity="0.56"/>
      </linearGradient>
    </defs>
    <polygon points="${top} ${right} ${south} ${left}" fill="url(#earth)" opacity="0.92"/>
    <g clip-path="url(#footprint-${basename(target.file, ".png")})" opacity="0.38">
      <path d="M ${left} L ${right}" stroke="#c0ad7a" stroke-width="1.2"/>
      <path d="M ${top} L ${south}" stroke="#3b3022" stroke-width="1"/>
      <polygon points="${innerTop} ${innerRight} ${innerSouth} ${innerLeft}" fill="none" stroke="#d1bc82" stroke-width="1.2" stroke-opacity="0.55"/>
    </g>
    <path d="M ${top} L ${right} L ${south} L ${left} Z" fill="none" stroke="#2c241b" stroke-width="2.2" stroke-linejoin="round" opacity="0.82"/>
    <path d="M ${left} L ${south} L ${right}" fill="none" stroke="#17120e" stroke-width="2.4" stroke-linejoin="round" opacity="0.72"/>
  </svg>`;
}

async function clipBelowAnchor(buffer: Buffer, width: number, height: number, anchorY: number): Promise<Buffer> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = anchorY + 1; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[(y * width + x) * 4 + 3] = 0;
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function measureBounds(filePath: string): Promise<Bounds | null> {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if ((data[(y * info.width + x) * 4 + 3] ?? 0) > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

function formatBounds(bounds: Bounds | null): string {
  return bounds === null ? "-" : `${bounds.minX},${bounds.minY}-${bounds.maxX},${bounds.maxY}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  correctLargeBuildingFootprints()
    .then((outputPath) => {
      console.log(`Wrote ${outputPath}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
