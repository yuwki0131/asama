#!/usr/bin/env node
// Composite lint — machine QA for the ASSEMBLED game view (L1 of the
// composite QA gate). Individual assets pass artLint; this tool catches the
// problems that only appear when many assets are combined on a real map:
//
//   GAP   (C1) ground-coverage gaps: pixels inside the map footprint where no
//         opaque sprite paints, normally masked by the dark terrain underlay.
//         Detected by chroma-key mode (magenta clear color + hidden underlay).
//   VAL   (C2) large screen areas that are extremely dark/bright — reads as a
//         "hole" or dirty smear at map scale (e.g. near-black tree foliage).
//         Offending textures are attributed via the debugObjectsAt bridge.
//   REP   (C3) variant repetition: runs of consecutive same-type connected
//         buildings (moat/river/wall...) resolving to the SAME assetId, which
//         reads as an obviously tiled pattern. Pure snapshot-data check.
//
// Usage:
//   node qa/composite-lint.mjs --scenario ogaki-castle [--views first,center]
//     [--base-url http://127.0.0.1:5196] [--out-dir artifacts/composite-lint]
//     [--json] [--settle 12000]
//
// Standard views come from assets/definitions/composite-views.json. The dev
// server must already run: pnpm --filter @asama/game exec vite --host 127.0.0.1 --port 5196
//
// IMPORTANT: launch args are exactly ["--no-sandbox","--disable-dev-shm-usage",
// "--disable-gpu"] — swiftshader-style args render a black canvas here.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { PNG } from "pngjs";
import { chromium } from "playwright-core";

const QA_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(QA_DIR, "../../..");
const VIEWS_PATH = join(REPO_ROOT, "assets/definitions/composite-views.json");
const CHROMIUM_PATH = process.env.ASAMA_CHROMIUM_BIN ?? "/run/current-system/sw/bin/chromium";
const LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];

// ---------------------------------------------------------------------------
// Thresholds (art-rulebook COMP-01..03). Tuned on ogaki-castle.
const GAP_MIN_AREA_PX = 24; // blob of uncovered ground ⇒ error
const GAP_SEAM_MIN_AREA_PX = 220; // thin seam lines: larger budget before error
// Dark threshold targets NEAR-BLACK only: legitimately dark content (moat
// water ~sum 210, shaded roofs/walls) must not trip it. Asset-level darkness
// is the artLint LUM rule's job; here we only catch black holes at map scale.
// Near-black only: approved dark content (kawara roof shading sits at sum
// ~80-130 over large contiguous areas) must never trip the map-scale check.
// Dark-but-not-black ASSETS are the artLint LUM rule's job (opaque-mean luma
// >= 48 per sprite); VAL exists to catch compositing black holes — bare
// background, unlit fills — which render far darker than any approved art.
const VAL_DARK_SUM = 90; // r+g+b below ⇒ "extreme dark" pixel
const VAL_BRIGHT_SUM = 705; // r+g+b above ⇒ "extreme bright" pixel
const VAL_MIN_AREA_PX = 2500; // contiguous extreme area ⇒ error
const REP_MAX_RUN = 3; // >N consecutive identical assetIds ⇒ error (variant families)
const REP_FAMILIES = [
  "water_moat", "dry_moat", "river", "wall", "hei", "fence_wood", "yagura_wall",
  "road", "stone_wall", "machiya"
];
// Families that HAVE a variant pool today (violations are fixable bugs; the
// rest are reported as info so missing pools surface as design debt).
const REP_VARIANT_FAMILIES = new Set(["water_moat", "dry_moat", "river", "machiya"]);

function parseArgs(argv) {
  const options = {
    scenario: null,
    views: null,
    baseUrl: "http://127.0.0.1:5196",
    outDir: join(REPO_ROOT, "artifacts/composite-lint"),
    settleMs: 12000,
    json: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (argv[i] === undefined) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };
    if (arg === "--scenario") options.scenario = next();
    else if (arg === "--views") options.views = next().split(",");
    else if (arg === "--base-url") options.baseUrl = next().replace(/\/$/, "");
    else if (arg === "--out-dir") options.outDir = resolve(next());
    else if (arg === "--settle") options.settleMs = Number(next());
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node qa/composite-lint.mjs --scenario <name> [--views a,b] [--base-url url] [--out-dir dir] [--settle ms] [--json]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.scenario === null) throw new Error("--scenario is required");
  return options;
}

