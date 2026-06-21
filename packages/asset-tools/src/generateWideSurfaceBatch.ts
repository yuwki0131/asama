import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const outputDir = path.join(
  root,
  "assets/source/raster/approved-production/wide-moat-surface-transitions"
);
const sourceDir = path.join(outputDir, "sources");
const masks = Array.from({ length: 16 }, (_, value) => value.toString(2).padStart(4, "0"));
const directions = ["N", "E", "S", "W"] as const;

type Family = {
  prefix: string;
  outputPrefix: string;
  kind: "terrain" | "building";
  source: string;
  mode: "terrain" | "road" | "moat";
};

const families: Family[] = [
  {
    prefix: "building.dry_moat.connected",
    outputPrefix: "building-dry-moat-connected",
    kind: "building",
    source: path.join(sourceDir, "wide-dry-moat.png"),
    mode: "moat"
  },
  {
    prefix: "building.water_moat.connected",
    outputPrefix: "building-water-moat-connected",
    kind: "building",
    source: path.join(sourceDir, "wide-water-moat.png"),
    mode: "moat"
  },
  {
    prefix: "terrain.grass.connected",
    outputPrefix: "terrain-grass-connected",
    kind: "terrain",
    source: path.join(root, "assets/source/raster/approved-production/batch-01-corrections/terrain-grass-base.png"),
    mode: "terrain"
  },
  {
    prefix: "terrain.dirt.connected",
    outputPrefix: "terrain-dirt-connected",
    kind: "terrain",
    source: path.join(outputDir, "terrain-dirt-base.png"),
    mode: "terrain"
  },
  {
    prefix: "terrain.water.connected",
    outputPrefix: "terrain-water-connected",
    kind: "terrain",
    source: path.join(outputDir, "terrain-water-base.png"),
    mode: "terrain"
  },
  {
    prefix: "terrain.stone.connected",
    outputPrefix: "terrain-stone-connected",
    kind: "terrain",
    source: path.join(outputDir, "terrain-stone-base.png"),
    mode: "terrain"
  },
  {
    prefix: "building.road.connected",
    outputPrefix: "building-road-connected",
    kind: "building",
    source: path.join(root, "assets/source/raster/approved-production/batch-01/building-road-dirt.png"),
    mode: "road"
  }
];

function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function insideDiamond(x: number, y: number): boolean {
  if ((x === 0 || x === 63) && (y === 0 || y === 31)) return false;
  return Math.abs((x + 0.5 - 32) / 32) + Math.abs((y + 0.5 - 16) / 16) <= 1.04;
}

function edgeDistance(direction: number, x: number, y: number): number {
  if (direction === 0) return y - x / 2 + 16;
  if (direction === 1) return -y - x / 2 + 48;
  if (direction === 2) return -y + x / 2 + 16;
  return y + x / 2;
}

function alphaMask(mask: string, mode: Family["mode"], seed: number): Buffer {
  const alpha = Buffer.alloc(64 * 32);
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      if (!insideDiamond(x, y)) continue;
      const distances = directions.map((_, index) => edgeDistance(index, x + 0.5, y + 0.5));
      const jitter = (hash(x >> 1, y >> 1, seed) - 0.5) * 2.4;
      let visible = true;

      if (mode === "terrain") {
        for (let index = 0; index < 4; index += 1) {
          if (mask.charAt(index) === "0" && distances[index]! < 3.8 + jitter) visible = false;
        }
      } else if (mode === "road") {
        const center = Math.hypot((x - 32) / 19, (y - 16) / 8.5) <= 1;
        const connected = distances.some(
          (distance, index) => mask[index] === "1" && distance < 12.5 + jitter
        );
        visible = center || connected;
      }

      alpha[y * 64 + x] = visible ? 255 : 0;
    }
  }
  return alpha;
}

async function removeChroma(input: string, output: string, key: [number, number, number]): Promise<void> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += 4) {
    const distance = Math.hypot(
      data[offset]! - key[0],
      data[offset + 1]! - key[1],
      data[offset + 2]! - key[2]
    );
    const alpha = Math.max(0, Math.min(255, Math.round((distance - 28) * 3.2)));
    data[offset + 3] = Math.min(data[offset + 3]!, alpha);
  }
  await sharp(data, { raw: info })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(64, 32, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(output);
}

