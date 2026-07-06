/**
 * Visual regression screenshots for all four scenarios.
 *
 * Each test opens the game with the target scenario, waits for the scene to
 * render (up to 30s), then saves a PNG to:
 *   assets/intermediate/spike/visual-regression/{scenarioId}.png
 *
 * These are reference screenshots, not pixel-exact comparisons — use them for
 * manual inspection and to confirm that each scenario (especially mountain-castle
 * with its high-ground elevation stacking) renders without major artefacts.
 *
 * Run standalone:
 *   pnpm --filter @asama/game exec vitest run --config vitest.e2e.config.ts e2e/visual-regression
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import {
  countFallbackPixels,
  launchBrowser,
  newPage,
  openGame,
  parsePng,
  _REPO_ROOT,
} from "./helpers";

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser?.close();
});

const OUT_DIR = join(_REPO_ROOT, "assets/intermediate/spike/visual-regression");

/** Wait until the canvas has meaningful content (terrain rendered). */
async function waitForSceneRender(
  page: import("playwright-core").Page,
  timeoutMs = 30_000
): Promise<void> {
  const canvas = page.locator(".game-view canvas:not(.minimap)");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const png = parsePng(await canvas.screenshot({ type: "png" }));
    let content = 0;
    let sampled = 0;
    // Sample every 16th pixel; brightness above the clear color = content loaded.
    for (let i = 0; i < png.data.length; i += 64) {
      sampled += 1;
      if ((png.data[i] ?? 0) + (png.data[i + 1] ?? 0) + (png.data[i + 2] ?? 0) > 160) content += 1;
    }
    if (content / sampled > 0.3) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Scene did not render terrain within ${timeoutMs}ms`);
}

const SCENARIOS: Array<{ scenarioId: string; label: string }> = [
  { scenarioId: "concentric-castle",  label: "環郭の城" },
  { scenarioId: "linear-fortress",    label: "連郭の城" },
  { scenarioId: "riverside-defense",  label: "川沿いの城" },
  { scenarioId: "mountain-castle",    label: "霞ヶ峰城 (高低差)" },
];

for (const { scenarioId, label } of SCENARIOS) {
  describe(`visual-regression: ${label} (${scenarioId})`, () => {
    it(
      `saves screenshot and confirms zero fallback sprites — ${scenarioId}`,
      async () => {
        const { page } = await newPage(browser);
        try {
          await openGame(page, `?scenario=${scenarioId}`);
          // Pause to let the renderer settle; terrain and buildings fully appear.
          await page.evaluate(() => window.__asamaTest?.setSpeed(0));
          // The DEV alignment overlay draws gold (0xffd166) footprint diamonds
          // that trip the missing-asset gold-pixel detector; turn it off before
          // taking screenshots (same fix as elevation.test.ts).
          await page.getByRole("button", { name: "Debug" }).click();
          await waitForSceneRender(page, 30_000);
          await page.waitForTimeout(2_000);

          const canvas = page.locator(".game-view canvas:not(.minimap)");
          const buf = await canvas.screenshot({ type: "png" });

          mkdirSync(OUT_DIR, { recursive: true });
          const outPath = join(OUT_DIR, `${scenarioId}.png`);
          writeFileSync(outPath, buf);
          console.log(`[visual-regression] saved: ${outPath}`);

          // Confirm no fallback (missing-asset) sprites are visible.
          const png = parsePng(buf);
          const fallbackCount = countFallbackPixels(png);
          expect(
            fallbackCount,
            `${scenarioId}: ${fallbackCount} fallback-colored pixels — a sprite is rendering with the gold missing-asset texture`
          ).toBe(0);
        } finally {
          await page.close();
        }
      },
      90_000
    );
  });
}
