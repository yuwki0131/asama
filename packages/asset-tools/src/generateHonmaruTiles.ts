/**
 * Generates the honmaru courtyard tile family
 * (building.honmaru.tile.connected.NESW) directly into
 * public/assets/generated and merges the entries into the generated manifest.
 *
 * Mask semantics differ from the wall/fence families: each bit says whether
 * the neighbouring cell in that direction is *inside the honmaru footprint*.
 * A 0-bit is a lot boundary and receives a low stone curb along that diamond
 * edge; 1111 is the plain interior courtyard.
 *
 * Standalone (like generateDirectionalWallGates) because the full
 * generateGeneratedAssets run would overwrite production raster art living in
 * the same output directory.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { generatedManifestPath, generatedOutputDir } from "./paths";
import type { AssetManifest, GeneratedAsset } from "./types";

interface Point {
  readonly x: number;
  readonly y: number;
}

const MASKS: readonly string[] = Array.from({ length: 16 }, (_, value) => value.toString(2).padStart(4, "0"));

// Full-size cell diamond (no 1px inset, no outline stroke): the courtyard
// tiles the footprint seamlessly, so any per-tile border would read as a grid.
const CENTER: Point = { x: 32, y: 16 };
const VERTEX_N: Point = { x: 32, y: 0 };
const VERTEX_E: Point = { x: 64, y: 16 };
const VERTEX_S: Point = { x: 32, y: 32 };
const VERTEX_W: Point = { x: 0, y: 16 };
const DIAMOND = `${VERTEX_N.x},${VERTEX_N.y} ${VERTEX_E.x},${VERTEX_E.y} ${VERTEX_S.x},${VERTEX_S.y} ${VERTEX_W.x},${VERTEX_W.y}`;

// Edge order matches the simulation's cardinalDirections (N, E, S, W in cell
// space): N = upper-right diamond edge, E = lower-right, S = lower-left,
// W = upper-left.
const EDGES: readonly [Point, Point][] = [
  [VERTEX_N, VERTEX_E],
  [VERTEX_E, VERTEX_S],
  [VERTEX_S, VERTEX_W],
  [VERTEX_W, VERTEX_N]
];

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function fmt(point: Point): string {
  return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
}

function curbStrip(edge: [Point, Point]): string {
  const [p1, p2] = edge;
  const inner1 = lerp(p1, CENTER, 0.24);
  const inner2 = lerp(p2, CENTER, 0.24);
  const joint1 = lerp(lerp(p1, p2, 0.34), CENTER, 0.02);
  const joint1Inner = lerp(lerp(p1, p2, 0.34), CENTER, 0.2);
  const joint2 = lerp(lerp(p1, p2, 0.67), CENTER, 0.02);
  const joint2Inner = lerp(lerp(p1, p2, 0.67), CENTER, 0.2);
  return `<polygon points="${fmt(p1)} ${fmt(p2)} ${fmt(inner2)} ${fmt(inner1)}" fill="#96907e" stroke="#4d4335" stroke-width="1.1"/>
<line x1="${joint1.x.toFixed(1)}" y1="${joint1.y.toFixed(1)}" x2="${joint1Inner.x.toFixed(1)}" y2="${joint1Inner.y.toFixed(1)}" stroke="#4d4335" stroke-width="1"/>
<line x1="${joint2.x.toFixed(1)}" y1="${joint2.y.toFixed(1)}" x2="${joint2Inner.x.toFixed(1)}" y2="${joint2Inner.y.toFixed(1)}" stroke="#4d4335" stroke-width="1"/>
<polyline points="${fmt(lerp(p1, CENTER, 0.06))} ${fmt(lerp(p2, CENTER, 0.06))}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>`;
}

// SVG rasterization anti-aliases the diamond outline into semi-transparent
// edge pixels; adjacent tiles then composite those into visible dark seam
// lines. Post-process to a hard mask: pixel-center membership in the iso
// diamond via half-open intervals partitions the plane exactly (no gaps, no
// double edges), and partial-alpha pixels are flattened onto the sand base.
const BASE_FILL = { r: 0xc2, g: 0xa4, b: 0x6e };

function hardMaskDiamond(data: Buffer, width: number, height: number): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x + 0.5 - CENTER.x) / 64;
      const dy = (y + 0.5 - CENTER.y) / 32;
      const u = dx + dy;
      const v = dy - dx;
      const inside = u >= -0.5 && u < 0.5 && v >= -0.5 && v < 0.5;
      const i = (y * width + x) * 4;
      if (!inside) {
        data[i + 3] = 0;
        continue;
      }
      const alpha = (data[i + 3] ?? 0) / 255;
      if (alpha < 1) {
        data[i] = Math.round((data[i] ?? 0) * alpha + BASE_FILL.r * (1 - alpha));
        data[i + 1] = Math.round((data[i + 1] ?? 0) * alpha + BASE_FILL.g * (1 - alpha));
        data[i + 2] = Math.round((data[i + 2] ?? 0) * alpha + BASE_FILL.b * (1 - alpha));
        data[i + 3] = 255;
      }
    }
  }
}

// Deterministic per-mask jitter so the 16 tile variants don't all share one
// identical patch layout — adjacent lot cells resolve to different masks, and
// a repeated blob arrangement across them reads as mechanical tiling.
function jitterFor(mask: string): (index: number, range: number) => number {
  let state = parseInt(mask, 2) * 2654435761 + 1013904223;
  const samples: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    samples.push(state / 4294967296 - 0.5);
  }
  return (index, range) => (samples[index % samples.length] ?? 0) * 2 * range;
}

function honmaruTileSvg(mask: string): string {
  const open = mask.split("").map((bit) => bit === "1");
  const curbs = EDGES.filter((_, index) => !open[index])
    .map((edge) => curbStrip(edge))
    .join("\n");
  const j = jitterFor(mask);
  const mirror = parseInt(mask, 2) % 2 === 1 ? ' transform="translate(64,0) scale(-1,1)"' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 64 32">
<defs><clipPath id="cell"><polygon points="${DIAMOND}"/></clipPath></defs>
<polygon points="${DIAMOND}" fill="#c2a46e"/>
<g clip-path="url(#cell)">
<g${mirror}>
<ellipse cx="${(22 + j(0, 7)).toFixed(1)}" cy="${(13 + j(1, 2.5)).toFixed(1)}" rx="12" ry="5" fill="rgba(139,110,64,0.30)"/>
<ellipse cx="${(43 + j(2, 7)).toFixed(1)}" cy="${(20 + j(3, 2.5)).toFixed(1)}" rx="13" ry="5.5" fill="rgba(216,190,133,0.42)"/>
<ellipse cx="${(36 + j(4, 6)).toFixed(1)}" cy="${(10 + j(5, 2)).toFixed(1)}" rx="8" ry="3.4" fill="rgba(171,140,84,0.34)"/>
<ellipse cx="${(17 + j(6, 5)).toFixed(1)}" cy="${(21 + j(7, 2)).toFixed(1)}" rx="8" ry="3.2" fill="rgba(216,190,133,0.30)"/>
<path d="M${(12 + j(8, 4)).toFixed(1)} ${(16 + j(9, 1.5)).toFixed(1)} C20 12.5, 27 18.5, 36 15 S50 13, 55 16.5" fill="none" stroke="rgba(107,83,48,0.35)" stroke-width="1.2"/>
<path d="M${(16 + j(10, 4)).toFixed(1)} ${(20.5 + j(11, 1.5)).toFixed(1)} C25 17.5, 33 22.5, 44 19" fill="none" stroke="rgba(240,222,178,0.38)" stroke-width="1"/>
<circle cx="${(26 + j(5, 8)).toFixed(1)}" cy="${(17.5 + j(2, 2)).toFixed(1)}" r="1.3" fill="rgba(122,111,92,0.6)"/>
<circle cx="${(40 + j(7, 8)).toFixed(1)}" cy="${(13.5 + j(0, 2)).toFixed(1)}" r="1.1" fill="rgba(122,111,92,0.55)"/>
<circle cx="${(33 + j(9, 8)).toFixed(1)}" cy="${(22.5 + j(4, 2)).toFixed(1)}" r="1.2" fill="rgba(122,111,92,0.5)"/>
</g>
${curbs}
</g>
</svg>`;
}

async function main(): Promise<void> {
  await mkdir(generatedOutputDir, { recursive: true });
  const manifest = JSON.parse(await readFile(generatedManifestPath, "utf8")) as AssetManifest;

  const entries: GeneratedAsset[] = [];
  for (const mask of MASKS) {
    const output = `building-honmaru-tile-connected-${mask}.png`;
    const rendered = await sharp(Buffer.from(honmaruTileSvg(mask)))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    hardMaskDiamond(rendered.data, rendered.info.width, rendered.info.height);
    await sharp(rendered.data, {
      raw: { width: rendered.info.width, height: rendered.info.height, channels: 4 }
    })
      .png()
      .toFile(join(generatedOutputDir, output));
    entries.push({
      assetId: `building.honmaru.tile.connected.${mask}`,
      kind: "building",
      file: `generated/${output}`,
      width: 64,
      height: 32,
      anchor: { x: 0.5, y: 0.5 }
    });
  }

  const untouched = manifest.assets.filter((asset) => !entries.some((entry) => entry.assetId === asset.assetId));
  const merged: AssetManifest = { ...manifest, assets: [...untouched, ...entries] };
  await writeFile(generatedManifestPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(`generated ${entries.length} honmaru courtyard tiles`);
}

await main();
