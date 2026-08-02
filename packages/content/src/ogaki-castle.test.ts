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

  it("uses river tiles for the Suimon-gawa north/west reaches and water moats for the dug east/south reaches", () => {
    const byCell = new Map<string, string>();
    for (const building of ogakiCastleScenario.initialBuildings) {
      byCell.set(`${building.position.x},${building.position.y}`, building.type);
    }

    // North reach (y7-11) and west reach (x9-13) are the converted river.
    expect(byCell.get("60,9")).toBe("river");
    expect(byCell.get("10,90")).toBe("river");
    expect(byCell.get("100,7")).toBe("river");
    // East (x115-117) and south (y113-115) stay excavated water moats.
    expect(byCell.get("116,70")).toBe("water_moat");
    expect(byCell.get("60,114")).toBe("water_moat");
    // Inner castle moats (honmaru / ninomaru / middle) remain water_moat.
    expect(byCell.get("52,56")).toBe("water_moat");
    expect(byCell.get("88,50")).toBe("water_moat");

    // The converted river reaches stay closed water barriers: full bands
    // except at the earth-bridge crossings and the procedural-river gaps.
    for (let x = 14; x <= 114; x += 1) {
      for (let y = 7; y <= 11; y += 1) {
        const type = byCell.get(`${x},${y}`);
        expect(["river", "earth_bridge"], `north river band ${x},${y}`).toContain(type);
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

  it("lines the streets with tanzaku machiya rows in both orientations", () => {
    const machiya = ogakiCastleScenario.initialBuildings.filter(
      (building) => building.type === "machiya" || building.type === "machiya_ne_sw"
    );
    expect(machiya.length).toBeGreaterThanOrEqual(100);
    expect(new Set(machiya.map((building) => building.type)).size).toBe(2);

    // 美濃路(y=61)は両側町: 街道の北帯(y59-60)と南帯(y62-63)に間口1セルの町屋が向かい合う。
    const northStrip = machiya.filter((building) => building.type === "machiya_ne_sw" && building.position.y === 59);
    const southStrip = machiya.filter((building) => building.type === "machiya_ne_sw" && building.position.y === 62);
    expect(northStrip.length).toBeGreaterThanOrEqual(10);
    expect(southStrip.length).toBeGreaterThanOrEqual(10);

    // 背割り長屋列: x=34/x=37 の奥行き2セル列に挟まれた x=36 は裏路地として空く。
    const occupied = new Set(
      ogakiCastleScenario.initialBuildings.flatMap((building) => occupiedCells(building).map((cell) => `${cell.x},${cell.y}`))
    );
    for (let y = 64; y <= 99; y += 1) {
      expect(occupied.has(`34,${y}`), `terrace 34,${y}`).toBe(true);
      expect(occupied.has(`37,${y}`), `terrace 37,${y}`).toBe(true);
      expect(occupied.has(`36,${y}`), `back alley 36,${y}`).toBe(false);
    }
  });
});
