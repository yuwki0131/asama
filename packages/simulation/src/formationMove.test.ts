import { describe, expect, it } from "vitest";
import { createInitialWorld, applyCommand, updateWorld, type WorldState } from "./index";
import type { UnitType } from "@asama/shared";

function playerUnitIds(world: WorldState): string[] {
  return world.units.filter((unit) => unit.owner === "player").map((unit) => unit.id);
}

function moveCommand(unitIds: readonly string[], destination: { x: number; y: number }) {
  return { type: "moveUnits" as const, unitIds, destination, issuedAtTick: 0, clientSequence: 1 };
}

describe("formation movement", () => {
  it("assigns a distinct destination slot to every unit in a group move", () => {
    const world = createInitialWorld();
    const ids = playerUnitIds(world);
    expect(ids.length).toBeGreaterThanOrEqual(3);

    const rejection = applyCommand(world, moveCommand(ids, { x: 50, y: 66 }));
    expect(rejection).toBeNull();

    const destinations = world.units
      .filter((unit) => ids.includes(unit.id) && unit.destination !== null)
      .map((unit) => `${unit.destination?.x},${unit.destination?.y}`);
    expect(destinations.length).toBe(ids.length);
    expect(new Set(destinations).size).toBe(destinations.length);
  });

  it("keeps formation slots clustered around the ordered destination", () => {
    const world = createInitialWorld();
    const ids = playerUnitIds(world);
    applyCommand(world, moveCommand(ids, { x: 50, y: 66 }));

    for (const unit of world.units) {
      if (!ids.includes(unit.id) || unit.destination === null) {
        continue;
      }
      const distance = Math.abs(unit.destination.x - 50) + Math.abs(unit.destination.y - 66);
      expect(distance).toBeLessThanOrEqual(4);
    }
  });

  it("moves the group in parallel until each unit reaches its own slot", () => {
    const world = createInitialWorld();
    const ids = playerUnitIds(world);
    applyCommand(world, moveCommand(ids, { x: 50, y: 66 }));

    for (let tick = 0; tick < 2000; tick += 1) {
      updateWorld(world);
      if (world.units.filter((unit) => ids.includes(unit.id)).every((unit) => unit.path.length === 0)) {
        break;
      }
    }

    const positions = world.units
      .filter((unit) => ids.includes(unit.id))
      .map((unit) => `${unit.position.x},${unit.position.y}`);
    // All arrived on distinct cells near the destination.
    expect(new Set(positions).size).toBe(positions.length);
    for (const unit of world.units) {
      if (!ids.includes(unit.id)) {
        continue;
      }
      const distance = Math.abs(unit.position.x - 50) + Math.abs(unit.position.y - 66);
      expect(distance).toBeLessThanOrEqual(4);
    }
  });

  it("rejects a move into impassable terrain", () => {
    const world = createInitialWorld();
    const ids = playerUnitIds(world);
    // (40, 37) is mid-river water in the procedural map (river centre ≈ y=36 at x=40).
    const rejection = applyCommand(world, moveCommand(ids, { x: 40, y: 37 }));
    expect(rejection).toBe("That cell is not passable");
  });
});

// ---------------------------------------------------------------------------
// Helpers shared by the regression suites below

function normalizeMap(world: WorldState): void {
  world.map.cells = world.map.cells.map((cell) => ({
    ...cell,
    terrain: "grass" as const,
    movementCost: 1,
    passable: true,
    assetId: "terrain.grass.test"
  }));
}

function resetBuildings(world: WorldState): void {
  world.buildings.splice(0, world.buildings.length);
}

function makeUnit(id: string, type: UnitType, x: number, y: number): WorldState["units"][number] {
  const stats: Record<UnitType, { hp: number; damage: number; range: number; cooldown: number; step: number }> = {
    spear_ashigaru: { hp: 100, damage: 14, range: 1, cooldown: 26, step: 6 },
    sword_ashigaru: { hp: 110, damage: 18, range: 1, cooldown: 22, step: 6 },
    archer: { hp: 70, damage: 12, range: 8, cooldown: 32, step: 7 },
    engineer: { hp: 80, damage: 8, range: 1, cooldown: 30, step: 7 },
    musketeer: { hp: 60, damage: 20, range: 4, cooldown: 50, step: 7 },
    cavalry: { hp: 140, damage: 16, range: 1, cooldown: 24, step: 3 },
    supply_cart: { hp: 80, damage: 0, range: 0, cooldown: 19980, step: 10 }
  };
  const s = stats[type];
  return {
    id, owner: "player", type, position: { x, y }, destination: null, path: [],
    selected: false, hp: s.hp, maxHp: s.hp, attackDamage: s.damage,
    attackRange: s.range, attackCooldownTicks: s.cooldown, attackCooldownRemaining: 0,
    targetId: null, attackTargetId: null, assetId: `unit.${type}.test`,
    ticksPerStep: s.step, movementProgress: 0, pathRetryCooldown: 0,
    task: null, attackMoveDestination: null
  };
}

