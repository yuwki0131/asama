// Composes a layout JSON into a PNG. Run from packages/asset-tools:
//   node compose-layout.mjs <layout.json> <out.png>
import sharp from "sharp";
import { readFileSync } from "fs";

const [, , layoutPath, outPath] = process.argv;
const scene = JSON.parse(readFileSync(layoutPath, "utf8"));
const manifest = JSON.parse(readFileSync("/home/yuwki0131/workspace/asama/public/assets/generated/manifest.json", "utf8"));
const byId = new Map(manifest.assets.map((a) => [a.assetId, a]));
const pub = "/home/yuwki0131/workspace/asama/public/assets/";
const P = (cx, cy) => [(cx - cy) * 32, (cx + cy) * 16];
const CENTER = new Set(["fence", "wall", "gate_wide_3", "gate_wide_3_ne_sw", "dry_moat", "water_moat", "honmaru", "farm", "road", "earth_bridge", "wood_bridge"]);

let minPx = Infinity, minPy = Infinity, maxPx = -Infinity, maxPy = -Infinity;
for (const c of scene.cells) {
  const [px, py] = P(c.x, c.y);
  minPx = Math.min(minPx, px - 32);
  minPy = Math.min(minPy, py - 16);
  maxPx = Math.max(maxPx, px + 32);
  maxPy = Math.max(maxPy, py + 220);
}
const ox = -minPx + 10, oy = -minPy + 130;
const comps = [];
const missing = new Set();

scene.cells.sort((a, b) => a.x + a.y - (b.x + b.y));
for (const c of scene.cells) {
  const m = byId.get(c.assetId);
  if (!m) { missing.add(c.assetId); continue; }
  const [px, py] = P(c.x, c.y);
  comps.push({ input: pub + m.file, left: Math.round(px - m.anchor.x * m.width + ox), top: Math.round(py - m.anchor.y * m.height + oy) });
}

const placed = [];
for (const b of scene.buildings) {
  const m = byId.get(b.assetId);
  if (!m) { missing.add(b.assetId); continue; }
  const xs = b.footprint.map((c) => c.x);
  const ys = b.footprint.map((c) => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  let px, py;
  if (CENTER.has(b.type)) {
    [px, py] = P((minX + maxX) / 2, (minY + maxY) / 2);
  } else {
    const [qx, qy] = P(maxX + 1, maxY + 1);
    px = qx;
    py = qy - 16;
  }
  placed.push({ m, px, py, flat: b.type === "road" || b.type === "farm" || b.type === "dry_moat" || b.type === "water_moat" });
}
for (const d of scene.decos) {
  const m = byId.get(d.assetId);
  if (!m) { missing.add(d.assetId); continue; }
  const [px, py] = P(d.position.x, d.position.y);
  placed.push({ m, px, py, flat: false });
}
// Flat surfaces first, then y-sorted solids.
placed.sort((a, b) => (a.flat === b.flat ? a.py - b.py : a.flat ? -1 : 1));
for (const { m, px, py } of placed) {
  comps.push({ input: pub + m.file, left: Math.round(px - m.anchor.x * m.width + ox), top: Math.round(py - m.anchor.y * m.height + oy) });
}

if (missing.size) console.log("MISSING:", [...missing].join(", "));
await sharp({ create: { width: Math.ceil(maxPx - minPx + 20), height: Math.ceil(maxPy - minPy + 60), channels: 4, background: { r: 40, g: 44, b: 46, alpha: 255 } } })
  .composite(comps)
  .png()
  .toFile(outPath);
console.log("written", outPath);
