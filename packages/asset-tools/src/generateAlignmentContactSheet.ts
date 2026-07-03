import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { readManifest } from "./manifest";
import { generatedManifestPath, publicAssetsDir, repoRoot } from "./paths";
import type { GeneratedAsset } from "./types";

interface CellCoord {
  readonly x: number;
  readonly y: number;
}

interface AlignmentTarget {
  readonly assetId: string;
  readonly footprintWidth: number;
  readonly footprintHeight: number;
  readonly placement: "center" | "south";
  readonly sockets?: boolean;
  readonly concern?: string;
  readonly baseMatch?: string;
}

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const sheetCellWidth = 900;
const sheetCellHeight = 620;
const columns = 1;
const targets: readonly AlignmentTarget[] = [
  { assetId: "terrain.grass.base", footprintWidth: 1, footprintHeight: 1, placement: "center" },
  { assetId: "building.storehouse", footprintWidth: 3, footprintHeight: 3, placement: "south", baseMatch: "blender yard-pad foundation" },
  { assetId: "building.market", footprintWidth: 6, footprintHeight: 4, placement: "south", baseMatch: "corrected footprint foundation" },
  { assetId: "building.barracks", footprintWidth: 6, footprintHeight: 4, placement: "south", baseMatch: "corrected footprint foundation" },
  { assetId: "building.samurai_residence", footprintWidth: 6, footprintHeight: 6, placement: "south", baseMatch: "corrected footprint foundation" },
  { assetId: "building.town_block", footprintWidth: 8, footprintHeight: 8, placement: "south", baseMatch: "corrected footprint foundation" },
  { assetId: "building.gate.wood.closed", footprintWidth: 1, footprintHeight: 1, placement: "center", sockets: true },
  {
    assetId: "building.yagura.small.normal",
    footprintWidth: 1,
    footprintHeight: 1,
    placement: "south",
    concern: "initial runtime source; final footprint pending design confirmation"
  },
  { assetId: "building.wall.plaster.connected.1010", footprintWidth: 1, footprintHeight: 1, placement: "center", sockets: true },
  { assetId: "building.fence.wood.connected.1010", footprintWidth: 1, footprintHeight: 1, placement: "center", sockets: true }
];

export async function generateAlignmentContactSheet(): Promise<string> {
  const manifest = await readManifest(generatedManifestPath);
  const rows = Math.ceil(targets.length / columns);
  const width = columns * sheetCellWidth;
  const height = rows * sheetCellHeight;
  const outputDir = join(repoRoot, "artifacts/isometric-alignment");
  const outputPath = join(outputDir, "contact-sheet.png");
  await mkdir(outputDir, { recursive: true });

  const baseSvg = renderBaseSvg(width, height);
  const imageOverlays: sharp.OverlayOptions[] = [];
  const reportRows: string[] = [
    "# Isometric Alignment Contact Sheet",
    "",
    "| assetId | status | canvas | anchor px | alpha bounds | footprint | base match | concern |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const [index, target] of targets.entries()) {
    const asset = manifest.assets.find((candidate) => candidate.assetId === target.assetId);
    const origin = targetOrigin(index);
    if (asset === undefined) {
      reportRows.push(
        `| \`${target.assetId}\` | missing | - | - | - | ${target.footprintWidth}x${target.footprintHeight} ${target.placement} | - | runtime manifest entry missing |`
      );
      continue;
    }

    const anchor = anchorPixel(asset);
    const bounds = await measureAlphaBounds(join(publicAssetsDir, asset.file));
    const contact = contactPoint(origin);
    imageOverlays.push({
      input: join(publicAssetsDir, asset.file),
      left: Math.round(contact.x - anchor.x),
      top: Math.round(contact.y - anchor.y)
    });
    reportRows.push(
      `| \`${target.assetId}\` | present | ${asset.width}x${asset.height} | ${anchor.x},${anchor.y} | ${formatBounds(bounds)} | ${target.footprintWidth}x${target.footprintHeight} ${target.placement} | ${target.baseMatch ?? "-"} | ${targetConcern(target, bounds, anchor)} |`
    );
  }

  const overlaySvg = renderOverlaySvg(width, height, manifest.assets);
  await sharp(Buffer.from(baseSvg))
    .composite([...imageOverlays, { input: Buffer.from(overlaySvg), left: 0, top: 0 }])
    .png()
    .toFile(outputPath);

  await writeFile(join(outputDir, "report.md"), `${reportRows.join("\n")}\n`, "utf8");
  return outputPath;
}