// ---------------------------------------------------------------------------
// Bug regression: 8-unit group move in a narrow corridor

describe("8-unit group move (narrow corridor regression)", () => {
  it("all 8 units receive path assignments even when tightly stacked in a single-file corridor", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);

    // Place corridor walls first (no units yet to block placement)
    for (let y = 5; y <= 40; y += 1) {
      applyCommand(world, { type: "placeBuilding", buildingType: "wall", position: { x: 19, y }, issuedAtTick: 0, clientSequence: 0 });
      applyCommand(world, { type: "placeBuilding", buildingType: "wall", position: { x: 21, y }, issuedAtTick: 0, clientSequence: 0 });
    }

    // 8 units stacked in a vertical column at x=20, y=10..17
    world.units = Array.from({ length: 8 }, (_, i) => makeUnit(`u${i}`, "spear_ashigaru", 20, 10 + i));

    const rejection = applyCommand(world, {
      type: "moveUnits",
      unitIds: world.units.map((u) => u.id),
      destination: { x: 20, y: 30 },
      issuedAtTick: 0,
      clientSequence: 1
    });

    expect(rejection).toBeNull();
    // Every mover must have been assigned a destination slot
    const assigned = world.units.filter((u) => u.destination !== null);
    expect(assigned.length).toBe(8);
  });

  it("all 8 units in a narrow corridor arrive at distinct slots near the destination", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);

    for (let y = 5; y <= 40; y += 1) {
      applyCommand(world, { type: "placeBuilding", buildingType: "wall", position: { x: 19, y }, issuedAtTick: 0, clientSequence: 0 });
      applyCommand(world, { type: "placeBuilding", buildingType: "wall", position: { x: 21, y }, issuedAtTick: 0, clientSequence: 0 });
    }

    world.units = Array.from({ length: 8 }, (_, i) => makeUnit(`u${i}`, "spear_ashigaru", 20, 10 + i));

    applyCommand(world, {
      type: "moveUnits",
      unitIds: world.units.map((u) => u.id),
      destination: { x: 20, y: 30 },
      issuedAtTick: 0,
      clientSequence: 1
    });

    for (let tick = 0; tick < 3000; tick += 1) {
      updateWorld(world);
      if (world.units.every((u) => u.path.length === 0)) {
        break;
      }
    }

    const positions = world.units.map((u) => `${u.position.x},${u.position.y}`);
    expect(new Set(positions).size).toBe(8);
    for (const u of world.units) {
      expect(Math.abs(u.position.x - 20) + Math.abs(u.position.y - 30)).toBeLessThanOrEqual(10);
    }
  });
});

// ---------------------------------------------------------------------------
// Bridge crossing over a 3-cell-wide river (regression: variable-length bridge)

function setWaterCell(world: WorldState, coord: { x: number; y: number }): void {
  const index = coord.y * world.map.width + coord.x;
  const cell = world.map.cells[index];
  if (cell === undefined) return;
  world.map.cells[index] = {
    ...cell,
    terrain: "water" as const,
    movementCost: 9999,
    passable: false,
    assetId: "terrain.water.test"
  };
}

