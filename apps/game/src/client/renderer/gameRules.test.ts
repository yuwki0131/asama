import { describe, it, expect } from "vitest";
import { buildingAssetCandidates } from "./gameRules";
import type { BuildingSnapshot, Season } from "@asama/shared";

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
