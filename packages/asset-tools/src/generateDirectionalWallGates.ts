import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dir = path.join(root, "assets/source/raster/approved-production/large-directional-wall-gates");
const rawDir = path.join(dir, "raw");
const sourceDir = path.join(dir, "sources");
const masks = Array.from({ length: 16 }, (_, value) => value.toString(2).padStart(4, "0"));

type Entry = {
  id: string;
  file: string;
  canvas: { width: number; height: number };
  anchor: { x: number; y: number };
  footprint: { width: number; height: number };
  mask: string | null;
};

async function chroma(input: string): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += 4) {
    const distance = Math.hypot(
      data[offset] ?? 0,
      (data[offset + 1] ?? 255) - 255,
      data[offset + 2] ?? 0
    );
    data[offset + 3] = Math.max(0, Math.min(255, Math.round((distance - 24) * 3.4)));
  }
  return sharp(data, { raw: info }).trim().png().toBuffer();
}

async function fit(source: Buffer, width: number, height: number, bottomPadding: number): Promise<Buffer> {
  const resized = await sharp(source)
    .resize(width - 4, height - bottomPadding - 4, { fit: "inside", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const metadata = await sharp(resized).metadata();
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{
      input: resized,
      left: Math.round((width - (metadata.width ?? width)) / 2),
      top: height - bottomPadding - (metadata.height ?? height)
    }])
    .png()
    .toBuffer();
}

