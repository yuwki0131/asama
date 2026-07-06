/**
 * Regression test: no bright yellow-green seam lines on water (river) tiles.
 *
 * The fix merged all terrain underlay diamonds into a single Graphics layer
 * so that chunk-boundary anti-aliasing seams cannot produce bright artifacts.
 * This test screenshots the river area (cells ~32-48 x 30-44) and asserts that
 * no bright yellow-green pixel cluster appears (the telltale sign of the seam).
 *
 * Run standalone:
 *   pnpm --filter game test:e2e:river-seam
 * (or via vitest: vitest run --config vitest.e2e.config.ts e2e/river-seam.test.ts)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { cellToScreen, launchBrowser, newPage, openGame, parsePng, _REPO_ROOT } from "./helpers";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchBrowser();
  const result = await newPage(browser);
  page = result.page;
  await openGame(page);
  await page.evaluate(() => window.__asamaTest?.setSpeed(0));
  await page.waitForTimeout(800);
});

afterAll(async () => {
  await browser?.close();
});

/**
 * Count bright yellow-green pixels (#a0b050 ±20, alpha > 128) that form a
 * diagonal line cluster.  A "cluster" requires ≥ LINE_MIN_LENGTH adjacent
 * pixels following a diagonal direction (±1 in both x and y per step).
 * Small isolated bright pixels (sun-lit ground noise) are ignored.
 */
function countYellowGreenLinePixels(
  data: Uint8Array,
  width: number,
  height: number
): { count: number; samples: Array<{ x: number; y: number }> } {
  const R_TARGET = 0xa0; // 160
  const G_TARGET = 0xb0; // 176
  const B_TARGET = 0x50; // 80
  const TOL = 20;
  const LINE_MIN_LENGTH = 8; // contiguous diagonal run to count as a seam line

  // Build candidate map
  const cand = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (
      a > 128 &&
      Math.abs(r - R_TARGET) <= TOL &&
      Math.abs(g - G_TARGET) <= TOL &&
      Math.abs(b - B_TARGET) <= TOL
    ) {
      cand[i / 4] = 1;
    }
  }

  // Scan for diagonal runs (NE-SW and NW-SE directions)
  const counted = new Uint8Array(width * height);
  let count = 0;
  const samples: Array<{ x: number; y: number }> = [];

  // Check diagonal direction (dx, dy) for runs of length >= LINE_MIN_LENGTH
  for (const [dx, dy] of [
    [1, 1],
    [1, -1]
  ] as [number, number][]) {
    for (let sy = 0; sy < height; sy++) {
      for (let sx = 0; sx < width; sx++) {
        if (!cand[sy * width + sx] || counted[sy * width + sx]) continue;
        // Trace forward
        const run: number[] = [];
        let cx = sx;
        let cy = sy;
        while (cx >= 0 && cx < width && cy >= 0 && cy < height && cand[cy * width + cx]) {
          run.push(cy * width + cx);
          cx += dx;
          cy += dy;
        }
        if (run.length >= LINE_MIN_LENGTH) {
          for (const idx of run) {
            if (!counted[idx]) {
              counted[idx] = 1;
              count++;
              if (samples.length < 20) {
                samples.push({ x: idx % width, y: Math.floor(idx / width) });
              }
            }
          }
        }
      }
    }
  }

  return { count, samples };
}

describe("river seam regression", () => {
  it("no bright yellow-green seam lines on water tiles near river (cells 32-48, 30-44)", async () => {
    // Navigate camera toward the river area (cells ~32-48, 30-44).
    // The river is above the default start position (cell 64,64) in isometric
    // world space.  Pressing ArrowUp 13 times (×64 px/step = 832 px) scrolls
    // the camera up far enough to bring the river into view.
    const canvas = page.locator(".game-view canvas:not(.minimap)");
    await canvas.click(); // focus the canvas so keyboard events reach it
    for (let i = 0; i < 13; i++) {
      await page.keyboard.press("ArrowUp");
    }
    // Also pan slightly right to centre on the river corridor.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowRight");
    }
    await page.waitForTimeout(300);

    const screenshotBuf = await canvas.screenshot({ type: "png" });
    const png = parsePng(screenshotBuf);

    // Save screenshot for visual inspection.
    const outDir = join(_REPO_ROOT, "assets/intermediate/spike");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "river-corner-zoom.png"), screenshotBuf);

    const { count, samples } = countYellowGreenLinePixels(png.data, png.width, png.height);

    if (count > 0) {
      console.log(
        `DEBUG river-seam: ${count} yellow-green line pixels found. Samples:`,
        samples.slice(0, 8)
      );
    }

    expect(
      count,
      `Found ${count} bright yellow-green seam-line pixels in the river screenshot — ` +
        "terrain chunk boundary seam is still present"
    ).toBe(0);
  });
});
