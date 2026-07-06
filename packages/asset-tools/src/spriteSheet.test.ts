import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { composeSpriteSheet, sheetDimensions } from "./spriteSheet";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sprite-sheet-test-"));
  tempDirs.push(dir);
  return dir;
}

async function writeSolidPng(path: string, width: number, height: number, rgba: [number, number, number, number]): Promise<void> {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] / 255 }
    }
  })
    .png()
    .toFile(path);
}

describe("sheetDimensions", () => {
  it("computes columns*frameWidth x rows*frameHeight", () => {
    expect(sheetDimensions(8, 8, 48, 64)).toEqual({ width: 384, height: 512, rows: 8, columns: 8 });
    expect(sheetDimensions(8, 3, 48, 64)).toEqual({ width: 144, height: 512, rows: 8, columns: 3 });
  });

  it("rejects non-positive or non-integer inputs", () => {
    expect(() => sheetDimensions(0, 8, 48, 64)).toThrow();
    expect(() => sheetDimensions(8, -1, 48, 64)).toThrow();
    expect(() => sheetDimensions(8, 8, 48.5, 64)).toThrow();
    expect(() => sheetDimensions(8, 8, 48, 0)).toThrow();
  });
});

describe("composeSpriteSheet", () => {
  it("places frames in a row-major grid (columns=frames, rows=directions)", async () => {
    const dir = await makeTempDir();
    // 2 directions x 3 frames; sources are 2x supersampled (8x12 -> 4x6).
    const colors: [number, number, number, number][][] = [
      [
        [255, 0, 0, 255],
        [0, 255, 0, 255],
        [0, 0, 255, 255]
      ],
      [
        [255, 255, 0, 255],
        [0, 255, 255, 255],
        [255, 0, 255, 255]
      ]
    ];
    const framePaths: string[][] = [];
    for (let row = 0; row < 2; row += 1) {
      const rowPaths: string[] = [];
      for (let column = 0; column < 3; column += 1) {
        const path = join(dir, `frame-${row}-${column}.png`);
        await writeSolidPng(path, 8, 12, colors[row]![column]!);
        rowPaths.push(path);
      }
      framePaths.push(rowPaths);
    }

    const sheet = await composeSpriteSheet({ framePaths, frameWidth: 4, frameHeight: 6 });
    const { data, info } = await sharp(sheet).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(12);
    expect(info.height).toBe(12);

    const sample = (x: number, y: number): [number, number, number, number] => {
      const offset = (y * info.width + x) * 4;
      return [data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!];
    };
    // Cell centers: (col*4+2, row*6+3).
    expect(sample(2, 3)).toEqual([255, 0, 0, 255]);
    expect(sample(6, 3)).toEqual([0, 255, 0, 255]);
    expect(sample(10, 3)).toEqual([0, 0, 255, 255]);
    expect(sample(2, 9)).toEqual([255, 255, 0, 255]);
    expect(sample(6, 9)).toEqual([0, 255, 255, 255]);
    expect(sample(10, 9)).toEqual([255, 0, 255, 255]);
  });

  it("keeps fully transparent frames transparent", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "transparent.png");
    await writeSolidPng(path, 4, 6, [0, 0, 0, 0]);
    const sheet = await composeSpriteSheet({ framePaths: [[path]], frameWidth: 4, frameHeight: 6 });
    const { data } = await sharp(sheet).raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) {
      expect(data[i]).toBe(0);
    }
  });

  it("applies per-cell sharpening without changing dimensions", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "solid.png");
    await writeSolidPng(path, 8, 12, [120, 130, 140, 255]);
    const sheet = await composeSpriteSheet({
      framePaths: [[path, path]],
      frameWidth: 4,
      frameHeight: 6,
      sharpenSigma: 0.45
    });
    const metadata = await sharp(sheet).metadata();
    expect(metadata.width).toBe(8);
    expect(metadata.height).toBe(6);
  });

  it("rejects ragged frame grids", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "cell.png");
    await writeSolidPng(path, 4, 6, [1, 2, 3, 255]);
    await expect(
      composeSpriteSheet({ framePaths: [[path, path], [path]], frameWidth: 4, frameHeight: 6 })
    ).rejects.toThrow(/same number of frames/);
  });

  it("rejects empty grids", async () => {
    await expect(composeSpriteSheet({ framePaths: [], frameWidth: 4, frameHeight: 6 })).rejects.toThrow();
    await expect(composeSpriteSheet({ framePaths: [[]], frameWidth: 4, frameHeight: 6 })).rejects.toThrow();
  });
});
