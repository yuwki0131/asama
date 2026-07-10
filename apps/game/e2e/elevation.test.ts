/**
 * P4b elevation rendering + interaction on the dev elevation fixture
 * (`?scenario=elevation-fixture`, apps/game/src/dev/elevationFixtureScenario.ts):
 *
 *   (1) the fixture boots with terraces/slopes in the snapshot map,
 *   (2) screenshots of the terraced hill (fallback cliff polygons + slopes +
 *       a unit standing on the summit) are saved for visual inspection,
 *   (3) no gold missing-asset fallback appears around the cliffs,
 *   (4) clicking a unit on the summit (screen position lifted 72px) selects it,
 *   (5) a move order onto the level-1 terrace routes up the slopes and arrives,
 *   (6) the build tool places a building on the level-2 terrace via a click
 *       at the lifted cell position (hit-test + preview + placement).
 *
 * Run standalone:
 *   pnpm --filter @asama/game exec vitest run --config vitest.e2e.config.ts e2e/elevation
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import {
  cellToScreen,
  countFallbackPixels,
  getConsoleMsgs,
  launchBrowser,
  newPage,
  openGame,
  parsePng,
  _REPO_ROOT
} from "./helpers";

let browser: Browser;
let page: Page;

const OUT_DIR = join(_REPO_ROOT, "assets/intermediate/spike");

// Fixture landmarks (see elevationFixtureScenario.ts).
const SUMMIT_ARCHER_CELL = { x: 39, y: 58 }; // level 3
const BASE_SPEAR_CELL = { x: 40, y: 72 }; // level 0
const TERRACE_MOVE_TARGET = { x: 37, y: 66 }; // level 1
const TERRACE_BUILD_CELL = { x: 36, y: 60 }; // level 2 (ishigaki)
const HILL_VIEW_CELL = { x: 40, y: 63 };

beforeAll(async () => {
  browser = await launchBrowser();
  const result = await newPage(browser);
  page = result.page;
  await openGame(page, "?scenario=elevation-fixture");
  await page.evaluate(() => window.__asamaTest?.setSpeed(4));
  // The DEV alignment overlay draws gold (0xffd166) footprint diamonds that
  // trip the missing-asset gold-pixel detector; turn it off for screenshots.
  await page.getByRole("button", { name: "Debug" }).click();
  await waitForSceneRender();
});

/** Asset loading + first terrain build can take several seconds on a cold
 *  dev server; poll until most of the canvas differs from the empty clear
 *  color (#1c2227; terrain is much brighter even through the tone grade). */