function renderBaseSvg(width: number, height: number): string {
  const labels = targets.map((target, index) => {
    const origin = targetOrigin(index);
    return `<text x="${origin.x + 16}" y="${origin.y + 24}" fill="#d9e4d2" font-family="monospace" font-size="14">${escapeXml(
      target.assetId
    )}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#26342f"/>
    ${targets
      .map((_, index) => {
        const origin = targetOrigin(index);
        return `<rect x="${origin.x}" y="${origin.y}" width="${sheetCellWidth}" height="${sheetCellHeight}" fill="none" stroke="#3d554b"/>`;
      })
      .join("")}
    ${labels.join("")}
  </svg>`;
}

function renderOverlaySvg(width: number, height: number, assets: readonly GeneratedAsset[]): string {
  const content = targets.map((target, index) => {
    const asset = assets.find((candidate) => candidate.assetId === target.assetId);
    const origin = targetOrigin(index);
    const contact = contactPoint(origin);
    const center = footprintCenterFromPlacement(contact, target);
    const footprint = footprintDiamond(center, target.footprintWidth, target.footprintHeight);
    const tile = footprintDiamond(center, 1, 1);
    const bounds =
      asset === undefined
        ? `<text x="${origin.x + 16}" y="${origin.y + 52}" fill="#ff8f8f" font-family="monospace" font-size="13">MISSING IN RUNTIME MANIFEST</text>`
        : spriteBounds(contact, asset);
    const sockets = target.sockets === true ? socketMarkers(contact) : "";
    return `
      <polygon points="${tile}" fill="none" stroke="#65c8ff" stroke-width="1" stroke-opacity="0.35"/>
      <polygon points="${footprint}" fill="none" stroke="#ffd166" stroke-width="2" stroke-opacity="0.95"/>
      ${bounds}
      ${sockets}
      ${crosshair(contact)}
    `;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${content.join("")}
  </svg>`;
}

function targetOrigin(index: number): CellCoord {
  return {
    x: (index % columns) * sheetCellWidth,
    y: Math.floor(index / columns) * sheetCellHeight
  };
}

function contactPoint(origin: CellCoord): CellCoord {
  return {
    x: origin.x + sheetCellWidth / 2,
    y: origin.y + sheetCellHeight - 70
  };
}

function footprintDiamond(center: CellCoord, footprintWidth: number, footprintHeight: number): string {
  const halfWidth = ((footprintWidth + footprintHeight) * TILE_WIDTH) / 4;
  const halfHeight = ((footprintWidth + footprintHeight) * TILE_HEIGHT) / 4;
  return [
    `${center.x},${center.y - halfHeight}`,
    `${center.x + halfWidth},${center.y}`,
    `${center.x},${center.y + halfHeight}`,
    `${center.x - halfWidth},${center.y}`
  ].join(" ");
}

function footprintCenterFromPlacement(contact: CellCoord, target: AlignmentTarget): CellCoord {
  if (target.placement === "center") {
    return contact;
  }

  return {
    x: contact.x,
    y: contact.y - ((target.footprintWidth + target.footprintHeight) * TILE_HEIGHT) / 4
  };
}

function spriteBounds(contact: CellCoord, asset: GeneratedAsset): string {
  const anchor = anchorPixel(asset);
  const left = contact.x - anchor.x;
  const top = contact.y - anchor.y;
  return `<rect x="${left}" y="${top}" width="${asset.width}" height="${asset.height}" fill="none" stroke="#ff4fd8" stroke-width="1.5" stroke-opacity="0.75"/>`;
}

function crosshair(point: CellCoord): string {
  return `<path d="M ${point.x - 8} ${point.y} L ${point.x + 8} ${point.y} M ${point.x} ${point.y - 8} L ${point.x} ${point.y + 8}" stroke="#ff3b30" stroke-width="2"/>`;
}

function socketMarkers(point: CellCoord): string {
  const sockets = [
    { label: "N", x: point.x + 16, y: point.y - 8 },
    { label: "E", x: point.x + 16, y: point.y + 8 },
    { label: "S", x: point.x - 16, y: point.y + 8 },
    { label: "W", x: point.x - 16, y: point.y - 8 }
  ];
  return sockets
    .map(
      (socket) =>
        `<circle cx="${socket.x}" cy="${socket.y}" r="4" fill="#00d1ff" stroke="#111" stroke-width="1"/><text x="${socket.x + 6}" y="${socket.y + 4}" fill="#bdf7ff" font-family="monospace" font-size="10">${socket.label}</text>`
    )
    .join("");
}

function anchorPixel(asset: GeneratedAsset): CellCoord {
  return {
    x: Math.round(asset.anchor.x * asset.width),
    y: Math.round(asset.anchor.y * asset.height)
  };
}

interface AlphaBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

async function measureAlphaBounds(filePath: string): Promise<AlphaBounds | null> {
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

function formatBounds(bounds: AlphaBounds | null): string {
  return bounds === null ? "-" : `${bounds.minX},${bounds.minY}-${bounds.maxX},${bounds.maxY}`;
}

function targetConcern(target: AlignmentTarget, bounds: AlphaBounds | null, anchor: CellCoord): string {
  if (target.concern !== undefined) return target.concern;
  if (bounds === null) return "no visible alpha";
  if (target.placement === "south" && Math.abs(bounds.maxY - anchor.y) > 1) {
    // The anchor maps to a pixel center, so the south vertex only partially
    // covers its last row and antialiasing may leave it under the alpha
    // threshold; one pixel of slack is geometry-true.
    return `bottom alpha differs from south anchor by ${bounds.maxY - anchor.y}px`;
  }
  if (target.sockets === true) {
    // Flat ribbon-style art ends exactly on the anchor line. True-3D art
    // (Blender pipeline) is centered on the tile centerline and its base
    // extends south by up to half the structure thickness; for a 1x1 tile
    // that is at most (0.5 + thickness/2) * 16px, so 12px covers walls up
    // to 0.5 tiles thick. Anything past that indicates a misplaced anchor.
    const overhang = bounds.maxY - anchor.y;
    if (overhang < 0 || overhang > 12) {
      return `connected contact bottom differs from anchor by ${overhang}px`;
    }
  }
  return "none";
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateAlignmentContactSheet()
    .then((outputPath) => {
      console.log(`Wrote ${outputPath}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
