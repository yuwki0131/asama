import { spawn, type ChildProcess } from "node:child_process";
import { inflateSync } from "node:zlib";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { expectedScreenColor, type Rgb } from "../src/client/renderer/toneGrade";

// Use port 5179 to avoid collisions with other dev servers on 5173–5177.
const DEV_PORT = process.env["ASAMA_E2E_PORT"] ?? "5179";
export const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;
const CHROMIUM_PATH = process.env.ASAMA_CHROMIUM_BIN ?? "/run/current-system/sw/bin/chromium";
const REPO_ROOT = join(import.meta.dirname, "../../..");
const GAME_DIR = join(import.meta.dirname, "..");

// ── Dev server ─────────────────────────────────────────────────────────────

let devServer: ChildProcess | null = null;

export async function ensureDevServer(): Promise<void> {
  if (await isServerReady()) return;
  // Resolve the vite binary from node_modules
  const viteBin = join(GAME_DIR, "node_modules/.bin/vite");
  devServer = spawn(viteBin, ["--host", "127.0.0.1", "--port", DEV_PORT, "--strictPort"], {
    cwd: GAME_DIR,
    stdio: "pipe",
    env: { ...process.env }
  });
  devServer.stderr?.on("data", (d: Buffer) => {
    if (process.env["ASAMA_E2E_DEBUG"]) process.stderr.write(d);
  });
  devServer.stdout?.on("data", (d: Buffer) => {
    if (process.env["ASAMA_E2E_DEBUG"]) process.stdout.write(d);
  });
  await waitForServer(60_000);
}

export function stopDevServer(): void {
  if (devServer !== null) {
    devServer.kill();
    devServer = null;
  }
}

async function isServerReady(): Promise<boolean> {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(2_000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerReady()) return;
    await sleep(500);
  }
  throw new Error(`Dev server did not start within ${timeoutMs}ms`);
}

// ── Browser ─────────────────────────────────────────────────────────────────

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    headless: true
  });
}

export async function newPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  return { context, page };
}

// ── Test bridge wait ─────────────────────────────────────────────────────────

/** Navigate to the game and wait until window.__asamaTest and a first snapshot
 *  are ready. `query` selects DEV fixtures, e.g. "?scenario=elevation-fixture".
 *  Defaults to "?scenario=concentric-castle" to bypass the scenario selection
 *  screen so E2E tests start directly into the game. */
