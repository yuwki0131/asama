import { describe, expect, it } from "vitest";
import { applyCommand, createInitialWorld, snapshotWorld, type WorldState } from "./index";
import type { BuildingSnapshot, BuildingType, CellCoord } from "@asama/shared";

let clientSequence = 0;

function resetBuildings(world: WorldState): void {
  world.buildings.splice(0, world.buildings.length);
}

function place(world: WorldState, type: BuildingType, position: CellCoord): void {
  const error = applyCommand(world, {
    type: "placeBuilding",
    buildingType: type,
    position,
    issuedAtTick: 0,
    clientSequence: clientSequence++
  });
  expect(error).toBeNull();
}

function demolish(world: WorldState, position: CellCoord): void {
  const error = applyCommand(world, {
    type: "demolishBuilding",
    position,
    issuedAtTick: 0,
    clientSequence: clientSequence++
  });
  expect(error).toBeNull();
}

function buildingAt(world: WorldState, position: CellCoord): BuildingSnapshot {
  const building = snapshotWorld(world, { includeMapCells: false }).buildings.find((candidate) =>
    candidate.footprint.some((cell) => cell.x === position.x && cell.y === position.y)
  );
  expect(building).toBeDefined();
  return building as BuildingSnapshot;
}

describe("connected building asset masks", () => {
  it("computes N,E,S,W masks for straight, corner, T, and cross fence shapes", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    place(world, "fence", { x: 20, y: 20 });
    place(world, "fence", { x: 20, y: 19 });
    place(world, "fence", { x: 21, y: 20 });
    place(world, "fence", { x: 20, y: 21 });
    place(world, "fence", { x: 19, y: 20 });

    expect(buildingAt(world, { x: 20, y: 20 }).assetId).toBe("building.fence.wood.connected.1111");
    expect(buildingAt(world, { x: 20, y: 19 }).assetId).toBe("building.fence.wood.connected.0010");
    expect(buildingAt(world, { x: 21, y: 20 }).assetId).toBe("building.fence.wood.connected.0001");
  });

  it("updates masks after demolition", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    place(world, "wall", { x: 30, y: 30 });
    place(world, "wall", { x: 31, y: 30 });
    place(world, "wall", { x: 29, y: 30 });
    expect(buildingAt(world, { x: 30, y: 30 }).assetId).toBe("building.wall.plaster.connected.0101");

    demolish(world, { x: 31, y: 30 });
    expect(buildingAt(world, { x: 30, y: 30 }).assetId).toBe("building.wall.plaster.connected.0001");
  });

  it("connects fence and wall to gate footprints without mixing fence and wall directly", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    place(world, "gate", { x: 40, y: 40 });
    place(world, "fence", { x: 39, y: 40 });
    place(world, "wall", { x: 41, y: 40 });

    expect(buildingAt(world, { x: 39, y: 40 }).assetId).toBe("building.fence.wood.connected.0100");
    expect(buildingAt(world, { x: 41, y: 40 }).assetId).toBe("building.wall.plaster.connected.0001");
  });

  it("connects to wide gate footprint endpoints", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    place(world, "gate_wide_3", { x: 50, y: 50 });
    place(world, "wall", { x: 49, y: 50 });
    place(world, "wall", { x: 53, y: 50 });

    expect(buildingAt(world, { x: 49, y: 50 }).assetId).toBe("building.wall.plaster.connected.0100");
    expect(buildingAt(world, { x: 53, y: 50 }).assetId).toBe("building.wall.plaster.connected.0001");
  });
});
