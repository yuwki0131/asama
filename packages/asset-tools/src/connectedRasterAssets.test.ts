import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./paths";

const wallDirectory = join(
  repoRoot,
  "assets/source/raster/approved-production/large-directional-wall-gates"
);

async function wallAsset(mask: string): Promise<Buffer> {
  return readFile(join(wallDirectory, `building-wall-plaster-connected-${mask}.png`));
}

describe("production connected wall raster assets", () => {
  it("uses a distinct raster for every connection mask", async () => {
    const masks = Array.from({ length: 16 }, (_, value) => value.toString(2).padStart(4, "0"));
    const images = await Promise.all(masks.map(wallAsset));
    const uniqueImages = new Set(images.map((image) => image.toString("base64")));

    expect(uniqueImages.size).toBe(masks.length);
  });

  it("keeps opposite ends and straight runs as distinct images", async () => {
    const masks = ["0001", "0100", "0101", "0010", "1000", "1010"];
    const images = await Promise.all(masks.map(wallAsset));
    const uniqueImages = new Set(images.map((image) => image.toString("base64")));

    expect(uniqueImages.size).toBe(masks.length);
  });

  it("does not reuse one raster for corners, T junctions, and crosses", async () => {
    const masks = ["0011", "0110", "1001", "1100", "0111", "1011", "1101", "1110", "1111"];
    const images = await Promise.all(masks.map(wallAsset));
    const uniqueImages = new Set(images.map((image) => image.toString("base64")));

    expect(uniqueImages.size).toBe(masks.length);
  });
});
