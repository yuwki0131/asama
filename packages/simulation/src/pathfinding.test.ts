import { describe, expect, it } from "vitest";
import { applyCommand, createInitialWorld, snapshotWorld, updateWorld, type WorldState } from "./index";
import type { CellCoord, PlayerCommand, UnitType } from "@asama/shared";

let clientSequence = 0;

function normalizeMap(world: WorldState): void {
  world.map.cells = world.map.cells.map((cell) => ({
    ...cell,
    terrain: "grass",
    movementCost: 1,
    passable: true,
    assetId: "terrain.grass.test"
  }));
}

function resetBuildings(world: WorldState): void {
  world.buildings.splice(0, world.buildings.length);
}

function unit(
  id: string,
  owner: "player" | "enemy",
  type: UnitType,
  position: CellCoord
): WorldState["units"][number] {
  const definitions = {
    spear_ashigaru: { hp: 100, damage: 14, range: 1, cooldown: 26, step: 6 },
    sword_ashigaru: { hp: 110, damage: 18, range: 1, cooldown: 22, step: 6 },
    archer: { hp: 70, damage: 12, range: 8, cooldown: 32, step: 7 },
    engineer: { hp: 80, damage: 8, range: 1, cooldown: 30, step: 7 }
  } satisfies Record<UnitType, { hp: number; damage: number; range: number; cooldown: number; step: number }>;
  const definition = definitions[type];

  return {
    id,
    owner,
    type,
    position,
    destination: null,
    path: [],
    selected: false,
    hp: definition.hp,
    maxHp: definition.hp,
    attackDamage: definition.damage,
    attackRange: definition.range,
    attackCooldownTicks: definition.cooldown,
    attackCooldownRemaining: 0,
    targetId: null,
    attackTargetId: null,
    assetId: `unit.${type}.test`,
    ticksPerStep: definition.step,
    movementProgress: 0,
    pathRetryCooldown: 0,
    task: null
  };
}

function command(command: Record<string, unknown>): PlayerCommand {
  return {
    ...command,
    issuedAtTick: 0,
    clientSequence: clientSequence++
  } as PlayerCommand;
}

function placeWall(world: WorldState, position: CellCoord): void {
  const error = applyCommand(
    world,
    command({
      type: "placeBuilding",
      buildingType: "wall",
      position
    })
  );
  expect(error).toBeNull();
}

function pathFor(world: WorldState, unitId: string): readonly CellCoord[] {
  const found = snapshotWorld(world, { includeMapCells: false }).units.find((candidate) => candidate.id === unitId);
  expect(found).toBeDefined();
  return found?.path ?? [];
}

function manhattan(a: CellCoord, b: CellCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function setTerrainCost(world: WorldState, coord: CellCoord, movementCost: number): void {
  const index = coord.y * world.map.width + coord.x;
  const cell = world.map.cells[index];
  if (cell === undefined) {
    throw new Error(`Missing terrain cell at ${coord.x},${coord.y}`);
  }

  world.map.cells[index] = {
    ...cell,
    terrain: "dirt",
    movementCost,
    passable: true,
    assetId: "terrain.dirt.test"
  };
}

describe("pathfinding", () => {
  it("routes around blocking walls and buildings", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [unit("unit:player:1", "player", "spear_ashigaru", { x: 10, y: 12 })];

    placeWall(world, { x: 12, y: 11 });
    placeWall(world, { x: 12, y: 12 });
    placeWall(world, { x: 12, y: 13 });

    const error = applyCommand(
      world,
      command({
        type: "moveUnits",
        unitIds: ["unit:player:1"],
        destination: { x: 14, y: 12 }
      })
    );

    expect(error).toBeNull();
    const path = pathFor(world, "unit:player:1");
    expect(path.length).toBeGreaterThan(manhattan({ x: 10, y: 12 }, { x: 14, y: 12 }));
    expect(path).not.toContainEqual({ x: 12, y: 11 });
    expect(path).not.toContainEqual({ x: 12, y: 12 });
    expect(path).not.toContainEqual({ x: 12, y: 13 });
  });

  it("rejects movement when the destination is unreachable", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [unit("unit:player:1", "player", "spear_ashigaru", { x: 10, y: 10 })];

    placeWall(world, { x: 9, y: 10 });
    placeWall(world, { x: 11, y: 10 });
    placeWall(world, { x: 10, y: 9 });
    placeWall(world, { x: 10, y: 11 });

    const error = applyCommand(
      world,
      command({
        type: "moveUnits",
        unitIds: ["unit:player:1"],
        destination: { x: 12, y: 10 }
      })
    );

    expect(error).toBe("No path to that cell");
    expect(pathFor(world, "unit:player:1")).toEqual([]);
    expect(snapshotWorld(world, { includeMapCells: false }).invalidMoveTarget).toEqual({ x: 12, y: 10 });
  });

  it("prefers a longer low-cost route over high-cost dirt cells", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [unit("unit:player:1", "player", "spear_ashigaru", { x: 10, y: 10 })];
    setTerrainCost(world, { x: 11, y: 10 }, 8);
    setTerrainCost(world, { x: 12, y: 10 }, 8);
    setTerrainCost(world, { x: 13, y: 10 }, 8);

    const error = applyCommand(
      world,
      command({
        type: "moveUnits",
        unitIds: ["unit:player:1"],
        destination: { x: 14, y: 10 }
      })
    );

    expect(error).toBeNull();
    const path = pathFor(world, "unit:player:1");
    expect(path.length).toBeGreaterThan(4);
    expect(path.some((cell) => cell.y !== 10)).toBe(true);
  });

  it("finds an approach path that stops inside melee attack range", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [
      unit("unit:player:1", "player", "spear_ashigaru", { x: 10, y: 10 }),
      unit("unit:enemy:1", "enemy", "spear_ashigaru", { x: 16, y: 10 })
    ];

    const error = applyCommand(
      world,
      command({
        type: "attackTarget",
        unitIds: ["unit:player:1"],
        targetId: "unit:enemy:1"
      })
    );
    expect(error).toBeNull();

    updateWorld(world);

    const path = pathFor(world, "unit:player:1");
    const finalStep = path.at(-1);
    expect(finalStep).toBeDefined();
    expect(finalStep).not.toEqual({ x: 16, y: 10 });
    expect(manhattan(finalStep as CellCoord, { x: 16, y: 10 })).toBeLessThanOrEqual(1);
  });
});
