import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import {
  countFallbackPixelsDebug,
  getConsoleMsgs,
  launchBrowser,
  newPage,
  openGame,
  parsePng
} from "./helpers";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchBrowser();
  const result = await newPage(browser);
  page = result.page;
  await openGame(page);
});

afterAll(async () => {
  await browser?.close();
});

describe("smoke: startup", () => {
  it("loads game and manifest without error", async () => {
    const msgs = getConsoleMsgs(page);
    // Filter out expected non-critical errors: Vite's API proxy failing because
    // the optional fastify dev server (port 3000) is not required for E2E tests.
    // Filter only console errors (not warnings). Exclude expected non-critical
    // failures: favicon.ico (browser auto-request, not in public dir),
    // and the /api proxy (fastify dev server is optional for E2E).
    const failed = msgs.filter(
      (m) =>
        m.startsWith("[error]") &&
        !m.includes("favicon.ico") &&
        !m.includes("127.0.0.1:3000") &&
        !m.includes("/api/") &&
        !m.includes(":3000")
    );
    expect(failed, `Console errors:\n${failed.join("\n")}`).toHaveLength(0);
  });

  it("simulation worker becomes ready (first snapshot received)", async () => {
    const snapshot = await page.evaluate(() => window.__asamaTest?.getSnapshot());
    expect(snapshot).not.toBeNull();
    expect(snapshot?.currentTick).toBeGreaterThanOrEqual(0);
  });

  it("initial snapshot has units > 0", async () => {
    const count = await page.evaluate(() => window.__asamaTest?.getSnapshot()?.units.length ?? 0);
    expect(count).toBeGreaterThan(0);
  });

  it("initial snapshot has buildings > 0", async () => {
    const count = await page.evaluate(() => window.__asamaTest?.getSnapshot()?.buildings.length ?? 0);
    expect(count).toBeGreaterThan(0);
  });

  it("no fallback sprites rendered (no overlay.cell.selected golden pixels)", async () => {
    // Speed 0 to freeze the frame, then screenshot the canvas element.
    // Wait 1s to let any in-flight animation or delayed asset state settle.
    await page.evaluate(() => window.__asamaTest?.setSpeed(0));
    await page.waitForTimeout(1000);

    // The game-view contains a minimap canvas (.minimap) and the main Pixi canvas.
    // We want the main canvas (not the minimap class one).
    const canvas = page.locator(".game-view canvas:not(.minimap)");
    const screenshotBuf = await canvas.screenshot({ type: "png" });
    const png = parsePng(screenshotBuf);
    const { count: fallbackCount, samples } = countFallbackPixelsDebug(png);

    // Restore speed
    await page.evaluate(() => window.__asamaTest?.setSpeed(1));

    if (fallbackCount > 0) {
      console.log(`DEBUG: ${fallbackCount} fallback pixels. First 10 positions:`, samples.slice(0, 10));
    }

    expect(
      fallbackCount,
      `Found ${fallbackCount} fallback-colored pixels in canvas — ` +
        "a unit or building is rendering with the overlay.cell.selected fallback texture"
    ).toBe(0);
  });
});