async function wallMask(base: Buffer, mask: string): Promise<Buffer> {
  if (mask === "0000") return isolatedWall(base);
  const alternate = await sharp(base).flop().png().toBuffer();
  if (mask === "0101") return base;
  if (mask === "1010") return alternate;

  const branches = await Promise.all([
    halfWall(alternate, "right"),
    halfWall(base, "right"),
    halfWall(alternate, "left"),
    halfWall(base, "left")
  ]);
  const composites: sharp.OverlayOptions[] = [];
  for (let index = 0; index < branches.length; index += 1) {
    const input = branches[index];
    if (input !== undefined && mask.charAt(index) === "1") {
      composites.push({ input, left: 0, top: 0 });
    }
  }

  return sharp({ create: { width: 64, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png()
    .toBuffer();
}

async function isolatedWall(source: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const centerX = info.width / 2;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alphaOffset = (y * info.width + x) * 4 + 3;
      const clipAlpha = Math.max(0, Math.min(255, Math.round((11 - Math.abs(x - centerX)) * 64)));
      data[alphaOffset] = Math.min(data[alphaOffset] ?? 0, clipAlpha);
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function halfWall(source: Buffer, side: "left" | "right"): Promise<Buffer> {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const centerX = info.width / 2;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alphaOffset = (y * info.width + x) * 4 + 3;
      const distance = side === "left" ? centerX + 3 - x : x - (centerX - 3);
      const clipAlpha = Math.max(0, Math.min(255, Math.round(distance * 42.5)));
      data[alphaOffset] = Math.min(data[alphaOffset] ?? 0, clipAlpha);
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function gateVariant(
  base: Buffer,
  wall: Buffer,
  width: number,
  height: number,
  firstConnected: boolean,
  secondConnected: boolean
): Promise<Buffer> {
  const shoulderWidth = Math.min(34, Math.floor(width / 5));
  const shoulder = await sharp(wall)
    .extract({ left: 8, top: 28, width: 48, height: 64 })
    .resize(shoulderWidth, Math.min(72, height - 26), { fit: "fill" })
    .png()
    .toBuffer();
  const composites: sharp.OverlayOptions[] = [{ input: base, left: 0, top: 0 }];
  if (firstConnected) composites.push({ input: shoulder, left: 0, top: height - Math.min(72, height - 26) - 8 });
  if (secondConnected) {
    composites.push({
      input: await sharp(shoulder).flop().png().toBuffer(),
      left: width - shoulderWidth,
      top: height - Math.min(72, height - 26) - 8
    });
  }
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png()
    .toBuffer();
}

async function sheet(file: string, files: string[], columns: number, cellWidth: number, cellHeight: number): Promise<void> {
  const rows = Math.ceil(files.length / columns);
  const overlays: sharp.OverlayOptions[] = files.map((name, index) => ({
    input: path.join(dir, name),
    left: (index % columns) * cellWidth + Math.floor((cellWidth - 64) / 2),
    top: Math.floor(index / columns) * cellHeight + 8
  }));
  await sharp({ create: { width: columns * cellWidth, height: rows * cellHeight, channels: 4, background: "#355443" } })
    .composite(overlays)
    .png()
    .toFile(path.join(dir, file));
}

async function labelledWallSheet(): Promise<void> {
  const cellWidth = 112;
  const cellHeight = 132;
  const overlays: sharp.OverlayOptions[] = [];
  for (const [index, mask] of masks.entries()) {
    const label = Buffer.from(
      `<svg width="112" height="24"><text x="56" y="18" text-anchor="middle" font-family="monospace" font-size="16" fill="#ffffff">${mask}</text></svg>`
    );
    overlays.push({
      input: label,
      left: (index % 4) * cellWidth,
      top: Math.floor(index / 4) * cellHeight
    });
    overlays.push({
      input: path.join(dir, `building-wall-plaster-connected-${mask}.png`),
      left: (index % 4) * cellWidth + 24,
      top: Math.floor(index / 4) * cellHeight + 28
    });
  }
  await sharp({
    create: { width: cellWidth * 4, height: cellHeight * 4, channels: 4, background: "#355443" }
  }).composite(overlays).png().toFile(path.join(dir, "wall-mask-labelled-sheet.png"));
}

async function wallRun(file: string, mask: "0101" | "1010", axis: "x" | "y"): Promise<void> {
  const overlays: sharp.OverlayOptions[] = [];
  for (let index = 0; index < 10; index += 1) {
    overlays.push({
      input: path.join(dir, `building-wall-plaster-connected-${mask}.png`),
      left: axis === "x" ? 32 + index * 32 : 320 - index * 32,
      top: 16 + index * 16
    });
  }
  await sharp({ create: { width: 416, height: 272, channels: 4, background: "#55714d" } })
    .composite(overlays)
    .png()
    .toFile(path.join(dir, file));
}

async function createWallCorrectionReviews(gateFiles: string[]): Promise<void> {
  await labelledWallSheet();
  await wallRun("wall-10-cell-nw-se-run.png", "0101", "x");
  await wallRun("wall-10-cell-ne-sw-run.png", "1010", "y");
  await sheet(
    "wall-all-corners.png",
    ["building-wall-plaster-connected-0011.png", "building-wall-plaster-connected-0110.png", "building-wall-plaster-connected-1001.png", "building-wall-plaster-connected-1100.png"],
    4,
    112,
    112
  );
  await sheet(
    "wall-all-t-junctions.png",
    ["building-wall-plaster-connected-0111.png", "building-wall-plaster-connected-1011.png", "building-wall-plaster-connected-1101.png", "building-wall-plaster-connected-1110.png"],
    4,
    112,
    112
  );
  await sheet("wall-cross.png", ["building-wall-plaster-connected-1111.png"], 1, 160, 120);
  await sheet("wall-gate-connections-all-widths.png", gateFiles, 4, 240, 148);
  await sheet(
    "wall-socket-closeups.png",
    ["building-wall-plaster-connected-0001.png", "building-wall-plaster-connected-0100.png", "building-wall-plaster-connected-0010.png", "building-wall-plaster-connected-1000.png"],
    4,
    112,
    112
  );
}

async function build(): Promise<void> {
  await mkdir(sourceDir, { recursive: true });
  const wallRaw = await chroma(path.join(rawDir, "wall.raw.png"));
  await writeFile(path.join(sourceDir, "wall.png"), wallRaw);
  const wall = await fit(wallRaw, 64, 96, 16);
  const entries: Entry[] = [];
  const validations = [];

  const wallBaseFile = "building-wall-plaster.png";
  await writeFile(path.join(dir, wallBaseFile), wall);
  entries.push({
    id: "building.wall.plaster",
    file: wallBaseFile,
    canvas: { width: 64, height: 96 },
    anchor: { x: 32, y: 80 },
    footprint: { width: 1, height: 1 },
    mask: null
  });
  for (const mask of masks) {
    const file = `building-wall-plaster-connected-${mask}.png`;
    await writeFile(path.join(dir, file), await wallMask(wall, mask));
    entries.push({
      id: `building.wall.plaster.connected.${mask}`,
      file,
      canvas: { width: 64, height: 96 },
      anchor: { x: 32, y: 80 },
      footprint: { width: 1, height: 1 },
      mask
    });
  }

  const gateSpecs = [
    { orientation: "nw_se", width: 1, canvasWidth: 96, canvasHeight: 112, footprint: [1, 1], masks: ["0000", "0100", "0001", "0101"] },
    { orientation: "nw_se", width: 2, canvasWidth: 160, canvasHeight: 120, footprint: [2, 1], masks: ["0000", "0100", "0001", "0101"] },
    { orientation: "nw_se", width: 3, canvasWidth: 224, canvasHeight: 128, footprint: [3, 1], masks: ["0000", "0100", "0001", "0101"] },
    { orientation: "ne_sw", width: 1, canvasWidth: 96, canvasHeight: 112, footprint: [1, 1], masks: ["0000", "1000", "0010", "1010"] },
    { orientation: "ne_sw", width: 2, canvasWidth: 160, canvasHeight: 120, footprint: [1, 2], masks: ["0000", "1000", "0010", "1010"] },
    { orientation: "ne_sw", width: 3, canvasWidth: 224, canvasHeight: 128, footprint: [1, 3], masks: ["0000", "1000", "0010", "1010"] }
  ] as const;

  for (const spec of gateSpecs) {
    const source = await chroma(path.join(rawDir, `gate-${spec.orientation.replace("_", "-")}-width${spec.width}.raw.png`));
    await writeFile(path.join(sourceDir, `gate-${spec.orientation}-width${spec.width}.png`), source);
    const base = await fit(source, spec.canvasWidth, spec.canvasHeight, 8);
    for (const mask of spec.masks) {
      const firstConnected = spec.orientation === "nw_se" ? mask[3] === "1" : mask[0] === "1";
      const secondConnected = spec.orientation === "nw_se" ? mask[1] === "1" : mask[2] === "1";
      const rendered = await gateVariant(
        base,
        wall,
        spec.canvasWidth,
        spec.canvasHeight,
        firstConnected,
        secondConnected
      );
      const outputStem = `building-gate-wood-closed-${spec.orientation.replace("_", "-")}-width${spec.width}-connected-${mask}`;
      const file = `${outputStem}.png`;
      await writeFile(path.join(dir, file), rendered);
      entries.push({
        id: `building.gate.wood.closed.${spec.orientation}.width${spec.width}.connected.${mask}`,
        file,
        canvas: { width: spec.canvasWidth, height: spec.canvasHeight },
        anchor: { x: spec.canvasWidth / 2, y: spec.canvasHeight - 8 },
        footprint: { width: spec.footprint[0], height: spec.footprint[1] },
        mask
      });
    }
  }

  for (const entry of entries) {
    const image = sharp(path.join(dir, entry.file));
    const metadata = await image.metadata();
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    validations.push({
      id: entry.id,
      file: entry.file,
      width: metadata.width,
      height: metadata.height,
      sha256: createHash("sha256").update(await readFile(path.join(dir, entry.file))).digest("hex"),
      requestedMask: entry.mask,
      cornerAlpha: [data[3], data[(info.width - 1) * 4 + 3], data[(info.height - 1) * info.width * 4 + 3], data[(info.width * info.height - 1) * 4 + 3]]
    });
  }

  await sheet("wall-all-masks.png", masks.map((mask) => `building-wall-plaster-connected-${mask}.png`), 4, 92, 112);
  await sheet("wall-scale-comparison.png", ["building-wall-plaster.png"], 1, 160, 120);
  const nwFiles = entries.filter((entry) => entry.id.includes(".nw_se.")).map((entry) => entry.file);
  const neFiles = entries.filter((entry) => entry.id.includes(".ne_sw.")).map((entry) => entry.file);
  await sheet("gate-nw-se-all-widths.png", nwFiles, 4, 240, 148);
  await sheet("gate-ne-sw-all-widths.png", neFiles, 4, 240, 148);
  await sheet("gate-all-connection-states.png", [...nwFiles, ...neFiles], 4, 240, 148);
  await sheet("gate-wall-long-runs.png", [...nwFiles, ...neFiles], 4, 240, 148);
  await sheet("gate-wall-endpoint-closeups.png", [...nwFiles.slice(0, 4), ...neFiles.slice(0, 4)], 4, 140, 132);
  await sheet("runtime-composite.png", [...nwFiles.slice(-4), ...neFiles.slice(-4)], 4, 240, 148);
  await createWallCorrectionReviews([...nwFiles, ...neFiles]);
  await writeFile(path.join(dir, "asset-map.json"), `${JSON.stringify(entries, null, 2)}\n`);
  await writeFile(path.join(dir, "validation-summary.json"), `${JSON.stringify(validations, null, 2)}\n`);
}

await build();
