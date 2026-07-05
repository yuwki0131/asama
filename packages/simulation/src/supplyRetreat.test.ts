import { describe, expect, it } from "vitest";
import { createInitialWorld, updateWorld, snapshotWorld, SIEGE_BALANCE, type WorldState } from "./index";
import type { UnitType, CellCoord } from "@asama/shared";

function normalizeMap(world: WorldState): void {
  world.map.cells = world.map.cells.map((cell) => ({
    ...cell, terrain: "grass", movementCost: 1, passable: true, assetId: "terrain.grass.test"
  }));
}

function makeUnit(
  id: string,
  owner: "player" | "enemy",
  type: UnitType,
  position: CellCoord
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
    attackDamage: s.damage, attackRange: s.range,
    attackCooldownTicks: s.cooldown, attackCooldownRemaining: 0,
    targetId: null, attackTargetId: null,
    assetId: `unit.${type}.test`, ticksPerStep: s.step,
    movementProgress: 0, pathRetryCooldown: 0, task: null, attackMoveDestination: null
  };
}

describe("supply cart retreat timer", () => {
  it("timer does not start when no supply carts have ever existed", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    world.units = [
      makeUnit("e1", "enemy", "spear_ashigaru", { x: 50, y: 50 })
    ];

    for (let i = 0; i < 10; i++) updateWorld(world);

    const snap = snapshotWorld(world, { includeMapCells: false });
    expect(snap.supplyRetreat.active).toBe(false);
    expect(world.outcome).toBeNull();
  });

  it("timer activates when all supply carts are destroyed", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    const cart = makeUnit("cart1", "enemy", "supply_cart", { x: 20, y: 20 });
    cart.hp = 1;
    world.units = [
      makeUnit("p1", "player", "spear_ashigaru", { x: 21, y: 20 }),
      cart
    ];

    // Let player auto-kill the cart
    for (let i = 0; i < 5; i++) updateWorld(world);

    expect(world.units.some((u) => u.type === "supply_cart")).toBe(false);
    const snap = snapshotWorld(world, { includeMapCells: false });
    expect(snap.supplyRetreat.active).toBe(true);
    expect(snap.supplyRetreat.remainingTicks).toBeGreaterThan(0);
  });

  it("timer cancels when a new supply cart arrives while countdown is active", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    world.supplyState.hasHadCart = true;
    world.supplyState.retreatTimerActive = true;
    world.supplyState.retreatTimerRemaining = 1000;

    // Spawn a new supply cart
    world.units = [makeUnit("cart2", "enemy", "supply_cart", { x: 20, y: 20 })];
    updateWorld(world);

    expect(world.supplyState.retreatTimerActive).toBe(false);
    expect(world.supplyState.retreatTimerRemaining).toBe(0);
  });

  it("timer expiry causes enemy retreat and supply_cut outcome", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    // Manually set up: cart existed and was destroyed; timer is at 1
    world.supplyState.hasHadCart = true;
    world.supplyState.retreatTimerActive = true;
    world.supplyState.retreatTimerRemaining = 1;
    world.units = [
      makeUnit("p1", "player", "spear_ashigaru", { x: 60, y: 60 }),
      makeUnit("e1", "enemy", "spear_ashigaru", { x: 90, y: 90 })
    ];

    // One tick: timer decrements to 0 → outcome fires
    updateWorld(world);

    expect(world.outcome?.winner).toBe("player");
    expect(world.outcome?.reason).toBe("supply_cut");
    // All enemies removed
    expect(world.units.some((u) => u.owner === "enemy")).toBe(false);
    // Player units survive
    expect(world.units.some((u) => u.owner === "player")).toBe(true);
  });

  it("snapshot includes supplyRetreat state", () => {
    const world = createInitialWorld();
    world.supplyState.hasHadCart = true;
    world.supplyState.retreatTimerActive = true;
    world.supplyState.retreatTimerRemaining = 2400;

    const snap = snapshotWorld(world, { includeMapCells: false });
    expect(snap.supplyRetreat.active).toBe(true);
    expect(snap.supplyRetreat.remainingTicks).toBe(2400);
  });

  it("supplyRetreatTicks constant is 4800", () => {
    expect(SIEGE_BALANCE.supplyRetreatTicks).toBe(4800);
  });

  it("holdTicks victory coexists: holdTicks fires before supply_cut if earlier", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings = [];
    // Short holdTicks scenario
    world.scenario.victory = { holdTicks: 5 };
    world.supplyState.hasHadCart = true;
    world.supplyState.retreatTimerActive = true;
    world.supplyState.retreatTimerRemaining = 100;
    world.units = [makeUnit("p1", "player", "spear_ashigaru", { x: 60, y: 60 })];

    for (let i = 0; i < 10; i++) updateWorld(world);

    // holdTicks=5 so time_held should fire at tick 5 before supply_cut
    expect(world.outcome?.reason).toBe("time_held");
    expect(world.outcome?.winner).toBe("player");
  });
});
