import { describe, expect, it } from "vitest";
import { mvpDefenseScenario } from "@asama/content";
import { createInitialWorld, snapshotWorld } from "./index";
import type { TerrainCellSnapshot } from "@asama/shared";

const TRANSITION_RE = /^terrain\.water\.transition\.(ne|es|sw|wn)(\.v[12])?$/;

function isTransition(cell: TerrainCellSnapshot | undefined): boolean {
  return cell !== undefined && TRANSITION_RE.test(cell.assetId);
}

function isBaseRiverWater(cell: TerrainCellSnapshot | undefined): boolean {
  return cell !== undefined && cell.terrain === "water" && !isTransition(cell);
}

describe("river transition corners", () => {
  const snapshot = snapshotWorld(createInitialWorld());
  const { width, height } = snapshot.map;
  const cellAt = (x: number, y: number): TerrainCellSnapshot | undefined =>
    x < 0 || y < 0 || x >= width || y >= height ? undefined : snapshot.map.cells[y * width + x];

  const transitions = snapshot.map.cells.filter((cell) => isTransition(cell));

  it("generates transition cells along the river corners", () => {
    expect(transitions.length).toBeGreaterThan(10);
  });

  it("marks every transition cell as impassable water", () => {
    for (const cell of transitions) {
      expect(cell.terrain, `terrain at ${cell.coord.x},${cell.coord.y}`).toBe("water");
      expect(cell.passable, `passable at ${cell.coord.x},${cell.coord.y}`).toBe(false);
    }
  });

  it("matches each corner suffix to its perpendicular base-water neighbour pair", () => {
    const neighbourDirs: Record<string, ReadonlyArray<readonly [number, number]>> = {
      ne: [
        [0, -1],
        [1, 0]
      ],
      es: [
        [1, 0],
        [0, 1]
      ],
      sw: [
        [0, 1],
        [-1, 0]
      ],
      wn: [
        [-1, 0],
        [0, -1]
      ]
    };
    for (const cell of transitions) {
      const corner = TRANSITION_RE.exec(cell.assetId)![1]!;
      const waterDirs = neighbourDirs[corner]!;
      const landDirs = Object.values(neighbourDirs)
        .flat()
        .filter((dir) => !waterDirs.some((wd) => wd[0] === dir[0] && wd[1] === dir[1]))
        // dedupe (each dir appears twice across corner definitions)
        .filter((dir, index, all) => all.findIndex((d) => d[0] === dir[0] && d[1] === dir[1]) === index);
      for (const [dx, dy] of waterDirs) {
        expect(
          isBaseRiverWater(cellAt(cell.coord.x + dx, cell.coord.y + dy)),
          `water side ${dx},${dy} of ${corner} at ${cell.coord.x},${cell.coord.y}`
        ).toBe(true);
      }
      for (const [dx, dy] of landDirs) {
        expect(
          isBaseRiverWater(cellAt(cell.coord.x + dx, cell.coord.y + dy)),
          `land side ${dx},${dy} of ${corner} at ${cell.coord.x},${cell.coord.y}`
        ).toBe(false);
      }
    }
  });

  it("meanders with more than one bend direction (multi-frequency course)", () => {
    // Southernmost water row per column across the river's run; the old
    // single-sine course produced few distinct levels and a strictly
    // periodic pattern.
    const bottoms: number[] = [];
    for (let x = 20; x <= 110; x += 1) {
      let bottom = -1;
      for (let y = 25; y < 55; y += 1) {
        if (isBaseRiverWater(cellAt(x, y))) bottom = y;
      }
      if (bottom >= 0) bottoms.push(bottom);
    }
    expect(new Set(bottoms).size).toBeGreaterThanOrEqual(5);
    // Both rising and falling bank runs exist (kune-kune, not a ramp).
    let rises = 0;
    let falls = 0;
    for (let i = 1; i < bottoms.length; i += 1) {
      if (bottoms[i]! > bottoms[i - 1]!) rises += 1;
      if (bottoms[i]! < bottoms[i - 1]!) falls += 1;
    }
    expect(rises).toBeGreaterThanOrEqual(3);
    expect(falls).toBeGreaterThanOrEqual(3);
  });

  it("keeps bank steps to one row per column so corners stay single transitions", () => {
    let prevTop: number | null = null;
    let prevBottom: number | null = null;
    for (let x = 14; x <= 116; x += 1) {
      let top: number | null = null;
      let bottom: number | null = null;
      for (let y = 25; y < 55; y += 1) {
        if (isBaseRiverWater(cellAt(x, y))) {
          top ??= y;
          bottom = y;
        }
      }
      if (top === null || bottom === null) continue;
      if (prevTop !== null && prevBottom !== null) {
        expect(Math.abs(top - prevTop), `top step at x=${x}`).toBeLessThanOrEqual(1);
        expect(Math.abs(bottom - prevBottom), `bottom step at x=${x}`).toBeLessThanOrEqual(1);
      }
      prevTop = top;
      prevBottom = bottom;
    }
  });
});

describe("river transitions and bridges coexist", () => {
  it("mvp-defense earth bridge at (61,44) keeps a full land-water-land span", () => {
    const world = createInitialWorld(mvpDefenseScenario);
    const bridge = world.buildings.find(
      (b) => b.type === "earth_bridge" && b.position.x === 61 && b.position.y === 44
    );
    expect(bridge).toBeDefined();
    // 5-cell y-span: land (41), water rows 42-44, land (45).
    expect(bridge!.footprint.length).toBe(5);
    const ys = bridge!.footprint.map((c) => c.y).sort((a, b) => a - b);
    expect(ys).toEqual([41, 42, 43, 44, 45]);

    const snapshot = snapshotWorld(world);
    const cellAt = (x: number, y: number) => snapshot.map.cells[y * snapshot.map.width + x]!;
    for (const y of [42, 43, 44]) {
      expect(cellAt(61, y).terrain, `water row ${y}`).toBe("water");
    }
    // The abutments must be plain passable land -- a transition corner here
    // would stretch the crossing beyond the legal span.
    for (const y of [41, 45]) {
      expect(isTransition(cellAt(61, y)), `no transition at 61,${y}`).toBe(false);
      expect(cellAt(61, y).passable, `passable at 61,${y}`).toBe(true);
    }
  });
});
