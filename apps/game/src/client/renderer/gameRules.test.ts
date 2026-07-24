import { describe, it, expect } from "vitest";
import { bridgeAxis, bridgeCellAssetCandidates, buildingAssetCandidates, diagonalJunctionArms, honmaruCellAssetCandidates, junctionCornerCaps } from "./gameRules";
import type { BuildingSnapshot, CellCoord, Season, WorldSnapshot } from "@asama/shared";

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

describe("honmaruCellAssetCandidates per-cell tiling", () => {
  function honmaru(size: number): BuildingSnapshot {
    const footprint: CellCoord[] = [];
    for (let y = 10; y < 10 + size; y += 1) {
      for (let x = 10; x < 10 + size; x += 1) {
        footprint.push({ x, y });
      }
    }
    return mockBuilding({
      type: "honmaru",
      position: { x: 10, y: 10 },
      footprint,
      assetId: "building.honmaru.marker"
    });
  }

  it("selects the full-interior tile for a center cell (all neighbours inside)", () => {
    expect(honmaruCellAssetCandidates(honmaru(3), { x: 11, y: 11 })[0]).toBe(
      "building.honmaru.tile.connected.1111"
    );
  });

  it("selects boundary tiles on edges and corners (mask bits are N,E,S,W inside-neighbours)", () => {
    const lot = honmaru(3);
    // north-west corner cell: only E (x+1) and S (y+1) neighbours are inside.
    expect(honmaruCellAssetCandidates(lot, { x: 10, y: 10 })[0]).toBe("building.honmaru.tile.connected.0110");
    // south-east corner cell: only N (y-1) and W (x-1) inside.
    expect(honmaruCellAssetCandidates(lot, { x: 12, y: 12 })[0]).toBe("building.honmaru.tile.connected.1001");
    // middle of the north edge: E, S, W inside.
    expect(honmaruCellAssetCandidates(lot, { x: 11, y: 10 })[0]).toBe("building.honmaru.tile.connected.0111");
    // middle of the west edge: N, E, S inside.
    expect(honmaruCellAssetCandidates(lot, { x: 10, y: 11 })[0]).toBe("building.honmaru.tile.connected.1110");
  });

  it("keeps the single-cell marker and overlay as fallbacks", () => {
    expect(honmaruCellAssetCandidates(honmaru(1), { x: 10, y: 10 })).toEqual([
      "building.honmaru.tile.connected.0000",
      "building.honmaru.marker",
      "overlay.cell.selected"
    ]);
  });
});

describe("diagonalJunctionArms", () => {
  function wallAt(x: number, y: number, type: BuildingSnapshot["type"] = "wall", lifecycleState = "intact"): BuildingSnapshot {
    return mockBuilding({
      id: `w-${x}-${y}-${type}`,
      type,
      position: { x, y },
      footprint: [{ x, y }],
      passable: false,
      lifecycleState: lifecycleState as BuildingSnapshot["lifecycleState"],
      assetId: type === "wall" ? "building.wall.plaster.connected.0000" : `building.${type}`
    });
  }

  function snapshotWith(buildings: readonly BuildingSnapshot[]): WorldSnapshot {
    return { buildings } as unknown as WorldSnapshot;
  }

  it("adds one arm per corner toward the touching diagonal (diagonal neighbours)", () => {
    const host = wallAt(10, 10);
    expect(diagonalJunctionArms(host, snapshotWith([host, wallAt(11, 11, "diagonal_wall_nwse")]))).toEqual(["se"]);
    expect(diagonalJunctionArms(host, snapshotWith([host, wallAt(9, 9, "diagonal_wall_nwse")]))).toEqual(["nw"]);
    expect(diagonalJunctionArms(host, snapshotWith([host, wallAt(11, 9, "diagonal_wall_nesw")]))).toEqual(["ne"]);
    expect(diagonalJunctionArms(host, snapshotWith([host, wallAt(9, 11, "diagonal_wall_nesw")]))).toEqual(["sw"]);
  });

  it("detects diagonals in edge-adjacent cells whose line touches the shared corner", () => {
    const host = wallAt(10, 10);
    // nwse at (10,9): its SE corner is the host's NE corner.
    expect(diagonalJunctionArms(host, snapshotWith([host, wallAt(10, 9, "diagonal_wall_nwse")]))).toEqual(["ne"]);
    // nesw at (10,9): its SW corner is the host's NW corner.
    expect(diagonalJunctionArms(host, snapshotWith([host, wallAt(10, 9, "diagonal_wall_nesw")]))).toEqual(["nw"]);
    // nwse at (11,10): its NW corner is the host's NE corner.
    expect(diagonalJunctionArms(host, snapshotWith([host, wallAt(11, 10, "diagonal_wall_nwse")]))).toEqual(["ne"]);
  });

  it("ignores diagonals whose line does not touch any host corner", () => {
    const host = wallAt(10, 10);
    // nesw at (11,11) touches (11.5,10.5)/(10.5,11.5) - neither is a host corner.
    expect(diagonalJunctionArms(host, snapshotWith([host, wallAt(11, 11, "diagonal_wall_nesw")]))).toEqual([]);
  });

  it("applies to hazama walls but not to other building types", () => {
    const diagonal = wallAt(11, 11, "diagonal_wall_nwse");
    expect(diagonalJunctionArms(wallAt(10, 10, "hazama_wall"), snapshotWith([diagonal]))).toEqual(["se"]);
    expect(diagonalJunctionArms(mockBuilding({ position: { x: 10, y: 10 }, footprint: [{ x: 10, y: 10 }] }), snapshotWith([diagonal]))).toEqual([]);
  });

  it("requires both host and diagonal to be intact", () => {
    const host = wallAt(10, 10);
    expect(diagonalJunctionArms(host, snapshotWith([wallAt(11, 11, "diagonal_wall_nwse", "destroyed")]))).toEqual([]);
    expect(diagonalJunctionArms(wallAt(10, 10, "wall", "destroyed"), snapshotWith([wallAt(11, 11, "diagonal_wall_nwse")]))).toEqual([]);
  });
});