describe("bridge crossing over river water", () => {
  it("unit can path from north bank to south bank via a 5-cell bridge over a 3-cell river", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);

    // 3-cell-wide E-W river at y=30,31,32
    for (let x = 0; x < world.map.width; x++) {
      setWaterCell(world, { x, y: 30 });
      setWaterCell(world, { x, y: 31 });
      setWaterCell(world, { x, y: 32 });
    }

    // Player places bridge at center row — auto-spans to 5 cells (y=29..33)
    const bridgeError = applyCommand(world, {
      type: "placeBuilding",
      buildingType: "earth_bridge",
      position: { x: 20, y: 31 },
      issuedAtTick: 0,
      clientSequence: 1
    });
    expect(bridgeError).toBeNull();

    const testUnit = makeUnit("u1", "spear_ashigaru", 20, 26);
    world.units = [testUnit];

    const rejection = applyCommand(world, {
      type: "moveUnits",
      unitIds: ["u1"],
      destination: { x: 20, y: 36 },
      issuedAtTick: 0,
      clientSequence: 2
    });

    expect(rejection).toBeNull();
    expect(testUnit.path.length).toBeGreaterThan(0);
    // Path must pass through at least one of the water cells (bridge covers them)
    expect(testUnit.path.some((c) => c.x === 20 && c.y >= 30 && c.y <= 32)).toBe(true);
  });

  it("unit actually moves across a 3-cell-wide river via bridge", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);

    for (let x = 0; x < world.map.width; x++) {
      setWaterCell(world, { x, y: 30 });
      setWaterCell(world, { x, y: 31 });
      setWaterCell(world, { x, y: 32 });
    }

    applyCommand(world, {
      type: "placeBuilding",
      buildingType: "earth_bridge",
      position: { x: 20, y: 31 },
      issuedAtTick: 0,
      clientSequence: 1
    });

    const testUnit = makeUnit("u1", "spear_ashigaru", 20, 26);
    world.units = [testUnit];

    applyCommand(world, {
      type: "moveUnits",
      unitIds: ["u1"],
      destination: { x: 20, y: 36 },
      issuedAtTick: 0,
      clientSequence: 2
    });

    for (let tick = 0; tick < 600; tick += 1) {
      updateWorld(world);
      if (testUnit.path.length === 0) break;
    }

    expect(testUnit.position).toEqual({ x: 20, y: 36 });
  });
});

// ---------------------------------------------------------------------------
describe("attack move and stop", () => {
  it("engages enemies encountered during an attack move", () => {
    const world = createInitialWorld();
    const ids = playerUnitIds(world);
    const enemy = world.units.find((unit) => unit.owner === "enemy");
    if (enemy === undefined) {
      expect.unreachable();
      return;
    }
    // Scenario-agnostic setup: march from the units' own centroid and put
    // the enemy directly on that route, inside aggro range.
    const marchers = world.units.filter((unit) => ids.includes(unit.id));
    const cx = Math.round(marchers.reduce((s, u) => s + u.position.x, 0) / marchers.length);
    const cy = Math.round(marchers.reduce((s, u) => s + u.position.y, 0) / marchers.length);

    // Find a passable march destination around the garrison, then put the
    // enemy on the straight line toward it, inside aggro range.
    let rejection: string | null = "no destination tried";
    let dest = { x: cx, y: cy };
    const candidateOffsets: ReadonlyArray<readonly [number, number]> = [
      [8, 8], [-8, -8], [8, -8], [-8, 8], [12, 0], [0, 12], [-12, 0], [0, -12]
    ];
    for (const [dx, dy] of candidateOffsets) {
      dest = { x: cx + dx, y: cy + dy };
      enemy.position = { x: cx + dx - Math.sign(dx), y: cy + dy - Math.sign(dy) };
      rejection = applyCommand(world, {
        type: "attackMoveUnits",
        unitIds: ids,
        destination: dest,
        issuedAtTick: 0,
        clientSequence: 1
      });
      if (rejection === null) {
        break;
      }
    }
    expect(rejection).toBeNull();

    // Engagement is transient (the column may kill the enemy well before the
    // march ends), so observe it during the run instead of at the end.
    let engagedAtSomePoint = false;
    for (let i = 0; i < 300 && !engagedAtSomePoint; i += 1) {
      updateWorld(world);
      engagedAtSomePoint = world.units.some(
        (unit) => ids.includes(unit.id) && unit.targetId === enemy.id
      );
    }
    expect(engagedAtSomePoint).toBe(true);
  });

  it("stop clears movement, targets and tasks", () => {
    const world = createInitialWorld();
    const ids = playerUnitIds(world);
    applyCommand(world, moveCommand(ids, { x: 50, y: 66 }));

    const rejection = applyCommand(world, { type: "stopUnits", unitIds: ids, issuedAtTick: 0, clientSequence: 2 });

    expect(rejection).toBeNull();
    for (const unit of world.units) {
      if (!ids.includes(unit.id)) {
        continue;
      }
      expect(unit.path.length).toBe(0);
      expect(unit.destination).toBeNull();
      expect(unit.attackTargetId).toBeNull();
    }
  });
});