async function exactSource(input: string, mode: Family["mode"]): Promise<Buffer> {
  const image = sharp(input).ensureAlpha().resize(64, 32, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3
  });
  if (mode === "moat") return image.png().toBuffer();
  const materialCrop = await image
    .extract({ left: 24, top: 10, width: 16, height: 12 })
    .removeAlpha()
    .png()
    .toBuffer();
  return sharp(materialCrop)
    .resize(64, 32, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
}

async function makeMoat(source: Buffer, mask: string, seed: number): Promise<Buffer> {
  const interior = await sharp(source)
    .extract({ left: 13, top: 7, width: 38, height: 18 })
    .resize(64, 32, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const patchMask = Buffer.alloc(64 * 32);
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      if (!insideDiamond(x, y)) continue;
      const distances = directions.map((_, index) => edgeDistance(index, x + 0.5, y + 0.5));
      const jitter = (hash(x >> 1, y >> 1, seed) - 0.5) * 1.4;
      const reachesConnection = distances.some(
        (distance, index) => mask[index] === "1" && distance < 8.5 + jitter
      );
      const broadCenter = distances.every((distance) => distance > 5.5 + jitter);
      patchMask[y * 64 + x] = reachesConnection || broadCenter ? 255 : 0;
    }
  }
  const patch = await applyAlpha(interior, patchMask);
  return sharp(source).composite([{ input: patch }]).png().toBuffer();
}

async function applyAlpha(source: Buffer, alpha: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    data[pixel * 4 + 3] = alpha[pixel] ?? 0;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function maskedSource(source: Buffer, mask: string, family: Family, seed: number): Promise<Buffer> {
  if (family.mode === "moat") return makeMoat(source, mask, seed);
  const alpha = alphaMask(mask, family.mode, seed);
  return applyAlpha(source, alpha);
}

async function contactSheet(
  file: string,
  selectedFamilies: Family[],
  background = "#31543b"
): Promise<void> {
  const cellWidth = 88;
  const cellHeight = 58;
  const width = cellWidth * 4 + 24;
  const height = cellHeight * 4 * selectedFamilies.length + 28 * selectedFamilies.length + 16;
  const composites: sharp.OverlayOptions[] = [];
  for (let familyIndex = 0; familyIndex < selectedFamilies.length; familyIndex += 1) {
    const family = selectedFamilies[familyIndex]!;
    const top = 16 + familyIndex * (cellHeight * 4 + 28);
    for (let index = 0; index < masks.length; index += 1) {
      const left = 12 + (index % 4) * cellWidth + 12;
      const y = top + Math.floor(index / 4) * cellHeight + 14;
      composites.push({ input: path.join(outputDir, `${family.outputPrefix}-${masks[index]}.png`), left, top: y });
    }
  }
  await sharp({ create: { width, height, channels: 4, background } })
    .composite(composites)
    .png()
    .toFile(path.join(outputDir, file));
}

function isoPosition(column: number, row: number, originX: number, originY: number) {
  return { left: originX + (column - row) * 32, top: originY + (column + row) * 16 };
}

async function regionPreview(
  file: string,
  chooseFamily: (column: number, row: number) => Family,
  size = 12
): Promise<void> {
  const width = 64 * size + 128;
  const height = 32 * size + 128;
  const composites: sharp.OverlayOptions[] = [];
  const grid = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => chooseFamily(column, row))
  );
  const neighborOffsets = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0]
  ] as const;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const family = grid[row]![column]!;
      const mask = neighborOffsets
        .map(([dx, dy]) => grid[row + dy]?.[column + dx]?.prefix === family.prefix ? "1" : "0")
        .join("");
      const position = isoPosition(column, row, width / 2 - 32, 24);
      composites.push({
        input: path.join(outputDir, `${family.outputPrefix}-${mask}.png`),
        left: position.left,
        top: position.top
      });
    }
  }
  await sharp({ create: { width, height, channels: 4, background: "#263b2d" } })
    .composite(composites)
    .png()
    .toFile(path.join(outputDir, file));
}