async function loadViews(scenario, filter) {
  let config = { scenarios: {} };
  try {
    config = JSON.parse(await readFile(VIEWS_PATH, "utf8"));
  } catch {
    // fall through to default first view
  }
  const views = config.scenarios?.[scenario]?.views ?? [{ name: "first", cell: null }];
  const selected = filter === null ? views : views.filter((v) => filter.includes(v.name));
  if (selected.length === 0) throw new Error(`No views selected (available: ${views.map((v) => v.name).join(",")})`);
  return selected;
}

// --- geometry helpers -------------------------------------------------------

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function shrinkPolygon(poly, factor) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}

/** Connected-component labeling (8-connectivity) over a Uint8Array mask. */
function labelComponents(mask, width, height, minArea) {
  const labels = new Int32Array(width * height);
  const components = [];
  const stack = [];
  let nextLabel = 1;
  for (let idx = 0; idx < mask.length; idx += 1) {
    if (mask[idx] === 0 || labels[idx] !== 0) continue;
    const label = nextLabel;
    nextLabel += 1;
    let area = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let sumX = 0, sumY = 0;
    stack.push(idx);
    labels[idx] = label;
    while (stack.length > 0) {
      const cur = stack.pop();
      const cy = Math.floor(cur / width);
      const cx = cur - cy * width;
      area += 1;
      sumX += cx;
      sumY += cy;
      if (cx < minX) minX = cx;
      if (cy < minY) minY = cy;
      if (cx > maxX) maxX = cx;
      if (cy > maxY) maxY = cy;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (mask[nIdx] !== 0 && labels[nIdx] === 0) {
            labels[nIdx] = label;
            stack.push(nIdx);
          }
        }
      }
    }
    if (area >= minArea) {
      components.push({
        area,
        bbox: { x0: minX, y0: minY, x1: maxX, y1: maxY },
        centroid: { x: Math.round(sumX / area), y: Math.round(sumY / area) }
      });
    }
  }
  return components.sort((a, b) => b.area - a.area);
}

const texBase = (url) => url.split("/").pop()?.replace(/\.png$/, "") ?? url;

// --- page helpers -----------------------------------------------------------

async function preparePage(page, url, settleMs) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__asamaTest?.getSnapshot?.() != null, null, { timeout: 60000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Debug");
    if (button != null && button.classList.contains("active")) button.click();
  });
  await page.evaluate(() => window.__asamaTest.setSpeed(0));
  await page.waitForTimeout(settleMs);
}

/** Analysis mask context: map footprint polygon, canvas rect and DOM overlay
 *  exclusion rects (HUD chips / minimap drawn above the canvas). */
async function analysisContext(page) {
  return await page.evaluate(() => {
    const s = window.__asamaTest.getSnapshot();
    const w = s.map.width;
    const h = s.map.height;
    const corners = [
      window.__asamaTest.cellToScreenPoint({ x: 0, y: 0 }),
      window.__asamaTest.cellToScreenPoint({ x: w - 1, y: 0 }),
      window.__asamaTest.cellToScreenPoint({ x: w - 1, y: h - 1 }),
      window.__asamaTest.cellToScreenPoint({ x: 0, y: h - 1 })
    ];
    const canvas = [...document.querySelectorAll("canvas")].find((el) => el.width > 1000);
    const canvasRect = canvas.getBoundingClientRect();
    const exclusions = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el === canvas || el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
      if (el.children.length > 0 && el.tagName !== "CANVAS") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.width > 700 || r.height > 700) continue;
      const overlaps =
        r.right > canvasRect.left && r.left < canvasRect.right &&
        r.bottom > canvasRect.top && r.top < canvasRect.bottom;
      if (!overlaps) continue;
      exclusions.push({ x0: r.left - 2, y0: r.top - 2, x1: r.right + 2, y1: r.bottom + 2 });
      if (exclusions.length >= 200) break;
    }
    return {
      corners,
      canvas: { x0: canvasRect.left, y0: canvasRect.top, x1: canvasRect.right, y1: canvasRect.bottom },
      mapSize: { w, h }
    , exclusions };
  });
}

