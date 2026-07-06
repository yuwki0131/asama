/**
 * E2E Phase 2: Monkey test.
 *
 * Injects random operations (bridge commands + page interactions) for a fixed
 * duration at 4x speed and verifies:
 *   - No JavaScript crashes (snapshot still readable after the run)
 *   - Zero unexpected console errors
 *   - Simulation worker still alive (tick is advancing)
 *   - JS heap growth within limits
 *
 * Run: SEED=<number> pnpm test:e2e:monkey
 * CI: not included (夜間/手動用).  Use the short 60-second wall-time variant.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { chromium } from "playwright-core";
import { DEV_URL, newPage, openGame, getConsoleMsgs } from "./helpers";

// Duration of the monkey run in real milliseconds.
// Default: 60 s (short version for local verification).
// Override via MONKEY_DURATION_MS env var for longer runs.
const MONKEY_DURATION_MS = parseInt(process.env["MONKEY_DURATION_MS"] ?? "60000", 10);
const SEED = parseInt(process.env["SEED"] ?? "42", 10);

// Heap growth limit for the monkey run (bytes).  200 MB is generous for 60 s.
const HEAP_GROWTH_LIMIT_BYTES = 200 * 1024 * 1024;

// ── Seeded LCG PRNG ─────────────────────────────────────────────────────────

class Lcg {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    this.s = (Math.imul(1664525, this.s) + 1013904223) >>> 0;
    return this.s / 0x100000000;
  }
  int(max: number): number { return Math.floor(this.next() * max); }
  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)]!; }
  range(lo: number, hi: number): number { return lo + this.int(hi - lo + 1); }
}

// ── Browser setup ───────────────────────────────────────────────────────────

const CHROMIUM_BIN = process.env["ASAMA_CHROMIUM_BIN"] ?? "/run/current-system/sw/bin/chromium";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({
    executablePath: CHROMIUM_BIN,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--enable-precise-memory-info", // enables performance.memory in headless mode
    ],
    headless: true,
  });
  const result = await newPage(browser);
  page = result.page;
  await openGame(page);
});

afterAll(async () => {
  await browser?.close();
});

// ── Monkey test ─────────────────────────────────────────────────────────────

describe("monkey: random ops injection", () => {
  it(`runs ${MONKEY_DURATION_MS / 1000}s monkey (SEED=${SEED}) with no crashes or errors`, async () => {
    const rng = new Lcg(SEED);

    // Set 4x speed
    await page.evaluate(() => window.__asamaTest?.setSpeed(4));

    // Measure heap before (performance.memory is Chrome-specific)
    const heapBefore = await page.evaluate(
      () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
    );

    // Get canvas bounding box for click/drag actions
    const canvasBox = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".game-view canvas:not(.minimap)");
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });

    const UNIT_TYPES = ["spear_ashigaru", "archer", "sword_ashigaru", "engineer", "cavalry", "musketeer"] as const;
    const MARKET_TRADES = ["buyFood", "sellFood", "buyWeapons"] as const;
    const KEYS = ["Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const;
    // Map cells 10-90 (inner safe zone)
    const MAP_RANGE: [number, number] = [10, 90];

    const deadline = Date.now() + MONKEY_DURATION_MS;

    let navigationUrl = "";
    page.once("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        navigationUrl = frame.url();
      }
    });

    let actionCount = 0;
    let pageCrashMsg = "";
    while (Date.now() < deadline) {
      const choice = rng.int(10);

      try {
        if (choice < 4) {
          // Bridge: move/attack-move all player units to random cell
          const cellX = rng.range(...MAP_RANGE);
          const cellY = rng.range(...MAP_RANGE);
          const attackMove = rng.int(2) === 0;
          await page.evaluate(
            ({ cellX, cellY, attackMove }: { cellX: number; cellY: number; attackMove: boolean }) => {
              const bridge = window.__asamaTest;
              if (!bridge) return;
              const snap = bridge.getSnapshot();
              if (!snap) return;
              const ids = snap.units.filter(u => u.owner === "player").map(u => u.id);
              if (!ids.length) return;
              const tick = snap.currentTick;
              const dest = { x: cellX, y: cellY };
              bridge.enqueue({ type: "selectUnits", unitIds: ids, issuedAtTick: tick, clientSequence: Date.now() });
              if (attackMove) {
                bridge.enqueue({ type: "attackMoveUnits", unitIds: ids, destination: dest, issuedAtTick: tick, clientSequence: Date.now() + 1 });
              } else {
                bridge.enqueue({ type: "moveUnits", unitIds: ids, destination: dest, issuedAtTick: tick, clientSequence: Date.now() + 1 });
              }
            },
            { cellX, cellY, attackMove }
          );
        } else if (choice === 4) {
          // Bridge: stop all player units
          await page.evaluate(() => {
            const bridge = window.__asamaTest;
            if (!bridge) return;
            const snap = bridge.getSnapshot();
            if (!snap) return;
            const ids = snap.units.filter(u => u.owner === "player").map(u => u.id);
            if (!ids.length) return;
            bridge.enqueue({ type: "stopUnits", unitIds: ids, issuedAtTick: snap.currentTick, clientSequence: Date.now() });
          });
        } else if (choice === 5) {
          // Bridge: recruit random unit type (may be rejected if insufficient resources)
          const unitType = rng.pick(UNIT_TYPES);
          await page.evaluate(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ unitType }: { unitType: string }) => {
              const bridge = window.__asamaTest;
              if (!bridge) return;
              const snap = bridge.getSnapshot();
              if (!snap) return;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              bridge.enqueue({ type: "recruitUnit", unitType: unitType as any, issuedAtTick: snap.currentTick, clientSequence: Date.now() });
            },
            { unitType }
          );
        } else if (choice === 6) {
          // Bridge: market trade (may be rejected)
          const trade = rng.pick(MARKET_TRADES);
          await page.evaluate(
            ({ trade }: { trade: string }) => {
              const bridge = window.__asamaTest;
              if (!bridge) return;
              const snap = bridge.getSnapshot();
              if (!snap) return;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              bridge.enqueue({ type: "marketTrade", trade: trade as any, issuedAtTick: snap.currentTick, clientSequence: Date.now() });
            },
            { trade }
          );
        } else if (choice === 7) {
          // Bridge: place a wall at random position (may be rejected)
          const cellX = rng.range(...MAP_RANGE);
          const cellY = rng.range(...MAP_RANGE);
          await page.evaluate(
            ({ cellX, cellY }: { cellX: number; cellY: number }) => {
              const bridge = window.__asamaTest;
              if (!bridge) return;
              const snap = bridge.getSnapshot();
              if (!snap) return;
              bridge.enqueue({ type: "placeBuilding", buildingType: "wall", position: { x: cellX, y: cellY }, issuedAtTick: snap.currentTick, clientSequence: Date.now() });
            },
            { cellX, cellY }
          );
        } else if (choice === 8 && canvasBox !== null) {
          // Click random position on canvas
          const cx = canvasBox.x + rng.range(10, canvasBox.width - 10);
          const cy = canvasBox.y + rng.range(10, canvasBox.height - 10);
          const rightClick = rng.int(3) === 0;
          await page.mouse.click(cx, cy, { button: rightClick ? "right" : "left" });
        } else {
          // Key press
          const key = rng.pick(KEYS);
          await page.keyboard.press(key);
        }
      } catch (err) {
        // Page context destroyed (browser crash / navigation).  Record and stop loop.
        pageCrashMsg = String(err);
        break;
      }

      actionCount++;
      // ~1 action per second to keep the game manageable
      await new Promise(r => setTimeout(r, 1000));
    } // end while

    expect(navigationUrl, `page navigated during monkey run to: ${navigationUrl}`).toBe("");
    expect(pageCrashMsg, `page crashed during monkey run: ${pageCrashMsg}`).toBe("");

    // ── Assertions ──────────────────────────────────────────────────────────

    // 1. Worker still alive: snapshot is non-null and either advancing or
    //    concluded with a valid outcome (tick freezes after game-over by design).
    const snapA = await page.evaluate(() => {
      const s = window.__asamaTest?.getSnapshot();
      return s ? { tick: s.currentTick, hasOutcome: s.outcome != null } : null;
    });
    expect(snapA, "snapshot should be readable after monkey run").not.toBeNull();

    await new Promise(r => setTimeout(r, 2500)); // wait ~200 ticks at 4x

    const snapB = await page.evaluate(() => {
      const s = window.__asamaTest?.getSnapshot();
      return s ? { tick: s.currentTick, hasOutcome: s.outcome != null } : null;
    });
    expect(snapB, "snapshot should still be readable").not.toBeNull();

    const tickA = snapA!.tick;
    const tickB = snapB!.tick;

    if (!snapB!.hasOutcome) {
      // Game still running: tick must advance.
      expect(tickB, `tick should advance (was ${tickA}, now ${tickB})`).toBeGreaterThan(tickA);
    } else {
      // Game concluded (honmaru_fallen / starvation / supply_cut / time_held):
      // tick freezes by design.  The worker is alive if snapshot is readable.
      console.log(`monkey: game concluded (outcome set) at tick ${tickB}`);
    }

    // 2. No unexpected console errors
    const consoleMsgs = getConsoleMsgs(page);
    const unexpectedErrors = consoleMsgs.filter(
      m =>
        m.startsWith("[error]") &&
        !m.includes("favicon.ico") &&
        !m.includes("127.0.0.1:3000") &&
        !m.includes("/api/") &&
        !m.includes(":3000")
    );
    expect(
      unexpectedErrors,
      `Unexpected console errors:\n${unexpectedErrors.join("\n")}`
    ).toHaveLength(0);

    // 3. Heap growth within limit (performance.memory may be 0 if unavailable)
    const heapAfter = await page.evaluate(
      () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
    );
    if (heapBefore > 0 && heapAfter > 0) {
      const growth = heapAfter - heapBefore;
      expect(
        growth,
        `JS heap grew ${(growth / 1024 / 1024).toFixed(1)} MB, limit ${HEAP_GROWTH_LIMIT_BYTES / 1024 / 1024} MB`
      ).toBeLessThan(HEAP_GROWTH_LIMIT_BYTES);
    }

    console.log(
      `monkey: ${actionCount} actions, ` +
      `tick ${tickA}→${tickB}${snapB!.hasOutcome ? " (game over)" : ""}, ` +
      `heap ${(heapBefore / 1024 / 1024).toFixed(0)}→${(heapAfter / 1024 / 1024).toFixed(0)} MB`
    );
  }, MONKEY_DURATION_MS + 30_000); // test timeout = run duration + 30 s margin
});
