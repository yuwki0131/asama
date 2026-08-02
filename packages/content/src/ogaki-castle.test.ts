import { describe, expect, it } from "vitest";
import { buildingSpecs, ogakiCastleScenario, scenarios } from "./index";

const occupiedCells = (building: (typeof ogakiCastleScenario.initialBuildings)[number]) => {
  const spec = buildingSpecs[building.type];
  if (spec.footprintCells) {
    return spec.footprintCells.map((cell) => ({
      x: building.position.x + cell.x,
      y: building.position.y + cell.y,
    }));
  }
  const result: { x: number; y: number }[] = [];
  for (let y = 0; y < spec.footprint.height; y += 1) {
    for (let x = 0; x < spec.footprint.width; x += 1) {
      result.push({ x: building.position.x + x, y: building.position.y + y });
    }
  }
  return result;
};

describe("ogakiCastleScenario", () => {
  it("is registered without replacing the default scenario", () => {
    expect(scenarios.find((scenario) => scenario.id === "ogaki-castle")).toBe(ogakiCastleScenario);
    expect(ogakiCastleScenario.name).toBe("大垣城");
  });

  it("has no overlapping or out-of-bounds building footprint cells", () => {
    const occupied = new Map<string, string>();
    for (const building of ogakiCastleScenario.initialBuildings) {
      for (const cell of occupiedCells(building)) {
        const key = `${cell.x},${cell.y}`;
        expect(cell.x, `${building.type} outside map at ${key}`).toBeGreaterThanOrEqual(0);
        expect(cell.x, `${building.type} outside map at ${key}`).toBeLessThan(128);
        expect(cell.y, `${building.type} outside map at ${key}`).toBeGreaterThanOrEqual(0);
        expect(cell.y, `${building.type} outside map at ${key}`).toBeLessThan(128);
        expect(occupied.get(key), `${building.type} overlaps ${occupied.get(key)} at ${key}`).toBeUndefined();
        occupied.set(key, building.type);
      }
    }
  });

  it("closes the honmaru wall and three-cell moat except for the iron gate and wooden bridge", () => {
    const byCell = new Map<string, string>();
    for (const building of ogakiCastleScenario.initialBuildings) {
      for (const cell of occupiedCells(building)) byCell.set(`${cell.x},${cell.y}`, building.type);
    }

    for (let x = 56; x <= 69; x += 1) {
      expect(["wall", "yagura"], `north wall ${x},58`).toContain(byCell.get(`${x},58`));
      expect(["wall", "yagura", "gate_yagura_3"], `south wall ${x},71`).toContain(byCell.get(`${x},71`));
    }
    for (let y = 58; y <= 71; y += 1) {
      expect(["wall", "yagura"], `west wall 56,${y}`).toContain(byCell.get(`56,${y}`));
      expect(["wall", "yagura"], `east wall 69,${y}`).toContain(byCell.get(`69,${y}`));
    }
    expect(byCell.get("63,71")).toBe("gate_yagura_3");

    for (let y = 54; y <= 74; y += 1) {
      for (let x = 52; x <= 73; x += 1) {
        const isMoatBand = x <= 54 || x >= 71 || y <= 56 || y >= 73;
        if (!isMoatBand) continue;
        const type = byCell.get(`${x},${y}`);
        if (x === 63 && y >= 72) expect(type).toBe("wood_bridge");
        else expect(type, `moat closure at ${x},${y}`).toMatch(/water_moat/);
      }
    }
  });

  it("contains the keep, seven outer gates, and required bridge types", () => {
    expect(ogakiCastleScenario.initialBuildings.filter((building) => building.type === "tenshu_large")).toHaveLength(1);
    const outerGate = (x: number, y: number) =>
      (x === 14 || x === 114 || y === 12 || y === 112);
    expect(ogakiCastleScenario.initialBuildings.filter((building) => building.type.startsWith("gate_") && outerGate(building.position.x, building.position.y))).toHaveLength(7);
    expect(ogakiCastleScenario.initialBuildings.filter((building) => building.type === "wood_bridge")).toHaveLength(6);
    expect(ogakiCastleScenario.initialBuildings.filter((building) => building.type === "earth_bridge").length).toBeGreaterThanOrEqual(3);
  });

  it("uses the prescribed scale and has a dense castle town", () => {
    expect(ogakiCastleScenario.initialBuildings.filter((building) => building.type === "town_block").length).toBeGreaterThanOrEqual(25);
    // 天守台マウンドの虎口スロープ二段(L0→L1→L2、兵糧BFSと移動の接続用)
    expect(ogakiCastleScenario.elevation?.slopes).toHaveLength(2);
  });
});
