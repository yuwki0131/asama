import { describe, expect, it } from "vitest";
import { createInitialWorld, updateWorld, applyCommand, type WorldState } from "./index";
import type { UnitType, CellCoord } from "@asama/shared";

let seq = 0;

function normalizeMap(world: WorldState): void {
  world.map.cells = world.map.cells.map((cell) => ({
    ...cell,
    terrain: "grass",
    movementCost: 1,
    passable: true,
    assetId: "terrain.grass.test"
  }));
}

function makeUnit(
  id: string,
  owner: "player" | "enemy",
  type: UnitType,
  position: CellCoord,
  customDamage?: number,
  customRange?: number
): WorldState["units"][number] {
  const specs: Record<UnitType, { hp: number; damage: number; range: number; cooldown: number; step: number }> = {
    spear_ashigaru: { hp: 100, damage: 14, range: 1, cooldown: 26, step: 6 },
    sword_ashigaru: { hp: 110, damage: 18, range: 1, cooldown: 22, step: 6 },
    archer:         { hp: 70,  damage: 12, range: 8, cooldown: 32, step: 7 },
    engineer:       { hp: 80,  damage: 8,  range: 1, cooldown: 30, step: 7 },
    musketeer:      { hp: 60,  damage: 20, range: 4, cooldown: 50, step: 7 },
    cavalry:        { hp: 140, damage: 16, range: 1, cooldown: 24, step: 3 },
    supply_cart:    { hp: 80,  damage: 0,  range: 0, cooldown: 19980, step: 10 }
  };
  const s = specs[type];
  return {
    id, owner, type, position,
    destination: null, path: [], selected: false,
    hp: s.hp, maxHp: s.hp,
    attackDamage: customDamage ?? s.damage,
    attackRange: customRange ?? s.range,
    attackCooldownTicks: s.cooldown, attackCooldownRemaining: 0,
    targetId: null, attackTargetId: null,
    assetId: `unit.${type}.test`, ticksPerStep: s.step,
    movementProgress: 0, pathRetryCooldown: 0, task: null, attackMoveDestination: null
  };
}

function attack(world: WorldState, attackerId: string, targetId: string): void {
  applyCommand(world, {
    type: "attackTarget",
    unitIds: [attackerId],
    targetId,
    issuedAtTick: 0,
    clientSequence: seq++
  });
}

describe("unit type affinity", () => {
  it("spear_ashigaru deals 1.5x damage to cavalry", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    // spear attackDamage=14, cavalry hp=140
    // 14 * 1.5 = 21 → 140 - 21 = 119
    world.units = [
      makeUnit("p1", "player", "spear_ashigaru", { x: 10, y: 10 }),
      makeUnit("e1", "enemy", "cavalry", { x: 11, y: 10 })
    ];
    attack(world, "p1", "e1");
    updateWorld(world);
    const target = world.units.find((u) => u.id === "e1");
    expect(target?.hp).toBe(119); // 140 - 21
  });

  it("cavalry deals 1.5x damage to archer", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    // cavalry attackDamage=16, archer hp=70
    // 16 * 1.5 = 24 → 70 - 24 = 46
    world.units = [
      makeUnit("e1", "enemy", "cavalry", { x: 10, y: 10 }),
      makeUnit("p1", "player", "archer", { x: 11, y: 10 })
    ];
    attack(world, "e1", "p1");
    updateWorld(world);
    const target = world.units.find((u) => u.id === "p1");
    expect(target?.hp).toBe(46); // 70 - 24
  });

  it("cavalry deals 1.5x damage to musketeer", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    // cavalry attackDamage=16, musketeer hp=60
    // 16 * 1.5 = 24 → 60 - 24 = 36
    world.units = [
      makeUnit("e1", "enemy", "cavalry", { x: 10, y: 10 }),
      makeUnit("p1", "player", "musketeer", { x: 11, y: 10 })
    ];
    attack(world, "e1", "p1");
    updateWorld(world);
    const target = world.units.find((u) => u.id === "p1");
    expect(target?.hp).toBe(36); // 60 - 24
  });

  it("archer deals 1.25x damage to spear_ashigaru", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    // archer attackDamage=12, spear hp=100
    // 12 * 1.25 = 15 → 100 - 15 = 85
    world.units = [
      makeUnit("p1", "player", "archer", { x: 10, y: 10 }),
      makeUnit("e1", "enemy", "spear_ashigaru", { x: 14, y: 10 })
    ];
    attack(world, "p1", "e1");
    updateWorld(world);
    const target = world.units.find((u) => u.id === "e1");
    expect(target?.hp).toBe(85); // 100 - 15
  });

  it("musketeer deals 1.25x damage to sword_ashigaru", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    // musketeer attackDamage=20, sword hp=110
    // 20 * 1.25 = 25 → 110 - 25 = 85
    world.units = [
      makeUnit("p1", "player", "musketeer", { x: 10, y: 10 }),
      makeUnit("e1", "enemy", "sword_ashigaru", { x: 12, y: 10 })
    ];
    attack(world, "p1", "e1");
    updateWorld(world);
    const target = world.units.find((u) => u.id === "e1");
    expect(target?.hp).toBe(85); // 110 - 25
  });

  it("musketeer deals 1.25x damage to engineer", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    // musketeer attackDamage=20, engineer hp=80
    // 20 * 1.25 = 25 → 80 - 25 = 55
    world.units = [
      makeUnit("p1", "player", "musketeer", { x: 10, y: 10 }),
      makeUnit("e1", "enemy", "engineer", { x: 12, y: 10 })
    ];
    attack(world, "p1", "e1");
    updateWorld(world);
    const target = world.units.find((u) => u.id === "e1");
    expect(target?.hp).toBe(55); // 80 - 25
  });

  it("has no affinity bonus between non-affinity pairs (sword vs sword)", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    // sword attackDamage=18, sword hp=110; no affinity → 110 - 18 = 92
    world.units = [
      makeUnit("p1", "player", "sword_ashigaru", { x: 10, y: 10 }),
      makeUnit("e1", "enemy", "sword_ashigaru", { x: 11, y: 10 })
    ];
    attack(world, "p1", "e1");
    updateWorld(world);
    const target = world.units.find((u) => u.id === "e1");
    expect(target?.hp).toBe(92); // 110 - 18
  });

  it("supply_cart never attacks (attackRange 0)", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    const playerHpBefore = 100;
    world.units = [
      makeUnit("e1", "enemy", "supply_cart", { x: 10, y: 10 }),
      makeUnit("p1", "player", "spear_ashigaru", { x: 11, y: 10 })
    ];
    for (let i = 0; i < 100; i++) {
      updateWorld(world);
    }
    const player = world.units.find((u) => u.id === "p1");
    expect(player?.hp).toBe(playerHpBefore);
  });
});