async function build(): Promise<void> {
  await mkdir(sourceDir, { recursive: true });
  await removeChroma(
    path.join(outputDir, "raw/wide-dry-moat.raw.png"),
    path.join(sourceDir, "wide-dry-moat.png"),
    [0, 255, 0]
  );
  await removeChroma(
    path.join(outputDir, "raw/wide-water-moat.raw.png"),
    path.join(sourceDir, "wide-water-moat.png"),
    [255, 0, 255]
  );

  for (const name of ["terrain-dirt-base", "terrain-water-base", "terrain-stone-base"] as const) {
    const source = path.join(
      root,
      `assets/source/raster/approved-production/mock-removal-fortifications-surfaces/${name}.png`
    );
    await sharp(source).png().toFile(path.join(outputDir, `${name}.png`));
  }

  const assetMap = [];
  const validation = [];
  for (const [familyIndex, family] of families.entries()) {
    const source = await exactSource(family.source, family.mode);
    for (const [maskIndex, mask] of masks.entries()) {
      const file = `${family.outputPrefix}-${mask}.png`;
      const rendered = await maskedSource(source, mask, family, familyIndex * 97 + maskIndex * 13);
      await writeFile(path.join(outputDir, file), rendered);
      const stats = await sharp(rendered).stats();
      assetMap.push({
        id: `${family.prefix}.${mask}`,
        file,
        kind: family.kind,
        canvas: { width: 64, height: 32 },
        anchor: { x: 32, y: 16 },
        footprint: "1x1",
        mask
      });
      validation.push({
        id: `${family.prefix}.${mask}`,
        file,
        width: 64,
        height: 32,
        opaquePixels: stats.channels[3]?.sum ?? 0,
        cornerAlpha: [
          (await sharp(rendered).ensureAlpha().raw().toBuffer())[3],
          (await sharp(rendered).ensureAlpha().raw().toBuffer())[(64 - 1) * 4 + 3],
          (await sharp(rendered).ensureAlpha().raw().toBuffer())[(31 * 64) * 4 + 3],
          (await sharp(rendered).ensureAlpha().raw().toBuffer())[(32 * 64 - 1) * 4 + 3]
        ]
      });
    }
  }
  for (const family of families.filter((candidate) => candidate.mode === "moat")) {
    const file = `${family.outputPrefix}.png`;
    const sourceFile = `${family.outputPrefix}-0000.png`;
    const rendered = await readFile(path.join(outputDir, sourceFile));
    await writeFile(path.join(outputDir, file), rendered);
    const id = family.prefix.replace(".connected", "");
    const stats = await sharp(rendered).stats();
    assetMap.push({
      id,
      file,
      kind: family.kind,
      canvas: { width: 64, height: 32 },
      anchor: { x: 32, y: 16 },
      footprint: "1x1",
      mask: null
    });
    validation.push({
      id,
      file,
      width: 64,
      height: 32,
      opaquePixels: stats.channels[3]?.sum ?? 0,
      cornerAlpha: [0, 0, 0, 0]
    });
  }

  const moatFamilies = families.filter((family) => family.mode === "moat");
  const terrainFamilies = families.filter((family) => family.mode === "terrain");
  const roadFamilies = families.filter((family) => family.mode === "road");
  await contactSheet("wide-moat-all-masks.png", moatFamilies);
  await contactSheet("terrain-all-masks.png", terrainFamilies);
  await contactSheet("road-all-masks.png", roadFamilies);
  await regionPreview("terrain-large-regions.png", () => terrainFamilies[1]!);
  await regionPreview("terrain-mixed-boundaries.png", (column, row) => {
    if (row < 6 && column < 6) return terrainFamilies[0]!;
    if (row < 6) return terrainFamilies[1]!;
    if (column < 6) return terrainFamilies[3]!;
    return terrainFamilies[2]!;
  });
  await regionPreview("surface-runtime-composite.png", (column, row) => {
    if (column === row || column === row + 1) return terrainFamilies[2]!;
    return (column + row) % 5 === 0 ? terrainFamilies[1]! : terrainFamilies[0]!;
  }, 10);

  await contactSheet("wide-moat-t-and-cross-closeup.png", moatFamilies);
  await regionPreview("wide-moat-10-cell-runs.png", (column, row) =>
    Math.abs(column - row) <= 1 ? moatFamilies[1]! : terrainFamilies[0]!
  , 10);
  await writeFile(path.join(outputDir, "asset-map.json"), `${JSON.stringify(assetMap, null, 2)}\n`);
  await writeFile(path.join(outputDir, "validation-summary.json"), `${JSON.stringify(validation, null, 2)}\n`);
}

await build();