export async function openGame(page: Page, query = "?scenario=concentric-castle"): Promise<void> {
  const consoleMsgs: string[] = [];
  page.on("console", (msg) => {
    const loc = msg.location();
    const locStr = loc.url ? ` (${loc.url})` : "";
    consoleMsgs.push(`[${msg.type()}] ${msg.text()}${locStr}`);
  });
  page.on("requestfailed", (req) => {
    consoleMsgs.push(`[reqfail] ${req.url()} — ${req.failure()?.errorText ?? ""}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      consoleMsgs.push(`[http${res.status()}] ${res.url()}`);
    }
  });
  (page as any).__consoleMsgs = consoleMsgs;

  await page.goto(DEV_URL + query);
  // Wait for __asamaTest to appear
  await page.waitForFunction(
    () => typeof window.__asamaTest !== "undefined",
    { timeout: 20_000 }
  );
  // Wait for first snapshot (worker ready)
  await page.waitForFunction(
    () => window.__asamaTest?.getSnapshot() !== null,
    { timeout: 30_000 }
  );
}

export function getConsoleMsgs(page: Page): string[] {
  return (page as any).__consoleMsgs ?? [];
}

// ── PNG pixel reader (no deps) ────────────────────────────────────────────

interface PngData {
  width: number;
  height: number;
  /** RGBA, row-major, top-to-bottom */
  data: Uint8Array;
}

export function parsePng(buffer: Buffer): PngData {
  let offset = 8; // skip 8-byte PNG signature
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idatParts: Buffer[] = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) {
        throw new Error(`parsePng: unsupported bit depth ${data[8]}`);
      }
      colorType = data[9]!;
      if (colorType !== 2 && colorType !== 6) {
        throw new Error(`parsePng: unsupported color type ${colorType} (only 8-bit RGB/RGBA)`);
      }
    } else if (type === "IDAT") {
      idatParts.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idatParts));
  // Playwright emits color type 2 (opaque RGB) for canvas screenshots and
  // type 6 (RGBA) otherwise; unfilter at the source bpp, return RGBA.
  const bpp = colorType === 2 ? 3 : 4;
  const stride = width * bpp;
  const result = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filterType = raw[rowStart];
    const row = raw.subarray(rowStart + 1, rowStart + 1 + stride);
    const out = new Uint8Array(stride);

    for (let x = 0; x < stride; x++) {
      const c = row[x] ?? 0;
      const left = x >= bpp ? out[x - bpp]! : 0;
      const up = prev[x] ?? 0;
      const upLeft = x >= bpp ? prev[x - bpp]! : 0;
      let v: number;
      switch (filterType) {
        case 0: v = c; break;
        case 1: v = (c + left) & 0xff; break;
        case 2: v = (c + up) & 0xff; break;
        case 3: v = (c + Math.floor((left + up) / 2)) & 0xff; break;
        case 4: v = (c + paethPredictor(left, up, upLeft)) & 0xff; break;
        default: v = c;
      }
      out[x] = v;
    }

    for (let px = 0; px < width; px++) {
      const src = px * bpp;
      const dst = (y * width + px) * 4;
      result[dst] = out[src]!;
      result[dst + 1] = out[src + 1]!;
      result[dst + 2] = out[src + 2]!;
      result[dst + 3] = bpp === 4 ? out[src + 3]! : 255;
    }
    prev.set(out);
  }

  return { width, height, data: result };
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// ── Tone-graded expected colors ──────────────────────────────────────────────
// The world container renders through the grade-C color matrix and a
// screen-fixed aerial haze gradient (top 20% opacity → 0% at 55% height), so
// on-screen colors differ from raw asset colors. E2E pixel matching must
// compare against the tone-graded color at the pixel's vertical position.
// The transform is static, so a per-row lookup table is precomputed here.

/** Per-row expected on-screen color for a raw world-space sRGB color. */
export function buildRowExpectedColors(base: Rgb, height: number): Rgb[] {
  const rows: Rgb[] = new Array(height);
  for (let y = 0; y < height; y++) {
    rows[y] = expectedScreenColor(base, y, height);
  }
  return rows;
}

/**
 * Count pixels that match the overlay.cell.selected fallback color (#f0c86a,
 * tone-graded to ~#f4cf83 mid-screen) with tolerance=15. At tol=15: tenshu and
 * other legitimate sprites have 0 matching pixels; the overlay.cell.selected
 * itself has ~240 matching pixels. In the initial uninteracted game state this
 * overlay should never appear; any occurrence indicates a missing asset
 * fallback.
 */
export function countFallbackPixels(png: PngData): number {
  return countFallbackPixelsDebug(png).count;
}

// Minimum connected-component size to be counted as a fallback sprite.
// An actual overlay.cell.selected fallback renders ~240 adjacent pixels;
// legitimate sprites (gold trim, sunlit wood) can produce clusters up to
// ~10px, so the floor sits well above noise and well below a real hit.
const MIN_FALLBACK_CLUSTER = 40;

// Raw fallback texture color #f0c86a; matched on screen after tone grading.
const FALLBACK_BASE_RGB: Rgb = { r: 0xf0, g: 0xc8, b: 0x6a };
const FALLBACK_TOLERANCE = 15;

export function countFallbackPixelsDebug(png: PngData): { count: number; samples: Array<{ x: number; y: number; r: number; g: number; b: number }> } {
  const { data, width, height } = png;

  // Build a boolean map of candidate pixels: tone-graded #f0c86a ±15
  // (haze-adjusted per row), alpha > 80.
  const rowExpected = buildRowExpectedColors(FALLBACK_BASE_RGB, height);
  const candidates = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    const expected = rowExpected[Math.floor(i / 4 / width)]!;
    if (
      a > 80 &&
      Math.abs(r - expected.r) < FALLBACK_TOLERANCE &&
      Math.abs(g - expected.g) < FALLBACK_TOLERANCE &&
      Math.abs(b - expected.b) < FALLBACK_TOLERANCE
    ) {
      candidates[i / 4] = 1;
    }
  }

  // Find connected components (4-connectivity) and only count those with
  // size >= MIN_FALLBACK_CLUSTER. Small clusters are terrain edge artifacts.
  const visited = new Uint8Array(width * height);
  let count = 0;
  const samples: Array<{ x: number; y: number; r: number; g: number; b: number }> = [];

  for (let startIdx = 0; startIdx < width * height; startIdx++) {
    if (!candidates[startIdx] || visited[startIdx]) continue;

    // BFS to find the full connected component
    const component: number[] = [];
    const queue = [startIdx];
    visited[startIdx] = 1;
    while (queue.length > 0) {
      const idx = queue.pop()!;
      component.push(idx);
      const px = idx % width;
      const py = Math.floor(idx / width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (candidates[nIdx] && !visited[nIdx]) {
            visited[nIdx] = 1;
            queue.push(nIdx);
          }
        }
      }
    }

    if (component.length >= MIN_FALLBACK_CLUSTER) {
      count += component.length;
      if (samples.length < 20) {
        for (const idx of component.slice(0, 20 - samples.length)) {
          const px = idx % width;
          const py = Math.floor(idx / width);
          const i = idx * 4;
          samples.push({ x: px, y: py, r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
        }
      }
    }
  }
  return { count, samples };
}

// ── Cell → screen coordinate helper ────────────────────────────────────────

export async function cellToScreen(
  page: Page,
  cell: { x: number; y: number }
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    (c) => window.__asamaTest?.cellToScreenPoint(c) ?? null,
    cell
  );
}

// ── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const _REPO_ROOT = REPO_ROOT;
