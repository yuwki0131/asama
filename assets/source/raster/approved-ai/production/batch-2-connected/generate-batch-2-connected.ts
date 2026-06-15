import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type sharpType from "sharp";

type Direction = "n" | "e" | "s" | "w";

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Family {
  readonly outputPrefix: string;
  readonly width: number;
  readonly height: number;
  readonly render: (mask: string) => string;
}

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../../../../../packages/asset-tools/package.json"));
const sharp = require("sharp") as typeof sharpType;

const masks = Array.from({ length: 16 }, (_, value) => value.toString(2).padStart(4, "0"));
const families: readonly Family[] = [
  {
    outputPrefix: "building-fence-wood-connected",
    width: 64,
    height: 64,
    render: renderFence
  },
  {
    outputPrefix: "building-wall-plaster-connected",
    width: 64,
    height: 72,
    render: renderWall
  },
  {
    outputPrefix: "building-dry-moat-connected",
    width: 64,
    height: 32,
    render: (mask) => renderMoat(mask, false)
  },
  {
    outputPrefix: "building-water-moat-connected",
    width: 64,
    height: 32,
    render: (mask) => renderMoat(mask, true)
  }
];

await mkdir(here, { recursive: true });
for (const family of families) {
  for (const mask of masks) {
    await sharp(Buffer.from(svg(family.width, family.height, family.render(mask))))
      .png()
      .toFile(join(here, `${family.outputPrefix}-${mask}.png`));
  }
}

function renderFence(maskText: string): string {
  const mask = parseMask(maskText);
  const center = { x: 32, y: 34 };
  const points: Record<Direction, Point> = {
    n: { x: 52, y: 24 },
    e: { x: 52, y: 44 },
    s: { x: 12, y: 44 },
    w: { x: 12, y: 24 }
  };
  const dirs = connectedDirs(mask);
  const active = dirs.length === 0 ? [] : dirs;
  const rails = active
    .map((dir) => rail(center, points[dir], "#2f2116", "#8a5f35", 5, 3))
    .join("\n");
  const posts = uniquePoints([center, ...active.map((dir) => points[dir])])
    .map((point) => fencePost(point.x, point.y))
    .join("\n");
  return `<ellipse cx="32" cy="50" rx="25" ry="7" fill="rgba(0,0,0,0.25)"/>
<polygon points="32,22 58,35 32,50 6,35" fill="rgba(90,67,40,0.13)" stroke="rgba(36,28,18,0.28)" stroke-width="1"/>
${rails}
${posts}`;
}

function renderWall(maskText: string): string {
  const mask = parseMask(maskText);
  const center = { x: 32, y: 42 };
  const points: Record<Direction, Point> = {
    n: { x: 54, y: 30 },
    e: { x: 54, y: 54 },
    s: { x: 10, y: 54 },
    w: { x: 10, y: 30 }
  };
  const segments = connectedDirs(mask)
    .map((dir) => wallSegment(center, points[dir]))
    .join("\n");
  const cap = `<polygon points="22,38 32,32 42,38 42,48 32,54 22,48" fill="#ded9c5" stroke="#3f3a31" stroke-width="1.6"/>
<path d="M23 48 L32 54 L41 48" fill="none" stroke="rgba(35,28,21,0.48)" stroke-width="2.2" stroke-linejoin="round"/>
<polygon points="20,36 32,29 44,36 32,44" fill="#59616a" stroke="#3f3a31" stroke-width="1.5"/>`;
  return `<ellipse cx="32" cy="59" rx="28" ry="7" fill="rgba(0,0,0,0.27)"/>
${segments}
${cap}`;
}