describe("junctionCornerCaps", () => {
  function wallAt(x: number, y: number, type: BuildingSnapshot["type"] = "wall", lifecycleState = "intact"): BuildingSnapshot {
    return mockBuilding({
      id: `w-${x}-${y}-${type}`,
      type,
      position: { x, y },
      footprint: [{ x, y }],
      passable: false,
      lifecycleState: lifecycleState as BuildingSnapshot["lifecycleState"],
      assetId: type === "wall" ? "building.wall.plaster.connected.0000" : `building.${type}`
    });
  }

  function snapshotWith(buildings: readonly BuildingSnapshot[]): WorldSnapshot {
    return { buildings } as unknown as WorldSnapshot;
  }

  it("caps a diagonal-diagonal elbow at the shared corner, owned by the front-most cell", () => {
    const nwse = wallAt(10, 10, "diagonal_wall_nwse");
    const nesw = wallAt(10, 11, "diagonal_wall_nesw");
    const snapshot = snapshotWith([nwse, nesw]);
    // nwse SE corner (11,11) === nesw NE corner: perpendicular elbow.
    expect(junctionCornerCaps(nesw, snapshot)).toEqual([{ x: 11, y: 11 }]);
    expect(junctionCornerCaps(nwse, snapshot)).toEqual([]);
  });

  it("caps an elbow opening the other way", () => {
    const nesw = wallAt(10, 10, "diagonal_wall_nesw");
    const nwse = wallAt(11, 10, "diagonal_wall_nwse");
    const snapshot = snapshotWith([nesw, nwse]);
    // nesw NE corner (11,10) === nwse NW corner.
    expect(junctionCornerCaps(nwse, snapshot)).toEqual([{ x: 11, y: 10 }]);
    expect(junctionCornerCaps(nesw, snapshot)).toEqual([]);
  });

  it("does not cap straight-through diagonal chains", () => {
    const a = wallAt(10, 10, "diagonal_wall_nwse");
    const b = wallAt(11, 11, "diagonal_wall_nwse");
    const snapshot = snapshotWith([a, b]);
    expect(junctionCornerCaps(a, snapshot)).toEqual([]);
    expect(junctionCornerCaps(b, snapshot)).toEqual([]);
  });

  it("does not cap T-joints or crossings (collinear pair present)", () => {
    const chainA = wallAt(10, 10, "diagonal_wall_nwse");
    const chainB = wallAt(11, 11, "diagonal_wall_nwse");
    const tee = wallAt(10, 11, "diagonal_wall_nesw");
    const cross = wallAt(11, 10, "diagonal_wall_nesw");
    const teeSnapshot = snapshotWith([chainA, chainB, tee]);
    expect(junctionCornerCaps(chainA, teeSnapshot)).toEqual([]);
    expect(junctionCornerCaps(chainB, teeSnapshot)).toEqual([]);
    expect(junctionCornerCaps(tee, teeSnapshot)).toEqual([]);
    const crossSnapshot = snapshotWith([chainA, chainB, tee, cross]);
    for (const building of [chainA, chainB, tee, cross]) {
      expect(junctionCornerCaps(building, crossSnapshot)).toEqual([]);
    }
  });

  it("treats a straight wall's junction arm as a segment: collinear with the diagonal means no cap", () => {
    const host = wallAt(10, 10);
    const diagonal = wallAt(11, 11, "diagonal_wall_nwse");
    const snapshot = snapshotWith([host, diagonal]);
    expect(junctionCornerCaps(host, snapshot)).toEqual([]);
    expect(junctionCornerCaps(diagonal, snapshot)).toEqual([]);
  });

  it("caps an elbow between a straight wall's arm and a perpendicular diagonal", () => {
    const host = wallAt(10, 10);
    const nesw = wallAt(10, 11, "diagonal_wall_nesw");
    const snapshot = snapshotWith([host, nesw]);
    // Host grows an SE arm toward key (11,11); nesw's NE corner is the same key.
    expect(diagonalJunctionArms(host, snapshot)).toEqual(["se"]);
    expect(junctionCornerCaps(nesw, snapshot)).toEqual([{ x: 11, y: 11 }]);
    expect(junctionCornerCaps(host, snapshot)).toEqual([]);
  });

  it("ignores destroyed participants", () => {
    const nwse = wallAt(10, 10, "diagonal_wall_nwse", "destroyed");
    const nesw = wallAt(10, 11, "diagonal_wall_nesw");
    expect(junctionCornerCaps(nesw, snapshotWith([nwse, nesw]))).toEqual([]);
  });
});
