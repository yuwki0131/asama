/**
 * Review images for the P4c elevation tiles (docs/10_development/elevation-contract.md):
 *
 * 1. elevation-tiles-contact-sheet.png — every elevation tile at 3x with labels.
 * 2. elevation-kuruwa-mock.png — hand-composited two-level kuruwa (rock hill
 *    at level 1 + ishigaki compound at level 2, dirt cutting and stone stairs,
 *    tenshu on top) following the P4b draw rules: terrain pass in (x+y) order,
 *    per cell "cliff faces -> surface tile", screenY -= elevation * 40.
 *
 * Outputs go to assets/intermediate/spike/. Run:
 *   pnpm --filter @asama/asset-tools assets:elevation:contact-sheet
 */
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { generatedManifestPath, generatedOutputDir, intermediateAssetsDir, publicAssetsDir } from "./paths";
import type { GeneratedAsset } from "./types";

const ELEVATION_PX = 40;
const TILE_W = 64;
const TILE_H = 32;

interface ManifestIndex {
  readonly byId: ReadonlyMap<string, GeneratedAsset>;
}

async function loadManifest(): Promise<ManifestIndex> {
  const manifest = JSON.parse(await readFile(generatedManifestPath, "utf8")) as {
    assets: GeneratedAsset[];
  };
  return { byId: new Map(manifest.assets.map((asset) => [asset.assetId, asset])) };
}

function assetPng(asset: GeneratedAsset): string {
  return join(publicAssetsDir, asset.file);
}