async function waitForSceneRender(timeoutMs = 30_000): Promise<void> {
  const canvas = page.locator(".game-view canvas:not(.minimap)");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const png = parsePng(await canvas.screenshot({ type: "png" }));
    let content = 0;
    let sampled = 0;
    // Sample every 16th pixel; brightness well above the clear color = content.
    for (let i = 0; i < png.data.length; i += 64) {
      sampled += 1;
      if (png.data[i]! + png.data[i + 1]! + png.data[i + 2]! > 160) content += 1;
    }
    if (content / sampled > 0.3) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Scene did not render terrain within ${timeoutMs}ms`);
}

afterAll(async () => {
  await browser?.close();
});

function noErrors(): string[] {
  return getConsoleMsgs(page).filter(
    (m) =>
      m.startsWith("[error]") &&
      !m.includes("favicon.ico") &&
      !m.includes(":3000") &&
      !m.includes("/api/")
  );
}

async function centerOnHill(): Promise<void> {
  await page.evaluate((cell) => window.__asamaTest?.jumpCameraToCell(cell), HILL_VIEW_CELL);
  await page.waitForTimeout(600);
}

describe("elevation: fixture boot", () => {
  it("boots the elevation fixture with terraces and slopes in the snapshot", async () => {
    const summary = await page.evaluate(() => {
      const snap = window.__asamaTest?.getSnapshot();
      if (!snap) throw new Error("no snapshot");
      const cells = snap.map.cells;
      const at = (x: number, y: number) => cells[y * snap.map.width + x];
      return {
        cellCount: cells.length,
        maxElevation: Math.max(...cells.map((c) => c.elevation)),
        slopeCount: cells.filter((c) => c.slope !== null).length,
        summit: at(39, 58)?.elevation,
        summitSkin: at(39, 58)?.elevationSkin,
        units: snap.units.length
      };
    });
    expect(summary.cellCount).toBeGreaterThan(0);
    expect(summary.maxElevation).toBe(3);
    expect(summary.slopeCount).toBe(6);
    expect(summary.summit).toBe(3);
    expect(summary.summitSkin).toBe("ishigaki");
    expect(summary.units).toBe(4);
  });
});

describe("elevation: terraced hill rendering", () => {
  it("screenshot: terraces + fallback cliff polygons + slopes + summit unit", async () => {
    await centerOnHill();
    const canvas = page.locator(".game-view canvas:not(.minimap)");
    const buf = await canvas.screenshot({ type: "png" });
    mkdirSync(OUT_DIR, { recursive: true });
    const path = join(OUT_DIR, "elevation-terraces.png");
    writeFileSync(path, buf);
    console.log(`[elevation] screenshot saved: ${path}`);

    // Cliff walls must use the dedicated fallback polygons, never the gold
    // missing-asset sprite.
    const png = parsePng(buf);
    expect(countFallbackPixels(png), "gold missing-asset fallback visible around the hill").toBe(0);
    expect(noErrors(), "console errors during terraced hill render").toHaveLength(0);
  });
});

describe("elevation: interaction on high ground", () => {
  it("click-selects the archer standing on the level-3 summit", async () => {
    await centerOnHill();
    const point = await cellToScreen(page, SUMMIT_ARCHER_CELL);
    expect(point).not.toBeNull();
    await page.mouse.click(point!.x, point!.y);

    const selected = await page.evaluate(async () => {
      const bridge = window.__asamaTest;
      if (!bridge) return null;
      const tick = bridge.getSnapshot()?.currentTick ?? 0;
      await bridge.waitForTick(tick + 3);
      const snap = bridge.getSnapshot();
      return snap?.units.filter((u) => u.selected).map((u) => ({ type: u.type, x: u.position.x, y: u.position.y })) ?? null;
    });
    expect(selected).toEqual([{ type: "archer", x: SUMMIT_ARCHER_CELL.x, y: SUMMIT_ARCHER_CELL.y }]);

    // Close-up screenshot: 2x zoom on the summit with the selection ring on
    // the lifted unit (wheel-up steps 1 → 1.25 → 1.5 → 2).
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.move(point!.x, point!.y);
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(500);
    const canvas = page.locator(".game-view canvas:not(.minimap)");
    const buf = await canvas.screenshot({ type: "png" });
    mkdirSync(OUT_DIR, { recursive: true });
    const path = join(OUT_DIR, "elevation-summit-selection.png");
    writeFileSync(path, buf);
    console.log(`[elevation] screenshot saved: ${path}`);
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(120);
    }
  });

  it("orders a base unit up the slopes onto the level-1 terrace", async () => {
    await centerOnHill();
    // Select the spearman at the base of the hill…
    const spearPoint = await cellToScreen(page, BASE_SPEAR_CELL);
    expect(spearPoint).not.toBeNull();
    await page.mouse.click(spearPoint!.x, spearPoint!.y);
    const spearId = await page.evaluate(async () => {
      const bridge = window.__asamaTest;
      if (!bridge) return null;
      const tick = bridge.getSnapshot()?.currentTick ?? 0;
      await bridge.waitForTick(tick + 3);
      return bridge.getSnapshot()?.units.find((u) => u.selected)?.id ?? null;
    });
    expect(spearId, "base spearman was not selected").not.toBeNull();

    // …then right-click the terrace cell (drawn 24px above its flat position).
    const target = await cellToScreen(page, TERRACE_MOVE_TARGET);
    expect(target).not.toBeNull();
    await page.mouse.click(target!.x, target!.y, { button: "right" });

    // The order must not be rejected as unreachable/invalid.
    const orderState = await page.evaluate(async (id) => {
      const bridge = window.__asamaTest;
      if (!bridge) return null;
      const tick = bridge.getSnapshot()?.currentTick ?? 0;
      await bridge.waitForTick(tick + 3);
      const snap = bridge.getSnapshot();
      const unit = snap?.units.find((u) => u.id === id);
      return {
        destination: unit?.destination ?? null,
        invalidMoveTarget: snap?.invalidMoveTarget ?? null
      };
    }, spearId);
    expect(orderState?.invalidMoveTarget).toBeNull();
    expect(orderState?.destination).not.toBeNull();

    // Poll until the unit stands on elevation ≥ 1 near the target (it must
    // climb the 0→1 slope; uphill steps run slower per the contract).
    const deadline = Date.now() + 40_000;
    let arrived: { x: number; y: number; elevation: number } | null = null;
    while (Date.now() < deadline) {
      await page.evaluate(() => window.__asamaTest?.setSpeed(4));
      const state = await page.evaluate((id) => {
        const snap = window.__asamaTest?.getSnapshot();
        const unit = snap?.units.find((u) => u.id === id);
        if (!snap || !unit) return null;
        const cell = snap.map.cells[unit.position.y * snap.map.width + unit.position.x];
        return { x: unit.position.x, y: unit.position.y, elevation: cell?.elevation ?? 0, moving: unit.path.length > 0 };
      }, spearId);
      if (
        state !== null &&
        !state.moving &&
        state.elevation >= 1 &&
        Math.abs(state.x - TERRACE_MOVE_TARGET.x) <= 2 &&
        Math.abs(state.y - TERRACE_MOVE_TARGET.y) <= 2
      ) {
        arrived = state;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(arrived, "spearman never arrived on the level-1 terrace").not.toBeNull();
  });

  it("places a wall on the level-2 terrace via a click at the lifted cell", async () => {
    await centerOnHill();
    await page.getByRole("button", { name: "壁" }).click();
    const point = await cellToScreen(page, TERRACE_BUILD_CELL);
    expect(point).not.toBeNull();
    await page.mouse.click(point!.x, point!.y);

    const wall = await page.evaluate(async (cell) => {
      const bridge = window.__asamaTest;
      if (!bridge) return null;
      const tick = bridge.getSnapshot()?.currentTick ?? 0;
      await bridge.waitForTick(tick + 3);
      const snap = bridge.getSnapshot();
      const building = snap?.buildings.find(
        (b) => b.type === "wall" && b.position.x === cell.x && b.position.y === cell.y
      );
      if (!building || !snap) return null;
      const terrain = snap.map.cells[cell.y * snap.map.width + cell.x];
      return { elevation: terrain?.elevation ?? 0 };
    }, TERRACE_BUILD_CELL);
    expect(wall, "wall was not placed on the clicked terrace cell").not.toBeNull();
    expect(wall?.elevation).toBe(2);

    // Back to select mode + final overview screenshot with the selection ring
    // and the new wall on the terrace.
    await page.mouse.click(point!.x, point!.y, { button: "right" });
    await page.waitForTimeout(300);
    const canvas = page.locator(".game-view canvas:not(.minimap)");
    const buf = await canvas.screenshot({ type: "png" });
    mkdirSync(OUT_DIR, { recursive: true });
    const path = join(OUT_DIR, "elevation-interaction.png");
    writeFileSync(path, buf);
    console.log(`[elevation] screenshot saved: ${path}`);

    expect(noErrors(), "console errors during elevation interaction").toHaveLength(0);
  });
});
