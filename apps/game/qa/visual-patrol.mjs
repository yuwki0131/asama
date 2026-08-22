#!/usr/bin/env node
// Visual patrol — random-view capture for the perceptual QA cycle (L2 input).
// composite-lint measures what we already know how to measure (GAP/VAL/REP);
// this tool feeds what we DON'T: it samples random views of a real scenario
// map and hands the screenshots to fresh-context VLM reviewers for open-ended
// 違和感 extraction (repetition that survives variant pools, elevation-junction
// artifacts, depth-order breaks, ...). Findings get triaged into the problem
// ledger and, once understood, promoted to machine rules.
//
// Usage:
//   node qa/visual-patrol.mjs --scenario ogaki-castle [--count 12] [--seed 42]
//     [--zooms 0.5,0.75,1,1.5] [--base-url http://127.0.0.1:5196]
//     [--out-dir artifacts/visual-patrol] [--settle 12000]
//
// Views are seeded-random: same --seed ⇒ same views, so a finding's view can
// be re-captured after a fix. Centers are sampled from building positions
// (patrolling empty grass tells reviewers nothing). Output:
//   artifacts/visual-patrol/<scenario>/<run>/shot-NN.png + index.json
//
// IMPORTANT: launch args are exactly ["--no-sandbox","--disable-dev-shm-usage",
// "--disable-gpu"] — swiftshader-style args render a black canvas here.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const QA_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(QA_DIR, "../../..");
const CHROMIUM_PATH = process.env.ASAMA_CHROMIUM_BIN ?? "/run/current-system/sw/bin/chromium";
const LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];

function parseArgs(argv) {
  const options = {
    scenario: null,
    count: 12,
    seed: (Date.now() % 100000) | 0,
    zooms: [0.5, 0.75, 1, 1.5],
    baseUrl: "http://127.0.0.1:5196",
    outDir: join(REPO_ROOT, "artifacts/visual-patrol"),
    settleMs: 12000,
    /** Fixed views ("x,y@zoom;..."): targeted shots (map edges, terraces)
     *  instead of building-biased random sampling. */
    cells: null
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (argv[i] === undefined) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };
    if (arg === "--scenario") options.scenario = next();
    else if (arg === "--count") options.count = Number(next());
    else if (arg === "--seed") options.seed = Number(next());
    else if (arg === "--zooms") options.zooms = next().split(",").map(Number);
    else if (arg === "--base-url") options.baseUrl = next().replace(/\/$/, "");
    else if (arg === "--out-dir") options.outDir = resolve(next());
    else if (arg === "--settle") options.settleMs = Number(next());
    else if (arg === "--cells")
      options.cells = next().split(";").map((spec) => {
        const [xy, zoom = "1"] = spec.split("@");
        const [x, y] = xy.split(",").map(Number);
        return { cell: { x, y }, zoom: Number(zoom) };
      });
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node qa/visual-patrol.mjs --scenario <name> [--count n] [--seed n] [--zooms a,b] [--cells x,y@zoom;...] [--base-url url] [--out-dir dir] [--settle ms]"
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.scenario === null) throw new Error("--scenario is required");
  return options;
}

/** mulberry32 — tiny seeded PRNG, good enough for view sampling. */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rng = makeRng(options.seed);
  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const runDir = join(options.outDir, options.scenario, runId);
  await mkdir(runDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: LAUNCH_ARGS, headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${options.baseUrl}/?scenario=${options.scenario}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__asamaTest?.getSnapshot?.() != null, null, { timeout: 60000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Debug");
    if (button != null && button.classList.contains("active")) button.click();
  });
  await page.evaluate(() => window.__asamaTest.setSpeed(0));
  await page.waitForTimeout(options.settleMs);

  const world = await page.evaluate(() => {
    const s = window.__asamaTest.getSnapshot();
    return {
      width: s.map.width,
      height: s.map.height,
      buildingCells: s.buildings.map((b) => ({ x: b.position.x, y: b.position.y }))
    };
  });
  if (world.buildingCells.length === 0) throw new Error("Scenario has no buildings to patrol");

  // Sample view centers from building positions (built-area bias); reject
  // centers closer than minDist cells to an already-picked view at the same
  // zoom so one patrol spreads over the map instead of re-shooting one spot.
  const views = options.cells !== null ? [] : [{ name: "first", cell: null, zoom: 1 }];
  if (options.cells !== null) {
    for (const { cell, zoom } of options.cells) {
      views.push({ name: `c${String(views.length + 1).padStart(2, "0")}-${cell.x}x${cell.y}-z${zoom}`, cell, zoom });
    }
  }
  const picked = [];
  let attempts = 0;
  while (options.cells === null && views.length < options.count + 1 && attempts < options.count * 60) {
    attempts += 1;
    const cell = world.buildingCells[Math.floor(rng() * world.buildingCells.length)];
    const zoom = options.zooms[Math.floor(rng() * options.zooms.length)];
    const minDist = 24 / zoom;
    const clash = picked.some((p) => p.zoom === zoom && Math.hypot(p.cell.x - cell.x, p.cell.y - cell.y) < minDist);
    if (clash) continue;
    picked.push({ cell, zoom });
    views.push({ name: `p${String(views.length).padStart(2, "0")}-z${zoom}`, cell, zoom });
  }

  const index = { scenario: options.scenario, seed: options.seed, capturedAt: new Date().toISOString(), views: [] };
  for (const view of views) {
    if (view.cell !== null) {
      await page.evaluate(
        ({ cell, zoom }) => window.__asamaTest.jumpCameraToCell(cell, zoom),
        { cell: view.cell, zoom: view.zoom }
      );
      await page.waitForTimeout(1200);
    }
    const file = `${view.name}.png`;
    await page.screenshot({ path: join(runDir, file) });
    index.views.push({ name: view.name, cell: view.cell, zoom: view.zoom, file });
    console.log(`captured ${view.name}${view.cell ? ` cell=(${view.cell.x},${view.cell.y}) zoom=${view.zoom}` : " (initial view)"}`);
  }

  await writeFile(join(runDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  await browser.close();
  console.log(`\nvisual-patrol: ${index.views.length} views (seed ${options.seed}) — ${runDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
