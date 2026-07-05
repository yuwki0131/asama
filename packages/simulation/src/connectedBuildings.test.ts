import { describe, expect, it } from "vitest";
import { applyCommand, createInitialWorld, snapshotWorld, type WorldState } from "./index";
import type { BuildingSnapshot, BuildingType, CellCoord } from "@asama/shared";

let clientSequence = 0;

function resetBuildings(world: WorldState): void {
  world.buildings.splice(0, world.buildings.length);
}

function normalizeMap(world: WorldState): void {
  world.map.cells = world.map.cells.map((cell) => ({
    ...cell,
    terrain: "grass" as const,
    movementCost: 1,
    passable: true,
    assetId: "terrain.grass.test"
  }));
}

function setWaterCell(world: WorldState, coord: CellCoord): void {
  const index = coord.y * world.map.width + coord.x;
  const cell = world.map.cells[index];
  if (cell === undefined) return;
  world.map.cells[index] = {
    ...cell,
    terrain: "water" as const,
    passable: false,
    assetId: "terrain.water.test"
  };
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

  it("gives NW-SE gates independent wall connections on their two endpoints", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    place(world, "gate_wide_2", { x: 40, y: 40 });
    place(world, "wall", { x: 39, y: 40 });

    expect(buildingAt(world, { x: 40, y: 40 }).assetId).toBe(
      "building.gate.wood.closed.nw_se.width2.connected.0001"
    );

    place(world, "wall", { x: 42, y: 40 });
    expect(buildingAt(world, { x: 40, y: 40 }).assetId).toBe(
      "building.gate.wood.closed.nw_se.width2.connected.0101"
    );
  });

  it("uses Y footprints and N-S wall endpoints for NE-SW gates", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    place(world, "gate_wide_3_ne_sw", { x: 70, y: 70 });
    place(world, "wall", { x: 70, y: 69 });
    place(world, "wall", { x: 70, y: 73 });

    const gate = buildingAt(world, { x: 70, y: 71 });
    expect(gate.footprint).toEqual([
      { x: 70, y: 70 },
      { x: 70, y: 71 },
      { x: 70, y: 72 }
    ]);
    expect(gate.assetId).toBe("building.gate.wood.closed.ne_sw.width3.connected.1010");
    expect(buildingAt(world, { x: 70, y: 69 }).assetId).toBe("building.wall.plaster.connected.0010");
    expect(buildingAt(world, { x: 70, y: 73 }).assetId).toBe("building.wall.plaster.connected.1000");
  });

  it("does not connect walls to the side face of a wide gate", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    place(world, "gate_wide_3", { x: 80, y: 80 });
    place(world, "wall", { x: 81, y: 79 });

    expect(buildingAt(world, { x: 81, y: 79 }).assetId).toBe("building.wall.plaster.connected.0000");
    expect(buildingAt(world, { x: 80, y: 80 }).assetId).toBe(
      "building.gate.wood.closed.nw_se.width3.connected.0000"
    );
  });

  it("computes connected masks for road surfaces", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    place(world, "road", { x: 60, y: 60 });
    place(world, "road", { x: 60, y: 59 });
    place(world, "road", { x: 61, y: 60 });
    place(world, "road", { x: 60, y: 61 });

    expect(buildingAt(world, { x: 60, y: 60 }).assetId).toBe("building.road.connected.1110");
  });
});

describe("bridge orientation", () => {
  it("uses base assetId (x orientation) when no water neighbors", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    normalizeMap(world);

    place(world, "earth_bridge", { x: 20, y: 20 });
    expect(buildingAt(world, { x: 20, y: 20 }).assetId).toBe("building.earth_bridge");

    place(world, "wood_bridge", { x: 22, y: 20 });
    expect(buildingAt(world, { x: 22, y: 20 }).assetId).toBe("building.wood_bridge");
  });

  it("uses .y suffix when east neighbor is water terrain", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    normalizeMap(world);
    setWaterCell(world, { x: 21, y: 20 });

    place(world, "earth_bridge", { x: 20, y: 20 });
    expect(buildingAt(world, { x: 20, y: 20 }).assetId).toBe("building.earth_bridge.y");
  });

  it("uses .y suffix when west neighbor is water terrain", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    normalizeMap(world);
    setWaterCell(world, { x: 19, y: 20 });

    place(world, "wood_bridge", { x: 20, y: 20 });
    expect(buildingAt(world, { x: 20, y: 20 }).assetId).toBe("building.wood_bridge.y");
  });

  it("uses .y suffix when east neighbor has a moat building", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    normalizeMap(world);

    place(world, "dry_moat", { x: 21, y: 20 });
    place(world, "earth_bridge", { x: 20, y: 20 });
    expect(buildingAt(world, { x: 20, y: 20 }).assetId).toBe("building.earth_bridge.y");
  });

  it("does not use .y suffix when only north/south neighbors are water", () => {
    const world = createInitialWorld();
    resetBuildings(world);
    normalizeMap(world);
    setWaterCell(world, { x: 20, y: 19 });
    setWaterCell(world, { x: 20, y: 21 });

    place(world, "earth_bridge", { x: 20, y: 20 });
    expect(buildingAt(world, { x: 20, y: 20 }).assetId).toBe("building.earth_bridge");
  });
});