function buildAnalysisMask(ctx, width, height) {
  // Shrink the footprint by ~1.5 cells so map-border AA never false-positives.
  const poly = shrinkPolygon(ctx.corners.map((p) => [p.x, p.y]), 1 - 3 / ctx.mapSize.w);
  const mask = new Uint8Array(width * height);
  const margin = 6;
  const x0 = Math.max(Math.ceil(ctx.canvas.x0) + margin, 0);
  const y0 = Math.max(Math.ceil(ctx.canvas.y0) + margin, 0);
  const x1 = Math.min(Math.floor(ctx.canvas.x1) - margin, width - 1);
  const y1 = Math.min(Math.floor(ctx.canvas.y1) - margin, height - 1);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (!pointInPolygon(x, y, poly)) continue;
      mask[y * width + x] = 1;
    }
  }
  for (const r of ctx.exclusions) {
    const ex0 = Math.max(Math.floor(r.x0), 0);
    const ey0 = Math.max(Math.floor(r.y0), 0);
    const ex1 = Math.min(Math.ceil(r.x1), width - 1);
    const ey1 = Math.min(Math.ceil(r.y1), height - 1);
    for (let y = ey0; y <= ey1; y += 1) {
      for (let x = ex0; x <= ex1; x += 1) mask[y * width + x] = 0;
    }
  }
  return mask;
}

