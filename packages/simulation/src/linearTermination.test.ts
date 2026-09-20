import { describe, it, expect } from "vitest";
import { scenarios } from "@asama/content";
import type { BuildingType } from "@asama/shared";
import { createInitialWorld } from "./world";
import type { WorldState } from "./types";
import { isLotBuilding } from "./buildings";

/**
 * V-26 (G族: 線形地物の唐突終端) content lint.
 *
 * Linear features — roads, barrier runs (fence/wall), moats, rivers — must not
 * stop dead in open grass: every run endpoint has to visually "arrive"
 * somewhere (a gate, a lot building, a bridge, water, another linear family or
 * the map rim). Reviewers consistently read bare endpoints as unfinished
 * content (棚卸しサイクル7: free-play道の未接続, riverside孤立塀,
 * takaishigaki堀の草中終端).
 */

type Family = "road" | "barrier" | "dry_moat" | "water_moat" | "river";

const FAMILY_OF: Partial<Record<BuildingType, Family>> = {
  road: "road",
  fence: "barrier",
  wall: "barrier",
  hazama_wall: "barrier",
  diagonal_wall_nwse: "barrier",
  diagonal_wall_nesw: "barrier",
  diagonal_fence_nwse: "barrier",
  diagonal_fence_nesw: "barrier",
  arc_wall_r3_ne: "barrier",
  arc_wall_r3_se: "barrier",
  arc_wall_r3_sw: "barrier",
  arc_wall_r3_nw: "barrier",
  arc_wall_r4_ne: "barrier",
  arc_wall_r4_se: "barrier",
  arc_wall_r4_sw: "barrier",
  arc_wall_r4_nw: "barrier",
  dry_moat: "dry_moat",
  water_moat: "water_moat",
  diagonal_dry_moat_nwse: "dry_moat",
  diagonal_dry_moat_nesw: "dry_moat",
  diagonal_water_moat_nwse: "water_moat",
  diagonal_water_moat_nesw: "water_moat",
  river: "river",
  diagonal_river_nwse: "river",
  diagonal_river_nesw: "river"
};

// Gates continue a barrier run and legitimise a road arriving at them.
const isGate = (type: BuildingType): boolean => type.startsWith("gate_");
const isBridge = (type: BuildingType): boolean => type === "earth_bridge" || type === "wood_bridge";

/** Minimum run length per family: anything shorter floats as a fragment. */
const MIN_COMPONENT: Record<Family, number> = {
  road: 2,
  barrier: 3,
  dry_moat: 4,
  water_moat: 4,
  river: 4
};

interface Violation {
  readonly scenario: string;
  readonly family: Family;
  readonly kind: "fragment" | "bare-endpoint";
  readonly at: string;
  readonly size?: number;
}

function auditScenario(world: WorldState, scenarioId: string): Violation[] {
  const width = world.map.width;
  const height = world.map.height;
  const familyAt = new Map<string, Family>();
  const otherAt = new Map<string, BuildingType>();
  for (const building of world.buildings) {
    const family = FAMILY_OF[building.type];
    for (const cell of building.footprint) {
      const key = `${cell.x},${cell.y}`;
      if (family !== undefined) {
        familyAt.set(key, family);
      } else {
        otherAt.set(key, building.type);
      }
    }
  }

  const terrainAt = (x: number, y: number): string =>
    world.map.cells[y * width + x]?.terrain ?? "off";

  /** 8-neighbourhood cells (plus self) around a coordinate key. */
  const around = (x: number, y: number): [number, number][] => {
    const cells: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        cells.push([x + dx, y + dy]);
      }
    }
    return cells;
  };

  const legitimateStop = (x: number, y: number, family: Family): boolean => {
    if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) {
      return true;
    }
    for (const [nx, ny] of around(x, y)) {
      const other = otherAt.get(`${nx},${ny}`);
      if (other !== undefined) {
        if (isGate(other) || isBridge(other)) {
          return true;
        }
        // Any linear feature may terminate against a lot building: the run
        // visually arrives at the compound's edge (road at a courtyard, wall
        // abutting a yagura, moat stopping at a town block).
        if (isLotBuilding(other) || other === "tenshu" || other === "tenshu_large") {
          return true;
        }
      }
      const neighbourFamily = familyAt.get(`${nx},${ny}`);
      if (neighbourFamily !== undefined && neighbourFamily !== family) {
        // Arriving at another linear family (wall meets moat, road meets moat
        // via bridgehead, moat meets river) reads as a junction, not a stump.
        return true;
      }
      const terrain = terrainAt(nx, ny);
      if (terrain === "water" || terrain === "marsh") {
        return true;
      }
    }
    return false;
  };

  // Connected components per family over the 8-neighbourhood.
  const violations: Violation[] = [];
  const seen = new Set<string>();
  for (const [key, family] of familyAt) {
    if (seen.has(key)) continue;
    const component: [number, number][] = [];
    const queue = [key];
    seen.add(key);
    while (queue.length > 0) {
      const current = queue.pop()!;
      const [cx, cy] = current.split(",").map(Number) as [number, number];
      component.push([cx, cy]);
      for (const [nx, ny] of around(cx, cy)) {
        const nKey = `${nx},${ny}`;
        if (!seen.has(nKey) && familyAt.get(nKey) === family) {
          seen.add(nKey);
          queue.push(nKey);
        }
      }
    }

    if (component.length < MIN_COMPONENT[family]) {
      // A fragment is fine if it still stops legitimately at BOTH ends —
      // e.g. a 1-cell road plugging a gate to a lot courtyard.
      const allLegit = component.every(([x, y]) => legitimateStop(x, y, family));
      if (!allLegit) {
        violations.push({
          scenario: scenarioId,
          family,
          kind: "fragment",
          at: component.map(([x, y]) => `(${x},${y})`).join(" "),
          size: component.length
        });
        continue;
      }
    }

    for (const [x, y] of component) {
      const degree = around(x, y).filter(
        ([nx, ny]) => !(nx === x && ny === y) && familyAt.get(`${nx},${ny}`) === family
      ).length;
      if (degree <= 1 && !legitimateStop(x, y, family)) {
        violations.push({ scenario: scenarioId, family, kind: "bare-endpoint", at: `(${x},${y})` });
      }
    }
  }
  return violations;
}

describe("linear feature termination (V-26 / G族 content lint)", () => {
  it("no linear feature ends bare in open terrain in any scenario", () => {
    const all: Violation[] = [];
    for (const scenario of scenarios) {
      const world = createInitialWorld(scenario);
      all.push(...auditScenario(world, scenario.id));
    }
    if (all.length > 0) {
      console.log("V-26 violations:\n" + all.map((v) =>
        `  ${v.scenario} ${v.family} ${v.kind}${v.size !== undefined ? `[${v.size}]` : ""} ${v.at}`
      ).join("\n"));
    }
    expect(all).toEqual([]);
  });
});
