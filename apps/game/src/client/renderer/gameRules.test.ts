import { describe, it, expect } from "vitest";
import { bridgeAxis, bridgeCellAssetCandidates, buildingAssetCandidates } from "./gameRules";
import type { BuildingSnapshot, CellCoord, Season } from "@asama/shared";

function mockBuilding(overrides: Partial<BuildingSnapshot> = {}): BuildingSnapshot {
  return {
    id: "b1",
    owner: "player",
    type: "farm",
    category: "economy",
    position: { x: 5, y: 5 },
    footprint: [{ x: 5, y: 5 }],
    hp: 100,
    maxHp: 100,
    lifecycleState: "intact",
    gateState: null,
    passable: true,
    movementCostModifier: 1,
    assetId: "building.farm",
    food: null,
    foodCapacity: null,
    connectedToHonmaru: false,
    ladderHp: null,
    fillProgress: 0,
    ...overrides
  };
}

describe("buildingAssetCandidates seasonal farm resolution", () => {
  const seasons: readonly Season[] = ["spring", "summer", "autumn", "winter"];

  it.each(seasons)("resolves farm to building.farm.%s first", (season) => {
    const candidates = buildingAssetCandidates(mockBuilding(), season);
    expect(candidates[0]).toBe(`building.farm.${season}`);
  });

  it("falls back to the season-less farm asset after the seasonal id", () => {
    const candidates = buildingAssetCandidates(mockBuilding(), "summer");
    expect(candidates).toEqual([
      "building.farm.summer",
      "building.farm",
      "building.farm",
      "overlay.cell.blocked"
    ]);
  });

  it("keeps the season-less candidate list when no season is given", () => {
    const candidates = buildingAssetCandidates(mockBuilding());
    expect(candidates[0]).toBe("building.farm");
    expect(candidates).not.toContain("building.farm.spring");
  });

  it("does not seasonalize non-farm buildings", () => {
    const storehouse = mockBuilding({
      type: "storehouse",
      assetId: "building.storehouse"
    });
    const candidates = buildingAssetCandidates(storehouse, "autumn");
    expect(candidates[0]).toBe("building.storehouse");
    expect(candidates.some((id) => id.includes("autumn"))).toBe(false);
  });
});

function mockBridge(
  type: "earth_bridge" | "wood_bridge",
  assetId: string,
  footprint: readonly CellCoord[]
): BuildingSnapshot {
  return mockBuilding({
    type,
    assetId,
    position: footprint[Math.floor(footprint.length / 2)] ?? { x: 5, y: 5 },
    footprint
  });
}

describe("bridgeAxis", () => {
  it("parses the axis from the oriented snapshot asset id", () => {
    const bridge = mockBridge("earth_bridge", "building.earth_bridge.y5", [{ x: 61, y: 44 }]);
    expect(bridgeAxis(bridge)).toBe("y");
  });

  it("falls back to the footprint shape for plain asset ids", () => {
    const xSpan = mockBridge("earth_bridge", "building.earth_bridge", [
      { x: 4, y: 9 },
      { x: 5, y: 9 },
      { x: 6, y: 9 }
    ]);
    expect(bridgeAxis(xSpan)).toBe("x");

    const ySpan = mockBridge("wood_bridge", "building.wood_bridge", [
      { x: 4, y: 8 },
      { x: 4, y: 9 },
      { x: 4, y: 10 }
    ]);
    expect(bridgeAxis(ySpan)).toBe("y");
  });
});

describe("bridgeCellAssetCandidates segment auto-tiling", () => {
  const xFootprint: readonly CellCoord[] = [
    { x: 4, y: 9 },
    { x: 5, y: 9 },
    { x: 6, y: 9 }
  ];

  it("selects start / mid / end along an x-axis span", () => {
    const bridge = mockBridge("earth_bridge", "building.earth_bridge.x3", xFootprint);
    expect(bridgeCellAssetCandidates(bridge, { x: 4, y: 9 })[0]).toBe("building.earth_bridge.x.start");
    expect(bridgeCellAssetCandidates(bridge, { x: 5, y: 9 })[0]).toBe("building.earth_bridge.x.mid");
    expect(bridgeCellAssetCandidates(bridge, { x: 6, y: 9 })[0]).toBe("building.earth_bridge.x.end");
  });

  it("selects every interior cell as mid on a 5-cell y-axis span", () => {
    const footprint: CellCoord[] = [41, 42, 43, 44, 45].map((y) => ({ x: 61, y }));
    const bridge = mockBridge("earth_bridge", "building.earth_bridge.y5", footprint);
    expect(bridgeCellAssetCandidates(bridge, { x: 61, y: 41 })[0]).toBe("building.earth_bridge.y.start");
    for (const y of [42, 43, 44]) {
      expect(bridgeCellAssetCandidates(bridge, { x: 61, y })[0]).toBe("building.earth_bridge.y.mid");
    }
    expect(bridgeCellAssetCandidates(bridge, { x: 61, y: 45 })[0]).toBe("building.earth_bridge.y.end");
  });

  it("uses the isolated single-tile asset for legacy 1-cell bridges", () => {
    const bridge = mockBridge("wood_bridge", "building.wood_bridge.y3", [{ x: 62, y: 45 }]);
    expect(bridgeCellAssetCandidates(bridge, { x: 62, y: 45 })).toEqual([
      "building.wood_bridge.y",
      "overlay.cell.blocked"
    ]);
  });

  it("keeps the single-tile asset as fallback after the segment id", () => {
    const bridge = mockBridge("wood_bridge", "building.wood_bridge.x3", xFootprint);
    expect(bridgeCellAssetCandidates(bridge, { x: 5, y: 9 })).toEqual([
      "building.wood_bridge.x.mid",
      "building.wood_bridge",
      "overlay.cell.blocked"
    ]);
  });
});