function renderMoat(maskText: string, water: boolean): string {
  const mask = parseMask(maskText);
  const diamond = "32,1 63,16 32,31 1,16";
  const center = { x: 32, y: 16 };
  const points: Record<Direction, Point> = {
    n: { x: 48, y: 8 },
    e: { x: 48, y: 24 },
    s: { x: 16, y: 24 },
    w: { x: 16, y: 8 }
  };
  const bed = water ? "#285f70" : "#715637";
  const stroke = water ? "#1c3d49" : "#3f2c1f";
  const channel = water ? "rgba(147,215,229,0.78)" : "rgba(43,30,19,0.48)";
  const highlight = water ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.13)";
  const segments = connectedDirs(mask)
    .map(
      (dir) => `<path d="${moatPath(center, points[dir])}" fill="none" stroke="${channel}" stroke-width="9" stroke-linecap="round"/>
<path d="${moatPath(center, points[dir])}" fill="none" stroke="${highlight}" stroke-width="2.2" stroke-linecap="round"/>`
    )
    .join("\n");
  const isolated =
    segments.length === 0
      ? `<ellipse cx="32" cy="16" rx="11" ry="5" fill="${channel}"/>
<path d="M23 16 C28 12, 36 20, 41 16" fill="none" stroke="${highlight}" stroke-width="1.6"/>`
      : "";
  return `<defs><clipPath id="clip"><polygon points="${diamond}"/></clipPath></defs>
<polygon points="${diamond}" fill="${bed}" stroke="${stroke}" stroke-width="2"/>
<g clip-path="url(#clip)">
${segments}
${isolated}
<path d="M4 18 L32 4 L60 18" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
<path d="M6 24 L32 11 L58 24" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="2"/>
</g>`;
}

function parseMask(mask = "0000"): Record<Direction, boolean> {
  return {
    n: mask[0] === "1",
    e: mask[1] === "1",
    s: mask[2] === "1",
    w: mask[3] === "1"
  };
}

function connectedDirs(mask: Record<Direction, boolean>): Direction[] {
  return (["n", "e", "s", "w"] as const).filter((dir) => mask[dir]);
}

function rail(from: Point, to: Point, stroke: string, fill: string, outer: number, inner: number): string {
  return `<path d="M${from.x} ${from.y} L${to.x} ${to.y}" fill="none" stroke="${stroke}" stroke-width="${outer}" stroke-linecap="round"/>
<path d="M${from.x} ${from.y - 1} L${to.x} ${to.y - 1}" fill="none" stroke="${fill}" stroke-width="${inner}" stroke-linecap="round"/>`;
}

function fencePost(x: number, y: number): string {
  return `<ellipse cx="${x}" cy="${y + 9}" rx="4.5" ry="2.2" fill="rgba(0,0,0,0.32)"/>
<path d="M${x} ${y - 10} L${x} ${y + 9}" stroke="#2f2116" stroke-width="4" stroke-linecap="round"/>
<path d="M${x} ${y - 10} L${x} ${y + 7}" stroke="#8a5f35" stroke-width="2" stroke-linecap="round"/>`;
}

function wallSegment(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * 4;
  const ny = (dx / length) * 4;
  const a = { x: from.x + nx, y: from.y + ny };
  const b = { x: to.x + nx, y: to.y + ny };
  const c = { x: to.x - nx, y: to.y - ny + 10 };
  const d = { x: from.x - nx, y: from.y - ny + 10 };
  const roofA = { x: from.x + nx * 1.3, y: from.y + ny * 1.3 - 5 };
  const roofB = { x: to.x + nx * 1.3, y: to.y + ny * 1.3 - 5 };
  const roofC = { x: to.x - nx * 1.3, y: to.y - ny * 1.3 + 3 };
  const roofD = { x: from.x - nx * 1.3, y: from.y - ny * 1.3 + 3 };
  return `<polygon points="${points([a, b, c, d])}" fill="#ded9c5" stroke="#3f3a31" stroke-width="1.6"/>
<path d="M${c.x} ${c.y} L${d.x} ${d.y}" stroke="rgba(35,28,21,0.45)" stroke-width="2.2" stroke-linecap="round"/>
<polygon points="${points([roofA, roofB, roofC, roofD])}" fill="#59616a" stroke="#3f3a31" stroke-width="1.4"/>`;
}

function moatPath(from: Point, to: Point): string {
  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2;
  return `M${from.x} ${from.y} Q${cx} ${cy} ${to.x} ${to.y}`;
}

function uniquePoints(points: readonly Point[]): Point[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function points(values: readonly Point[]): string {
  return values.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