async function buildContactSheet(index: ManifestIndex, outputPath: string): Promise<void> {
  const groups: readonly (readonly string[])[] = [
    [1, 2, 3].flatMap((h) => [`terrain.cliff.face.s.h${h}`, `terrain.cliff.face.e.h${h}`, `terrain.cliff.corner.se.h${h}`]),
    [1, 2, 3].flatMap((h) => [`terrain.ishigaki.face.s.h${h}`, `terrain.ishigaki.face.e.h${h}`, `terrain.ishigaki.corner.se.h${h}`]),
    ["n", "e", "s", "w"].map((d) => `terrain.slope.dirt.${d}`),
    ["n.side.e", "s.side.e", "e.side.s", "w.side.s"].map((s) => `terrain.slope.dirt.${s}`),
    ["n", "e", "s", "w"].map((d) => `terrain.slope.ishigaki.${d}`),
    ["n.side.e", "s.side.e", "e.side.s", "w.side.s"].map((s) => `terrain.slope.ishigaki.${s}`)
  ];

  const scale = 3;
  const cellW = 70 * scale;
  const cellH = 116 * scale;
  const labelH = 16;
  const cols = Math.max(...groups.map((group) => group.length));
  const width = cols * cellW + 20;
  const height = groups.length * (cellH + labelH) + 20;

  const composites: sharp.OverlayOptions[] = [];
  const labels: string[] = [];
  for (const [row, group] of groups.entries()) {
    for (const [col, assetId] of group.entries()) {
      const asset = index.byId.get(assetId);
      if (asset === undefined) {
        throw new Error(`Missing manifest entry: ${assetId}`);
      }
      const buffer = await sharp(assetPng(asset))
        .resize({ width: asset.width * scale, kernel: "nearest" })
        .png()
        .toBuffer();
      const left = 10 + col * cellW;
      const top = 10 + row * (cellH + labelH);
      composites.push({ input: buffer, left, top });
      labels.push(
        `<text x="${left}" y="${top + cellH + 11}" font-family="monospace" font-size="11" fill="#e8e4da">${assetId}</text>`
      );
    }
  }
  composites.push({
    input: Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${labels.join("")}</svg>`
    ),
    left: 0,
    top: 0
  });

  await sharp({
    create: { width, height, channels: 4, background: { r: 58, g: 60, b: 68, alpha: 255 } }
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

// --- kuruwa mock -------------------------------------------------------------

type Toward = "n" | "e" | "s" | "w";

interface Cell {
  elevation: number;
  slope: Toward | null;
  skin: "cliff" | "ishigaki";
  slopeSkin: "dirt" | "ishigaki";
  surface: "grass" | "dirt";
}

const SIZE = 20;

function cellAt(map: Cell[][], x: number, y: number): Cell {
  const cell = map[y]?.[x];
  if (cell === undefined) {
    throw new Error(`Mock map cell out of bounds: ${x},${y}`);
  }
  return cell;
}

function buildMockMap(): Cell[][] {
  const map: Cell[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({
      elevation: 0,
      slope: null as Toward | null,
      skin: "cliff" as const,
      slopeSkin: "dirt" as const,
      surface: "grass" as const
    }))
  );
  const patch = (x0: number, y0: number, x1: number, y1: number, level: number, skin: Cell["skin"]) => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cell = cellAt(map, x, y);
        cell.elevation = Math.max(cell.elevation, level);
        cell.skin = skin;
      }
    }
  };
  patch(2, 2, 13, 15, 1, "cliff"); // natural hill
  patch(4, 4, 14, 13, 2, "ishigaki"); // stone-revetted kuruwa (east wing drops h2)
  for (let y = 4; y <= 13; y += 1) {
    for (let x = 4; x <= 14; x += 1) {
      cellAt(map, x, y).surface = "dirt";
    }
  }
  // Stone stairway 1 -> 2, width 2 (drawn as slope cells on the LOW side).
  for (const x of [8, 9]) {
    const cell = cellAt(map, x, 14);
    cell.slope = "n";
    cell.slopeSkin = "ishigaki";
  }
  // Dirt cutting 0 -> 1, width 2.
  for (const x of [8, 9]) {
    const cell = cellAt(map, x, 16);
    cell.slope = "n";
    cell.slopeSkin = "dirt";
  }
  return map;
}

const DIRS: Record<Toward, readonly [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0]
};

function edgeHeight(cell: Cell, dir: Toward): number {
  if (cell.slope === null) {
    return cell.elevation;
  }
  if (dir === cell.slope) {
    return cell.elevation + 1;
  }
  const opposite: Record<Toward, Toward> = { n: "s", s: "n", e: "w", w: "e" };
  if (dir === opposite[cell.slope]) {
    return cell.elevation;
  }
  return cell.elevation; // side edges: cliffs, handled by slope side tiles
}

async function buildKuruwaMock(index: ManifestIndex, outputPath: string): Promise<void> {
  const map = buildMockMap();
  const originX = 672;
  const originY = 170;
  const width = 1344;
  const height = 880;

  const cache = new Map<string, Buffer>();
  const sprite = async (assetId: string): Promise<{ buffer: Buffer; asset: GeneratedAsset }> => {
    const asset = index.byId.get(assetId);
    if (asset === undefined) {
      throw new Error(`Missing manifest entry: ${assetId}`);
    }
    let buffer = cache.get(assetId);
    if (buffer === undefined) {
      buffer = await readFile(assetPng(asset));
      cache.set(assetId, buffer);
    }
    return { buffer, asset };
  };

  const composites: sharp.OverlayOptions[] = [];
  const place = async (assetId: string, mapX: number, mapY: number, elevation: number) => {
    const { buffer, asset } = await sprite(assetId);
    const screenX = originX + (mapX - mapY) * (TILE_W / 2);
    const screenY = originY + (mapX + mapY) * (TILE_H / 2) - elevation * ELEVATION_PX;
    composites.push({
      input: buffer,
      left: Math.round(screenX - asset.anchor.x * asset.width),
      top: Math.round(screenY - asset.anchor.y * asset.height)
    });
  };

  // Terrain pass: (x+y) ascending; per cell cliff faces first, then surface.
  const cells: Array<readonly [number, number]> = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      cells.push([x, y]);
    }
  }
  cells.sort(([ax, ay], [bx, by]) => ax + ay - (bx + by));

  for (const [x, y] of cells) {
    const cell = cellAt(map, x, y);
    if (cell.slope !== null) {
      // Slope side wedges (this mock only exposes the E sides of N ramps).
      const [ex, ey] = DIRS.e;
      const east = map[y + ey]?.[x + ex];
      if (east !== undefined && east.slope === null && east.elevation <= cell.elevation) {
        await place(`terrain.slope.${cell.slopeSkin}.${cell.slope}.side.e`, x, y, cell.elevation);
      }
      await place(`terrain.slope.${cell.slopeSkin}.${cell.slope}`, x, y, cell.elevation);
      continue;
    }
    // Cliff faces owned by this (high) cell: S and E edges only.
    const drop = (dir: Toward): number => {
      const [dx, dy] = DIRS[dir];
      const neighbor = map[y + dy]?.[x + dx];
      if (neighbor === undefined) {
        return 0;
      }
      const opposite: Record<Toward, Toward> = { n: "s", s: "n", e: "w", w: "e" };
      return Math.max(0, edgeHeight(cell, dir) - edgeHeight(neighbor, opposite[dir]));
    };
    const dropS = drop("s");
    const dropE = drop("e");
    if (dropS > 0 && dropE > 0 && dropS === dropE) {
      await place(`terrain.${cell.skin}.corner.se.h${dropS}`, x, y, cell.elevation);
    } else {
      if (dropS > 0) {
        await place(`terrain.${cell.skin}.face.s.h${dropS}`, x, y, cell.elevation);
      }
      if (dropE > 0) {
        await place(`terrain.${cell.skin}.face.e.h${dropE}`, x, y, cell.elevation);
      }
    }
    await place(`terrain.${cell.surface}.base`, x, y, cell.elevation);
  }

  // Entity pass: y-sorted, Y offset only (tenshu on the kuruwa, pines below).
  await place("deco.tree.pine.1", 3, 14, map[14]?.[3]?.elevation ?? 0);
  await place("building.tenshu.main", 11.5, 11.5, 2);
  await place("deco.tree.pine.2", 2, 17, 0);

  await sharp({
    create: { width, height, channels: 4, background: { r: 46, g: 50, b: 58, alpha: 255 } }
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

async function main(): Promise<void> {
  const index = await loadManifest();
  const spikeDir = join(intermediateAssetsDir, "spike");
  await mkdir(spikeDir, { recursive: true });
  const contactSheet = join(spikeDir, "elevation-tiles-contact-sheet.png");
  const mock = join(spikeDir, "elevation-kuruwa-mock.png");
  await buildContactSheet(index, contactSheet);
  await buildKuruwaMock(index, mock);
  console.log(`Wrote ${contactSheet}`);
  console.log(`Wrote ${mock}`);
  console.log(`(generated tiles read from ${generatedOutputDir})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
