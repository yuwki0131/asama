/**
 * Visual regression: isometric Y-sort with footprint rectangles.
 *
 * Saves screenshots of the game scene for human inspection to verify that
 * the isometric painter's order is correct after the footprint-rect sort fix:
 *   (a) Default view near the tenshu — trees/decorations at the south edge
 *       must appear in FRONT of (on top of) the building, not hidden behind it.
 *   (b) View near walls adjacent to multi-cell buildings — walls to the south
 *       of a building must appear in front.
 *
 * The test does not assert pixel values — it saves PNGs for visual inspection
 * and fails only on console errors during rendering.
 *
 * Run standalone:
 *   pnpm --filter game test:e2e ysort
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchBrowser, newPage, openGame, getConsoleMsgs, _REPO_ROOT } from "./helpers";

let browser: Browser;
let page: Page;

const OUT_DIR = join(_REPO_ROOT, "assets/intermediate/spike");

beforeAll(async () => {
  browser = await launchBrowser();
  const result = await newPage(browser);
  page = result.page;
  await openGame(page);
  await page.evaluate(() => window.__asamaTest?.setSpeed(0));
  await page.waitForTimeout(600);
});

afterAll(async () => {
  await browser?.close();
});

function noErrors(page: Page): string[] {
  return getConsoleMsgs(page).filter(
    (m) =>
      m.startsWith("[error]") &&
      !m.includes("favicon.ico") &&
      !m.includes(":3000") &&
      !m.includes("/api/")
  );
}

describe("ysort: isometric painter's order visual check", () => {
  it("(a) screenshot: tenshu south edge — decorations must be in front of the building", async () => {
    // Navigate toward the tenshu. The tenshu is typically in the upper-left part of the
    // scenario map; pressing ArrowUp/Left brings it into view from the default start.
    const canvas = page.locator(".game-view canvas:not(.minimap)");
    await canvas.click();

    // Pan toward the tenshu using the keyboard (same technique as river-seam.test.ts).
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowUp");
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(400);

    const buf = await canvas.screenshot({ type: "png" });
    mkdirSync(OUT_DIR, { recursive: true });
    const path = join(OUT_DIR, "ysort-a-tenshu-south.png");
    writeFileSync(path, buf);
    console.log(`[ysort-a] screenshot saved: ${path}`);

    expect(noErrors(page), `Console errors during ysort-a render`).toHaveLength(0);
  });

  it("(b) screenshot: wall/building boundary — walls south of building must be in front", async () => {
    // Pan back toward centre then slightly right and down to find walls near buildings.
    const canvas = page.locator(".game-view canvas:not(.minimap)");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);

    const buf = await canvas.screenshot({ type: "png" });
    const path = join(OUT_DIR, "ysort-b-wall-building.png");
    writeFileSync(path, buf);
    console.log(`[ysort-b] screenshot saved: ${path}`);

    expect(noErrors(page), `Console errors during ysort-b render`).toHaveLength(0);
  });
});
