import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildBlenderCommand } from "./blenderAdapter";
import { buildAtlas } from "./productionPipeline";
import { parseProductionAsset } from "./productionConfig";
import { importRasterAsset, validateRasterImportSpec } from "./postprocess";
import { renderPlaceholderSvg } from "./templates";
import type { BlenderRenderSpec } from "./types";

describe("production asset schema", () => {
  it("validates source types and separates footprint from canvas", () => {
    const asset = parseProductionAsset(
      {
        assetId: "building.yagura.small.normal",
        kind: "building",
        output: "building-yagura-small-normal.png",
        source: {
          type: "blender",
          scene: "assets/source/blender/scenes/yagura-small.blend",
          collection: "YaguraSmall",
          renderSpec: "iso-building-default"
        },
        geometry: {
          footprintWidth: 2,
          footprintHeight: 2,
          canvasWidth: 192,
          canvasHeight: 176,
          anchorX: 96,
          anchorY: 156
        },
        variants: ["normal"]
      },
      0
    );

    expect(asset.source.type).toBe("blender");
    expect(asset.geometry.footprintWidth).toBe(2);
    expect(asset.geometry.canvasWidth).toBe(192);
  });

  it("rejects unknown source types and invalid anchors", () => {
    expect(() =>
      parseProductionAsset(
        {
          assetId: "bad.asset",
          kind: "building",
          output: "bad.png",
          source: { type: "unknown" },
          geometry: {
            footprintWidth: 1,
            footprintHeight: 1,
            canvasWidth: 64,
            canvasHeight: 32,
            anchorX: 80,
            anchorY: 16
          }
        },
        0
      )
    ).toThrow(/Unknown/);
  });
});

describe("placeholder compatibility", () => {
  it("keeps procedural SVG rendering available for debug assets", () => {
    const svg = renderPlaceholderSvg({
      assetId: "overlay.cell.hover",
      kind: "overlay",
      output: "overlay-cell-hover.png",
      width: 64,
      height: 32,
      fill: "#d7f0ff",
      stroke: "#9bd8ff",
      pattern: "hover",
      anchor: { x: 0.5, y: 0.5 }
    });

    expect(svg).toContain("<svg");
    expect(svg).toContain("width=\"64\"");
  });
});

describe("raster import", () => {
  it("imports a transparent PNG into the requested canvas deterministically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asama-raster-"));
    try {
      const sourceFile = join(dir, "source.png");
      const outputFile = join(dir, "output.png");
      await sharp({
        create: {
          width: 12,
          height: 12,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite([
          {
            input: Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect x="3" y="2" width="6" height="8" fill="#8a5f35"/></svg>'
            ),
            left: 0,
            top: 0
          }
        ])
        .png()
        .toFile(sourceFile);

      const spec = {
        sourceFile,
        outputFile,
        canvasWidth: 64,
        canvasHeight: 32,
        anchorX: 32,
        anchorY: 16,
        trim: true,
        resizeMode: "contain" as const,
        category: "building" as const
      };

      await importRasterAsset(spec);
      const first = await readFile(outputFile);
      await importRasterAsset(spec);
      const second = await readFile(outputFile);
      const metadata = await sharp(outputFile).metadata();

      expect(metadata.width).toBe(64);
      expect(metadata.height).toBe(32);
      expect(metadata.hasAlpha).toBe(true);
      expect(first.equals(second)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid input paths and invalid canvas settings", async () => {
    expect(() =>
      validateRasterImportSpec({
        sourceFile: "missing.png",
        outputFile: "out.png",
        canvasWidth: 0,
        canvasHeight: 32,
        anchorX: 0,
        anchorY: 0,
        trim: true,
        resizeMode: "contain",
        category: "terrain"
      })
    ).toThrow(/canvasWidth/);

    await expect(
      importRasterAsset({
        sourceFile: "missing.png",
        outputFile: "out.png",
        canvasWidth: 64,
        canvasHeight: 32,
        anchorX: 32,
        anchorY: 16,
        trim: true,
        resizeMode: "contain",
        category: "terrain"
      })
    ).rejects.toThrow();
  });
});

describe("Blender adapter and atlas", () => {
  it("builds a headless Blender command without executing Blender", () => {
    const spec: BlenderRenderSpec = {
      scene: "assets/source/blender/scenes/yagura.blend",
      collection: "YaguraSmall",
      camera: "IsoCameraNE",
      outputDirectory: "assets/intermediate/raw-renders",
      resolution: { width: 192, height: 176 },
      transparentBackground: true,
      frame: 1,
      direction: "ne",
      renderSeed: 42,
      renderSpec: "iso-building-default"
    };

    expect(buildBlenderCommand(spec, "assets/source/blender/scripts/render_asset.py")).toEqual([
      "blender",
      "--background",
      "assets/source/blender/scenes/yagura.blend",
      "--python",
      "assets/source/blender/scripts/render_asset.py",
      "--",
      "--render-spec",
      "iso-building-default",
      "--output-directory",
      "assets/intermediate/raw-renders",
      "--resolution",
      "192x176",
      "--transparent-background",
      "true",
      "--collection",
      "YaguraSmall",
      "--camera",
      "IsoCameraNE",
      "--frame",
      "1",
      "--direction",
      "ne",
      "--render-seed",
      "42"
    ]);
  });

  it("rejects negative atlas padding", async () => {
    await expect(buildAtlas({ padding: -1 })).rejects.toThrow(/padding/);
  });
});
