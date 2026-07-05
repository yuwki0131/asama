import { describe, expect, it } from "vitest";
import { applyCommand, createInitialWorld, snapshotWorld, type WorldState } from "./index";
import type { BuildingSnapshot, BuildingType, CellCoord, PlayerCommand, UnitType } from "@asama/shared";

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
    engineer: { hp: 80, damage: 8, range: 1, cooldown: 30, step: 7 },
    musketeer: { hp: 60, damage: 20, range: 4, cooldown: 50, step: 7 },
    cavalry: { hp: 140, damage: 16, range: 1, cooldown: 24, step: 3 },
    supply_cart: { hp: 80, damage: 0, range: 0, cooldown: 19980, step: 10 }
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
    task: null,
    attackMoveDestination: null
  };
}

function command(command: Record<string, unknown>): PlayerCommand {
  return {
    ...command,
    issuedAtTick: 0,
    clientSequence: clientSequence++
  } as PlayerCommand;
}

function place(world: WorldState, buildingType: BuildingType, position: CellCoord): string | null {
  return applyCommand(
    world,
    command({
      type: "placeBuilding",
      buildingType,
      position
    })
  );
}

function demolish(world: WorldState, position: CellCoord): string | null {
  return applyCommand(
    world,
    command({
      type: "demolishBuilding",
      position
    })
  );
}

function buildingAt(world: WorldState, position: CellCoord): BuildingSnapshot | undefined {
  return snapshotWorld(world, { includeMapCells: false }).buildings.find((building) =>
    building.footprint.some((cell) => cell.x === position.x && cell.y === position.y)
  );
}

function setImpassableTerrain(world: WorldState, coord: CellCoord): void {
  const index = coord.y * world.map.width + coord.x;
  const cell = world.map.cells[index];
  if (cell === undefined) {
    throw new Error(`Missing terrain cell at ${coord.x},${coord.y}`);
  }

  world.map.cells[index] = {
    ...cell,
    terrain: "water",
    movementCost: 1,
    passable: false,
    assetId: "terrain.water.test"
  };
}

describe("construction", () => {
  it("rejects placement overlapping buildings, units, and impassable terrain", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [unit("unit:player:1", "player", "spear_ashigaru", { x: 30, y: 30 })];

    expect(place(world, "storehouse", { x: 20, y: 20 })).toBeNull();
    expect(place(world, "market", { x: 21, y: 21 })).toBe("Cannot place building there");
    expect(place(world, "fence", { x: 30, y: 30 })).toBe("Cannot place building there");

    setImpassableTerrain(world, { x: 35, y: 35 });
    expect(place(world, "fence", { x: 35, y: 35 })).toBe("Cannot place building there");
  });

  it("demolishes ordinary buildings but not honmaru", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [];

    expect(place(world, "fence", { x: 20, y: 20 })).toBeNull();
    expect(demolish(world, { x: 20, y: 20 })).toBeNull();
    expect(buildingAt(world, { x: 20, y: 20 })).toBeUndefined();

    expect(place(world, "honmaru", { x: 25, y: 25 })).toBeNull();
    expect(demolish(world, { x: 25, y: 25 })).toBe("Honmaru cannot be demolished");
    expect(buildingAt(world, { x: 25, y: 25 })?.type).toBe("honmaru");
  });

  it("occupies every cell of a multi-cell storehouse footprint", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [];

    expect(place(world, "storehouse", { x: 40, y: 40 })).toBeNull();

    const storehouse = buildingAt(world, { x: 42, y: 42 });
    expect(storehouse?.type).toBe("storehouse");
    expect(storehouse?.footprint).toHaveLength(9);
    expect(storehouse?.footprint).toEqual([
      { x: 40, y: 40 },
      { x: 41, y: 40 },
      { x: 42, y: 40 },
      { x: 40, y: 41 },
      { x: 41, y: 41 },
      { x: 42, y: 41 },
      { x: 40, y: 42 },
      { x: 41, y: 42 },
      { x: 42, y: 42 }
    ]);
    expect(place(world, "fence", { x: 42, y: 42 })).toBe("Cannot place building there");
  });

  it("clears unit paths that pass through newly placed footprints", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [unit("unit:player:1", "player", "spear_ashigaru", { x: 10, y: 10 })];

    const moveError = applyCommand(
      world,
      command({
        type: "moveUnits",
        unitIds: ["unit:player:1"],
        destination: { x: 14, y: 10 }
      })
    );
    expect(moveError).toBeNull();
    expect(snapshotWorld(world, { includeMapCells: false }).units[0]?.path).toContainEqual({ x: 12, y: 10 });

    expect(place(world, "fence", { x: 12, y: 10 })).toBeNull();

    const movedUnit = snapshotWorld(world, { includeMapCells: false }).units[0];
    expect(movedUnit?.path).toEqual([]);
    expect(movedUnit?.destination).toBeNull();
  });
});
