#!/usr/bin/env node
// Formal screenshot tool for the visual QA gate (successor of shot.tmp.mjs).
//
// Modes:
//   node qa/shot.mjs --preset ishigaki [--shot takaishigaki-main] [--out-dir artifacts/review-shots]
//   node qa/shot.mjs --url http://127.0.0.1:5196/?scenario=concentric-castle --out /tmp/shot.png --cell 60,70 --zoom 3
//
// Presets come from assets/definitions/review-shots.json (fixed review
// viewpoints per asset family). The dev server must already run on port 5196
// (5179/5187 are reserved): pnpm --filter @asama/game exec vite --host 127.0.0.1 --port 5196
//
// IMPORTANT: launch args are exactly ["--no-sandbox","--disable-dev-shm-usage",
// "--disable-gpu"] — the same as e2e/helpers.ts. Swiftshader-style args render
// a black canvas on this machine; do not "improve" them.

import { readFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const QA_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(QA_DIR, "../../..");
const REVIEW_SHOTS_PATH = join(REPO_ROOT, "assets/definitions/review-shots.json");
const CHROMIUM_PATH = process.env.ASAMA_CHROMIUM_BIN ?? "/run/current-system/sw/bin/chromium";
const DEFAULT_BASE_URL = "http://127.0.0.1:5196";
const LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];

function parseArgs(argv) {
  const options = {
    preset: null,
    shot: null,
    outDir: join(REPO_ROOT, "artifacts/review-shots"),
    baseUrl: DEFAULT_BASE_URL,
    url: null,
    out: null,
    cell: null,
    zoom: 0,
    tick: null,
    settleMs: 15000,
    viewport: { width: 1600, height: 1000 }
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (argv[i] === undefined) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };
    if (arg === "--preset") options.preset = next();
    else if (arg === "--shot") options.shot = next();
    else if (arg === "--out-dir") options.outDir = resolve(next());
    else if (arg === "--base-url") options.baseUrl = next().replace(/\/$/, "");
    else if (arg === "--url") options.url = next();
    else if (arg === "--out") options.out = resolve(next());
    else if (arg === "--cell") {
      const [x, y] = next().split(",").map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("--cell expects x,y");
      options.cell = { x, y };
    } else if (arg === "--zoom") options.zoom = Number(next());
    else if (arg === "--tick") options.tick = Number(next());
    else if (arg === "--settle") options.settleMs = Number(next());
    else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage:",
          "  node qa/shot.mjs --preset <name> [--shot <shotName>] [--out-dir dir] [--base-url url]",
          "  node qa/shot.mjs --url <url> --out <path> [--cell x,y] [--zoom n]",
          "Options: --settle <ms> (asset settle wait, default 15000)",
          `Presets: ${REVIEW_SHOTS_PATH}`
        ].join("\n")
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function resolveShots(options) {
  if (options.preset !== null) {
    const config = JSON.parse(await readFile(REVIEW_SHOTS_PATH, "utf8"));
    const preset = config.presets?.[options.preset];
    if (preset === undefined) {
      throw new Error(`Unknown preset "${options.preset}". Available: ${Object.keys(config.presets ?? {}).join(", ")}`);
    }
    const shots = preset.shots.filter((shot) => options.shot === null || shot.name === options.shot);
    if (shots.length === 0) {
      throw new Error(`Preset "${options.preset}" has no shot named "${options.shot}"`);
    }
    return shots.map((shot) => ({
      url: `${options.baseUrl}/?scenario=${encodeURIComponent(shot.scenario)}`,
      out: join(options.outDir, `${options.preset}-${shot.name}.png`),
      cell: shot.cell,
      zoom: shot.zoom ?? 0,
      tick: shot.tick ?? null,
      label: `${options.preset}/${shot.name} — ${shot.description ?? ""}`
    }));
  }
  if (options.url === null || options.out === null) {
    throw new Error("Either --preset or both --url and --out are required (see --help)");
  }
  return [
    {
      url: options.url,
      out: options.out,
      cell: options.cell,
      zoom: options.zoom,
      tick: options.tick,
      label: "ad-hoc"
    }
  ];
}

async function assertServerReachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
  } catch (error) {
    throw new Error(
      `Dev server unreachable at ${url} (${error?.message ?? error}). Start it with:\n` +
        "  pnpm --filter @asama/game exec vite --host 127.0.0.1 --port 5196"
    );
  }
}

async function takeShot(page, shot, settleMs) {
  await page.goto(shot.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__asamaTest?.getSnapshot?.() != null, null, { timeout: 60000 });
  // DEV defaults the debug overlay/status panel to ON; toggle it off so
  // review shots show the shipped look.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Debug");
    if (button != null && button.classList.contains("active")) button.click();
  });
  // Let textures/animation sheets finish decoding before framing the shot.
  await page.waitForTimeout(settleMs);

  if (shot.tick != null) {
    // Fast-forward for subjects that only exist mid-scenario (e.g. wave spawns).
    await page.evaluate(async (tick) => {
      window.__asamaTest.setSpeed(4);
      await window.__asamaTest.waitForTick(tick);
      window.__asamaTest.setSpeed(1);
    }, shot.tick);
  }

  if (shot.cell != null) {
    await page.evaluate((cell) => window.__asamaTest.jumpCameraToCell(cell), shot.cell);
    await page.waitForTimeout(400);
  }

  const zoomSteps = Math.trunc(shot.zoom ?? 0);
  if (zoomSteps !== 0) {
    // The test bridge has no zoom API, so zoom with wheel events. The wheel
    // only zooms when the cursor is over the canvas, so aim it at the target
    // cell (screen center after the jump); fall back to the viewport center.
    const viewport = page.viewportSize() ?? { width: 1600, height: 1000 };
    let point = { x: viewport.width / 2, y: viewport.height / 2 };
    if (shot.cell != null) {
      const cellPoint = await page.evaluate(
        (cell) => window.__asamaTest.cellToScreenPoint?.(cell) ?? null,
        shot.cell
      );
      if (
        cellPoint != null &&
        cellPoint.x >= 0 &&
        cellPoint.x < viewport.width &&
        cellPoint.y >= 0 &&
        cellPoint.y < viewport.height
      ) {
        point = cellPoint;
      }
    }
    // Note: do NOT jumpCameraToCell after zooming — it resets zoom to 1.
    // Wheel zoom anchors on the cursor, so aiming at the cell keeps it framed.
    await page.mouse.move(point.x, point.y);
    for (let i = 0; i < Math.abs(zoomSteps); i += 1) {
      await page.mouse.wheel(0, zoomSteps > 0 ? -120 : 120);
      await page.waitForTimeout(200);
    }
  }

  await page.waitForTimeout(1200);
  await mkdir(dirname(shot.out), { recursive: true });
  await page.screenshot({ path: shot.out });
  console.log(`saved ${shot.out}  (${shot.label})`);
}

const options = parseArgs(process.argv.slice(2));
const shots = await resolveShots(options);
await assertServerReachable(new URL(shots[0].url).origin);

const browser = await chromium.launch({
  executablePath: CHROMIUM_PATH,
  args: LAUNCH_ARGS,
  headless: true
});
try {
  const page = await browser.newPage({ viewport: options.viewport });
  for (const shot of shots) {
    await takeShot(page, shot, options.settleMs);
  }
} finally {
  await browser.close();
}
