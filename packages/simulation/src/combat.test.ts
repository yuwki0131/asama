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
    archer: { hp: 70, damage: 12, range: 8, cooldown: 32, step: 7 }
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
    movementProgress: 0
  };
}

function command(command: Record<string, unknown>): PlayerCommand {
  return {
    ...command,
    issuedAtTick: 0,
    clientSequence: clientSequence++
  } as PlayerCommand;
}

function attack(world: WorldState, attackerId: string, targetId: string): void {
  const error = applyCommand(
    world,
    command({
      type: "attackTarget",
      unitIds: [attackerId],
      targetId
    })
  );
  expect(error).toBeNull();
}

function snapshotUnit(world: WorldState, unitId: string) {
  return snapshotWorld(world, { includeMapCells: false }).units.find((candidate) => candidate.id === unitId);
}

function manhattan(a: CellCoord, b: CellCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

describe("combat", () => {
  it("applies melee damage and then waits for cooldown", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [
      unit("unit:player:1", "player", "spear_ashigaru", { x: 10, y: 10 }),
      unit("unit:enemy:1", "enemy", "spear_ashigaru", { x: 11, y: 10 })
    ];

    attack(world, "unit:player:1", "unit:enemy:1");
    updateWorld(world);

    expect(snapshotUnit(world, "unit:enemy:1")?.hp).toBe(86);
    expect(snapshotUnit(world, "unit:player:1")?.attackCooldownRemaining).toBe(26);

    updateWorld(world);

    expect(snapshotUnit(world, "unit:enemy:1")?.hp).toBe(86);
    expect(snapshotUnit(world, "unit:player:1")?.attackCooldownRemaining).toBe(25);
  });

  it("uses archer range 8 for ranged attack checks", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [
      unit("unit:archer:1", "player", "archer", { x: 10, y: 20 }),
      unit("unit:enemy:1", "enemy", "spear_ashigaru", { x: 18, y: 20 })
    ];

    attack(world, "unit:archer:1", "unit:enemy:1");
    updateWorld(world);

    expect(snapshotUnit(world, "unit:enemy:1")?.hp).toBe(88);
    expect(snapshotUnit(world, "unit:archer:1")?.attackCooldownRemaining).toBe(32);

    const outOfRangeWorld = createInitialWorld();
    normalizeMap(outOfRangeWorld);
    resetBuildings(outOfRangeWorld);
    outOfRangeWorld.units = [
      unit("unit:archer:1", "player", "archer", { x: 10, y: 20 }),
      unit("unit:enemy:1", "enemy", "spear_ashigaru", { x: 19, y: 20 })
    ];

    attack(outOfRangeWorld, "unit:archer:1", "unit:enemy:1");
    updateWorld(outOfRangeWorld);

    const archer = snapshotUnit(outOfRangeWorld, "unit:archer:1");
    expect(snapshotUnit(outOfRangeWorld, "unit:enemy:1")?.hp).toBe(100);
    expect(archer?.attackCooldownRemaining).toBe(0);
    expect(archer?.path.at(-1)).toEqual({ x: 11, y: 20 });
    expect(manhattan(archer?.path.at(-1) as CellCoord, { x: 19, y: 20 })).toBe(8);
  });

  it("removes units when HP reaches zero", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    const enemy = unit("unit:enemy:1", "enemy", "spear_ashigaru", { x: 11, y: 10 });
    enemy.hp = 14;
    world.units = [unit("unit:player:1", "player", "spear_ashigaru", { x: 10, y: 10 }), enemy];

    attack(world, "unit:player:1", "unit:enemy:1");
    updateWorld(world);

    expect(snapshotUnit(world, "unit:enemy:1")).toBeUndefined();
    expect(snapshotWorld(world, { includeMapCells: false }).units).toHaveLength(1);
  });

  it("moves toward an assigned attack target when outside range", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [
      unit("unit:player:1", "player", "spear_ashigaru", { x: 10, y: 10 }),
      unit("unit:enemy:1", "enemy", "spear_ashigaru", { x: 14, y: 10 })
    ];

    attack(world, "unit:player:1", "unit:enemy:1");
    updateWorld(world);

    const attacker = snapshotUnit(world, "unit:player:1");
    expect(attacker?.path.length).toBeGreaterThan(0);
    expect(attacker?.destination).toEqual({ x: 13, y: 10 });
    expect(attacker?.targetId).toBe("unit:enemy:1");
  });
});