async function attributeComponent(page, canvasTop, component, png, pickMask, width) {
  // Sample the centroid plus up to 8 masked pixels spread over the bbox and
  // aggregate which textures paint there.
  const points = [component.centroid];
  const { x0, y0, x1, y1 } = component.bbox;
  for (let i = 0; i < 24 && points.length < 9; i += 1) {
    const x = x0 + Math.floor(((i * 7919) % 104729) / 104729 * (x1 - x0 + 1));
    const y = y0 + Math.floor(((i * 104729) % 7919) / 7919 * (y1 - y0 + 1));
    if (pickMask[y * width + x] === 1) points.push({ x, y });
  }
  const counts = new Map();
  for (const pt of points) {
    const stack = await page.evaluate(
      ([x, y]) => window.__asamaTest.debugObjectsAt(x, y),
      [pt.x, pt.y - canvasTop]
    );
    if (stack === null) continue;
    // Topmost entries win the pixel; count the last few (scene draws above terrain).
    for (const line of stack.slice(-3)) {
      const m = line.match(/tex=([^ ]+)/);
      const key = m ? texBase(m[1]) : line.includes("Graphics") ? "(Graphics)" : "(unknown)";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}×${v}`);
}

// --- checks -----------------------------------------------------------------

async function checkGaps(page, ctx, outPrefix) {
  await page.evaluate(() => {
    window.__asamaTest.setTone(false);
    window.__asamaTest.debugChromaMode(true);
  });
  await page.waitForTimeout(600);
  const buf = await page.screenshot();
  await page.evaluate(() => {
    window.__asamaTest.debugChromaMode(false);
    window.__asamaTest.setTone(true);
  });
  await page.waitForTimeout(300);
  const png = PNG.sync.read(buf);
  await writeFile(`${outPrefix}-chroma.png`, buf);

  const { width, height } = png;
  const mask = buildAnalysisMask(ctx, width, height);
  const magenta = new Uint8Array(width * height);
  let magentaCount = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 0) continue;
    const o = i * 4;
    const r = png.data[o];
    const g = png.data[o + 1];
    const b = png.data[o + 2];
    if (r > 180 && b > 180 && g < 110 && r - g > 90 && b - g > 90) {
      magenta[i] = 1;
      magentaCount += 1;
    }
  }
  const components = labelComponents(magenta, width, height, 4);
  const findings = [];
  for (const comp of components) {
    const w = comp.bbox.x1 - comp.bbox.x0 + 1;
    const h = comp.bbox.y1 - comp.bbox.y0 + 1;
    const thin = Math.min(w, h) <= 3;
    const kind = thin ? "seam" : "hole";
    const minArea = thin ? GAP_SEAM_MIN_AREA_PX : GAP_MIN_AREA_PX;
    if (comp.area < minArea) continue;
    const textures = await attributeComponent(page, ctx.canvas.y0, comp, png, magenta, width);
    findings.push({
      check: "GAP",
      severity: "error",
      kind,
      area: comp.area,
      bbox: comp.bbox,
      centroid: comp.centroid,
      nearTextures: textures
    });
  }
  return { findings, magentaCount, components: components.length };
}

async function checkValues(page, ctx, outPrefix) {
  const buf = await page.screenshot();
  await writeFile(`${outPrefix}.png`, buf);
  const png = PNG.sync.read(buf);
  const { width, height } = png;
  const mask = buildAnalysisMask(ctx, width, height);
  const findings = [];
  for (const [kind, test] of [
    ["dark", (r, g, b) => r + g + b < VAL_DARK_SUM],
    ["bright", (r, g, b) => r + g + b > VAL_BRIGHT_SUM]
  ]) {
    const hits = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] === 0) continue;
      const o = i * 4;
      if (test(png.data[o], png.data[o + 1], png.data[o + 2])) hits[i] = 1;
    }
    // No dilation (bridging nearby patches merged ordinary roof/wall shading
    // across half the screen into one mega-component); instead ERODE by 1 so
    // 1-2 px painterly outline strokes and shade seams — long enough to sum
    // past any area threshold — drop out. A real black hole is thick and
    // survives erosion.
    const eroded = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        if (hits[i] === 1 && hits[i - 1] === 1 && hits[i + 1] === 1 && hits[i - width] === 1 && hits[i + width] === 1) {
          eroded[i] = 1;
        }
      }
    }
    const components = labelComponents(eroded, width, height, VAL_MIN_AREA_PX);
    for (const comp of components.slice(0, 8)) {
      const textures = await attributeComponent(page, ctx.canvas.y0, comp, png, hits, width);
      findings.push({
        check: "VAL",
        severity: "error",
        kind,
        area: comp.area,
        bbox: comp.bbox,
        centroid: comp.centroid,
        nearTextures: textures
      });
    }
  }
  return { findings, png };
}

async function checkRepetition(page) {
  const data = await page.evaluate((families) => {
    const s = window.__asamaTest.getSnapshot();
    const byType = new Map();
    for (const b of s.buildings) {
      const family = families.find((f) => b.type === f || b.type.startsWith(`${f}_`) || b.type.endsWith(`_${f}`));
      if (family === undefined) continue;
      if (!byType.has(family)) byType.set(family, []);
      byType.get(family).push({ x: b.position.x, y: b.position.y, assetId: b.assetId, type: b.type });
    }
    return [...byType.entries()];
  }, REP_FAMILIES);

  const findings = [];
  for (const [family, items] of data) {
    const byPos = new Map(items.map((it) => [`${it.x},${it.y}`, it]));
    const variants = new Set(items.map((it) => it.assetId));
    for (const [dx, dy, axis] of [[1, 0, "x"], [0, 1, "y"]]) {
      const runStarts = items.filter((it) => !byPos.has(`${it.x - dx},${it.y - dy}`));
      for (const start of runStarts) {
        let run = [start];
        let cur = start;
        for (;;) {
          const nxt = byPos.get(`${cur.x + dx},${cur.y + dy}`);
          if (nxt === undefined) break;
          run.push(nxt);
          cur = nxt;
        }
        if (run.length <= REP_MAX_RUN) continue;
        // longest streak of identical assetIds inside the run
        let best = { id: run[0].assetId, len: 1, at: run[0] };
        let streak = 1;
        for (let i = 1; i < run.length; i += 1) {
          streak = run[i].assetId === run[i - 1].assetId ? streak + 1 : 1;
          if (streak > best.len) best = { id: run[i].assetId, len: streak, at: run[i - streak + 1] };
        }
        if (best.len > REP_MAX_RUN) {
          findings.push({
            check: "REP",
            severity: REP_VARIANT_FAMILIES.has(family) ? "error" : "info",
            family,
            axis,
            runLength: run.length,
            identicalRun: best.len,
            assetId: best.id,
            at: { x: best.at.x, y: best.at.y },
            variantPool: variants.size
          });
        }
      }
    }
  }
  // Deduplicate: keep the worst finding per (family, assetId, axis).
  const dedup = new Map();
  for (const f of findings) {
    const key = `${f.family}:${f.assetId}:${f.axis}`;
    const prev = dedup.get(key);
    if (prev === undefined || f.identicalRun > prev.identicalRun) dedup.set(key, f);
  }
  return [...dedup.values()].sort((a, b) => b.identicalRun - a.identicalRun);
}

function annotate(outPrefix, findings) {
  const rects = findings.filter((f) => f.bbox !== undefined);
  if (rects.length === 0) return;
  const args = [`${outPrefix}.png`, "-fill", "none", "-strokewidth", "2"];
  for (const f of rects) {
    args.push("-stroke", f.check === "GAP" ? "red" : "orange");
    args.push("-draw", `rectangle ${f.bbox.x0},${f.bbox.y0} ${f.bbox.x1},${f.bbox.y1}`);
  }
  args.push(`${outPrefix}-annotated.png`);
  execFileSync("magick", args);
}

// --- main -------------------------------------------------------------------

const options = parseArgs(process.argv.slice(2));
const views = await loadViews(options.scenario, options.views);
const url = `${options.baseUrl}/?scenario=${encodeURIComponent(options.scenario)}`;
try {
  const res = await fetch(options.baseUrl, { signal: AbortSignal.timeout(3000) });
  if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
} catch (error) {
  throw new Error(
    `Dev server unreachable at ${options.baseUrl} (${error?.message ?? error}). Start it with:\n` +
      "  pnpm --filter @asama/game exec vite --host 127.0.0.1 --port 5196"
  );
}

const outDir = join(options.outDir, options.scenario);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: LAUNCH_ARGS, headless: true });
const report = { scenario: options.scenario, generatedAt: new Date().toISOString(), views: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await preparePage(page, url, options.settleMs);
  const repetition = await checkRepetition(page);

  for (const view of views) {
    if (view.cell != null) {
      await page.evaluate((cell) => window.__asamaTest.jumpCameraToCell(cell), view.cell);
      await page.waitForTimeout(600);
    }
    const ctx = await analysisContext(page);
    const outPrefix = join(outDir, view.name);
    const val = await checkValues(page, ctx, outPrefix);
    const gaps = await checkGaps(page, ctx, outPrefix);
    const findings = [...gaps.findings, ...val.findings];
    annotate(outPrefix, findings);
    report.views.push({ name: view.name, cell: view.cell ?? null, findings });
  }
  report.repetition = repetition;
} finally {
  await browser.close();
}

await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2));

let errors = 0;
let infos = 0;
for (const view of report.views) {
  for (const f of view.findings) {
    errors += f.severity === "error" ? 1 : 0;
    console.log(
      `[${f.severity}] ${view.name} ${f.check}/${f.kind} area=${f.area}px bbox=(${f.bbox.x0},${f.bbox.y0})-(${f.bbox.x1},${f.bbox.y1}) near=${f.nearTextures.join(",")}`
    );
  }
}
for (const f of report.repetition) {
  if (f.severity === "error") errors += 1;
  else infos += 1;
  console.log(
    `[${f.severity}] REP ${f.family} ${f.axis}-run: ${f.identicalRun} consecutive "${f.assetId}" (run len ${f.runLength}, pool ${f.variantPool}) at (${f.at.x},${f.at.y})`
  );
}
console.log(`\ncomposite-lint: ${errors} error(s), ${infos} info(s) — report: ${join(outDir, "report.json")}`);
if (options.json) console.log(JSON.stringify(report));
process.exit(errors > 0 ? 1 : 0);
