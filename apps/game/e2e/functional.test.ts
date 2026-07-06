import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import {
  cellToScreen,
  launchBrowser,
  newPage,
  openGame
} from "./helpers";

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser?.close();
});

// Each test gets a fresh page to start from a clean initial state.
async function freshPage(): Promise<Page> {
  const { page } = await newPage(browser);
  await openGame(page);
  // Speed 4x for faster tick progression in tests.
  await page.evaluate(() => window.__asamaTest?.setSpeed(4));
  return page;
}

// ── Test 1: Move all player units ──────────────────────────────────────────

describe("functional: move all units", () => {
  let page: Page;
  beforeEach(async () => {
    page = await freshPage();
  });
  afterAll(async () => {
    await page?.close();
  });

  it("all player units arrive near destination after moveUnits command", async () => {
    const destination = { x: 68, y: 58 }; // open terrain east of player spawn
    const formationRange = 10;

    // Get initial snapshot info
    const initial = await page.evaluate(() => {
      const snap = window.__asamaTest?.getSnapshot();
      if (!snap) throw new Error("no snapshot");
      const playerIds = snap.units.filter((u) => u.owner === "player").map((u) => u.id);
      return { playerIds, baseTick: snap.currentTick };
    });
    const { playerIds, baseTick } = initial;
    expect(playerIds.length, "No player units found").toBeGreaterThan(0);

    // Issue select + move commands
    await page.evaluate(
      ({ ids, dest, tick }) => {
        const bridge = window.__asamaTest;
        if (!bridge) throw new Error("bridge not available");
        bridge.enqueue({ type: "selectUnits", unitIds: ids, issuedAtTick: tick, clientSequence: 1 });
        bridge.enqueue({ type: "moveUnits", unitIds: ids, destination: dest, issuedAtTick: tick, clientSequence: 2 });
      },
      { ids: playerIds, dest: destination, tick: baseTick }
    );

    // Poll from Node.js until units arrive or 30s pass
    const targetTick = baseTick + 600;
    const deadline = Date.now() + 30_000;
    let unitPositions: { id: string; x: number; y: number }[] = [];

    while (Date.now() < deadline) {
      const current = await page.evaluate(
        (tgt) => {
          const snap = window.__asamaTest?.getSnapshot();
          return snap ? { tick: snap.currentTick, units: snap.units.filter((u) => u.owner === "player").map((u) => ({ id: u.id, x: u.position.x, y: u.position.y })) } : null;
        },
        targetTick
      );
      if (current && current.tick >= targetTick) {
        unitPositions = current.units;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    expect(unitPositions.length, "Snapshot never reached targetTick").toBeGreaterThan(0);

    // Only check surviving units (some may have been killed by enemies before arriving)
    const survived = unitPositions.length;
    const nearCount = unitPositions.filter(
      (u) =>
        Math.abs(u.x - destination.x) <= formationRange &&
        Math.abs(u.y - destination.y) <= formationRange
    ).length;

    expect(
      nearCount,
      `Only ${nearCount}/${survived} surviving units reached destination (started with ${playerIds.length})`
    ).toBe(survived);
  });
});

// ── Test 2: Drag-build walls ───────────────────────────────────────────────

describe("functional: drag-build walls", () => {
  let page: Page;
  beforeEach(async () => {
    page = await freshPage();
  });
  afterAll(async () => {
    await page?.close();
  });

  it("dragging wall tool across 5 cells places 5 wall buildings", async () => {
    // Click the "壁" (wall) button in the build toolbar
    await page.getByRole("button", { name: "壁" }).click();

    // Cells to drag across: {46,65}→{46,69} — open terrain south of the outer ring.
    // Using x=46 constant, y increments from 65 to 69 = 5 cells.
    const cells = [
      { x: 46, y: 65 },
      { x: 46, y: 66 },
      { x: 46, y: 67 },
      { x: 46, y: 68 },
      { x: 46, y: 69 }
    ];

    const screenPoints = await Promise.all(cells.map((c) => cellToScreen(page, c)));
    const validPoints = screenPoints.filter(
      (p): p is { x: number; y: number } => p !== null
    );
    expect(validPoints.length, "cellToScreenPoint returned null for some cells").toBe(cells.length);

    const [start, ...rest] = validPoints as [{ x: number; y: number }, ...{ x: number; y: number }[]];

    // Count walls before
    const wallsBefore = await page.evaluate(
      () => window.__asamaTest?.getSnapshot()?.buildings.filter((b) => b.type === "wall").length ?? 0
    );

    // Perform pointerdown → pointermove × 4 → pointerup
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (const pt of rest) {
      // Move in small increments to ensure the drag gesture registers each cell
      await page.mouse.move(pt.x, pt.y, { steps: 4 });
    }
    await page.mouse.up();

    // Wait for snapshot to reflect the placed buildings
    await page.evaluate(async () => {
      const bridge = window.__asamaTest;
      if (!bridge) return;
      const tick = bridge.getSnapshot()?.currentTick ?? 0;
      await bridge.waitForTick(tick + 2);
    });

    const wallsAfter = await page.evaluate(
      () => window.__asamaTest?.getSnapshot()?.buildings.filter((b) => b.type === "wall").length ?? 0
    );

    expect(wallsAfter - wallsBefore, "Expected 5 new walls to be placed").toBe(5);
  });
});

// ── Test 3: Right-click cancels build tool ─────────────────────────────────

describe("functional: right-click cancels build tool", () => {
  let page: Page;
  beforeEach(async () => {
    page = await freshPage();
  });
  afterAll(async () => {
    await page?.close();
  });

  it("right-clicking during build mode resets tool to Select (null)", async () => {
    // Select the wall build tool via the button
    await page.getByRole("button", { name: "壁" }).click();

    // Verify wall tool is now active
    const toolBefore = await page.evaluate(() => window.__asamaTest?.getBuildTool());
    expect(toolBefore).toBe("wall");

    // Right-click on the main game canvas (exclude minimap)
    const canvas = page.locator(".game-view canvas:not(.minimap)");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, {
      button: "right"
    });

    // Wait for React state to propagate
    await page.waitForTimeout(200);

    const toolAfter = await page.evaluate(() => window.__asamaTest?.getBuildTool());
    expect(toolAfter, "Build tool should revert to null (Select) after right-click").toBeNull();
  });
});
