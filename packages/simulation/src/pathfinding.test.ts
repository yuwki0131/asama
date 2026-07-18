import { describe, expect, it } from "vitest";
import { applyCommand, createInitialWorld, snapshotWorld, updateWorld, type WorldState } from "./index";
import { findPath, isPassable } from "./pathfinding";
import { MAP_WIDTH } from "@asama/shared";
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

function setWaterCell(world: WorldState, coord: CellCoord): void {
  const index = coord.y * world.map.width + coord.x;
  const cell = world.map.cells[index];
  if (cell === undefined) {
    throw new Error(`Missing terrain cell at ${coord.x},${coord.y}`);
  }

  world.map.cells[index] = {
    ...cell,
    terrain: "water",
    movementCost: 9999,
    passable: false,
    assetId: "terrain.water.test"
  };
}

function placeBridge(world: WorldState, position: CellCoord): void {
  const error = applyCommand(
    world,
    command({
      type: "placeBuilding",
      buildingType: "earth_bridge",
      position
    })
  );
  expect(error).toBeNull();
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

  it("traverses all 3 cells of a 1x3 bridge over a water channel", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    // Full-width E-W river at y=30; bridge at {20,30} gets y-orientation
    for (let x = 0; x < MAP_WIDTH; x++) setWaterCell(world, { x, y: 30 });
    // Footprint: {20,29}, {20,30}, {20,31}
    placeBridge(world, { x: 20, y: 30 });

    const path = findPath(world, { x: 20, y: 33 }, { x: 20, y: 27 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.some(c => c.x === 20 && c.y === 30)).toBe(true);
  });

  it("blocks traversal when no bridge spans the water channel", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    for (let x = 0; x < MAP_WIDTH; x++) setWaterCell(world, { x, y: 30 });

    const path = findPath(world, { x: 20, y: 33 }, { x: 20, y: 27 });
    expect(path).toEqual([]);
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

describe("gate passability", () => {
  function placeNarrowGate(world: WorldState, position: CellCoord): void {
    const error = applyCommand(
      world,
      command({
        type: "placeBuilding",
        buildingType: "gate_narrow_3",
        position
      })
    );
    expect(error).toBeNull();
  }

  function placeNarrowGateNeSw(world: WorldState, position: CellCoord): void {
    const error = applyCommand(
      world,
      command({
        type: "placeBuilding",
        buildingType: "gate_narrow_3_ne_sw",
        position
      })
    );
    expect(error).toBeNull();
  }

  it("player unit cannot path through a closed narrow gate", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [unit("u1", "player", "spear_ashigaru", { x: 10, y: 12 })];

    // Enclose cell {13,12}: walls on three sides, gate_narrow_3_ne_sw on the
    // west face (footprint (12,11)(12,12)(12,13); center (12,12) is the only
    // possible entry).
    placeNarrowGateNeSw(world, { x: 12, y: 11 });
    placeWall(world, { x: 13, y: 11 });
    placeWall(world, { x: 13, y: 13 });
    placeWall(world, { x: 14, y: 11 });
    placeWall(world, { x: 14, y: 12 });
    placeWall(world, { x: 14, y: 13 });

    // Close the gate (starts open, toggle closes it)
    applyCommand(world, command({ type: "toggleGate", position: { x: 12, y: 12 } }));

    const gate = world.buildings.find((b) => b.type === "gate_narrow_3_ne_sw");
    expect(gate?.gateState).toBe("closed");
    expect(gate?.passable).toBe(false);

    // {13,12} is only reachable through the (closed) gate — no path
    const error = applyCommand(
      world,
      command({
        type: "moveUnits",
        unitIds: ["u1"],
        destination: { x: 13, y: 12 }
      })
    );
    expect(error).toBe("No path to that cell");
  });

  it("closed narrow gate is impassable on all three cells", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [];

    placeNarrowGate(world, { x: 12, y: 12 });

    const gate = world.buildings.find((b) => b.type === "gate_narrow_3");
    // Close the gate
    applyCommand(world, command({ type: "toggleGate", position: { x: 12, y: 12 } }));
    expect(gate?.gateState).toBe("closed");
    expect(gate?.owner).toBe("player");

    // Closed gate is impassable regardless of perspective
    expect(isPassable(world, { x: 12, y: 12 })).toBe(false);
    expect(isPassable(world, { x: 13, y: 12 })).toBe(false);
    expect(isPassable(world, { x: 14, y: 12 })).toBe(false);
    expect(isPassable(world, { x: 13, y: 12 }, "player")).toBe(false);
  });

  it("open narrow gate: only the center cell is passable, flanking wall cells never are", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [];

    placeNarrowGate(world, { x: 12, y: 12 });

    const gate = world.buildings.find((b) => b.type === "gate_narrow_3");
    expect(gate?.gateState).toBe("open");

    // Left flanking wall — impassable even when open
    expect(isPassable(world, { x: 12, y: 12 })).toBe(false);
    // Center — the 1-cell opening
    expect(isPassable(world, { x: 13, y: 12 })).toBe(true);
    expect(isPassable(world, { x: 13, y: 12 }, "player")).toBe(true);
    // Right flanking wall — impassable even when open
    expect(isPassable(world, { x: 14, y: 12 })).toBe(false);
  });

  it("gate_narrow_3_ne_sw open: only the center cell is passable", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [];

    // Place at y=30; footprint covers y=30, y=31, y=32
    placeNarrowGateNeSw(world, { x: 30, y: 30 });

    const gate = world.buildings.find((b) => b.type === "gate_narrow_3_ne_sw");
    expect(gate?.gateState).toBe("open");

    expect(isPassable(world, { x: 30, y: 30 })).toBe(false);
    expect(isPassable(world, { x: 30, y: 31 })).toBe(true);
    expect(isPassable(world, { x: 30, y: 32 })).toBe(false);
  });

  it("narrow gate: pathfinding routes through the center cell only", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [];

    // Wall row at y=30 with gate_narrow_3 at x=20 (footprint x=20,21,22)
    placeWall(world, { x: 18, y: 30 });
    placeWall(world, { x: 19, y: 30 });
    placeNarrowGate(world, { x: 20, y: 30 });
    placeWall(world, { x: 23, y: 30 });
    placeWall(world, { x: 24, y: 30 });

    // Path from y=28 to y=32 must cross only through x=21 (center)
    const path = findPath(world, { x: 21, y: 28 }, { x: 21, y: 32 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((c) => c.x === 21 && c.y === 30)).toBe(true);
    expect(path.some((c) => c.x === 20 && c.y === 30)).toBe(false);
    expect(path.some((c) => c.x === 22 && c.y === 30)).toBe(false);
  });

  function placeWide3Gate(world: WorldState, position: CellCoord): void {
    const error = applyCommand(
      world,
      command({ type: "placeBuilding", buildingType: "gate_wide_3", position })
    );
    expect(error).toBeNull();
  }

  function placeWide3GateNeSw(world: WorldState, position: CellCoord): void {
    const error = applyCommand(
      world,
      command({ type: "placeBuilding", buildingType: "gate_wide_3_ne_sw", position })
    );
    expect(error).toBeNull();
  }

  // gate_wide_3 (NW-SE): footprint x,x+1,x+2 — only center cell (x+1) is passable when open.
  it("gate_wide_3 open: only center cell is passable, end cells are impassable", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [];

    // Place at x=20; footprint covers x=20, x=21, x=22
    placeWide3Gate(world, { x: 20, y: 30 });

    const gate = world.buildings.find((b) => b.type === "gate_wide_3");
    expect(gate?.gateState).toBe("open");

    // Left pillar — impassable even when open
    expect(isPassable(world, { x: 20, y: 30 })).toBe(false);
    // Center — the gate opening, passable when open
    expect(isPassable(world, { x: 21, y: 30 })).toBe(true);
    expect(isPassable(world, { x: 21, y: 30 }, "player")).toBe(true);
    // Right pillar — impassable even when open
    expect(isPassable(world, { x: 22, y: 30 })).toBe(false);
  });

  it("gate_wide_3 closed: all three cells are impassable", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [];

    placeWide3Gate(world, { x: 20, y: 30 });
    applyCommand(world, command({ type: "toggleGate", position: { x: 20, y: 30 } }));

    const gate = world.buildings.find((b) => b.type === "gate_wide_3");
    expect(gate?.gateState).toBe("closed");

    expect(isPassable(world, { x: 20, y: 30 })).toBe(false);
    expect(isPassable(world, { x: 21, y: 30 })).toBe(false);
    expect(isPassable(world, { x: 22, y: 30 })).toBe(false);
  });

  it("gate_wide_3 open: pathfinding routes through center cell only", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [];

    // Wall row at y=30 with gate_wide_3 at x=20 (footprint x=20,21,22)
    placeWall(world, { x: 18, y: 30 });
    placeWall(world, { x: 19, y: 30 });
    placeWide3Gate(world, { x: 20, y: 30 });
    placeWall(world, { x: 23, y: 30 });
    placeWall(world, { x: 24, y: 30 });

    // Path from y=28 to y=32 must cross only through x=21 (center)
    const path = findPath(world, { x: 21, y: 28 }, { x: 21, y: 32 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((c) => c.x === 21 && c.y === 30)).toBe(true);
    expect(path.some((c) => c.x === 20 && c.y === 30)).toBe(false);
    expect(path.some((c) => c.x === 22 && c.y === 30)).toBe(false);
  });

  // gate_wide_3_ne_sw (NE-SW): footprint y,y+1,y+2 — only center cell (y+1) is passable when open.
  it("gate_wide_3_ne_sw open: only center cell is passable, end cells are impassable", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [];

    // Place at y=30; footprint covers y=30, y=31, y=32
    placeWide3GateNeSw(world, { x: 30, y: 30 });

    const gate = world.buildings.find((b) => b.type === "gate_wide_3_ne_sw");
    expect(gate?.gateState).toBe("open");

    expect(isPassable(world, { x: 30, y: 30 })).toBe(false);
    expect(isPassable(world, { x: 30, y: 31 })).toBe(true);
    expect(isPassable(world, { x: 30, y: 32 })).toBe(false);
  });

  it("gate_wide_3 supply perspective: center cell passable even when closed", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    resetBuildings(world);
    world.units = [];

    placeWide3Gate(world, { x: 20, y: 30 });
    // Close the gate
    applyCommand(world, command({ type: "toggleGate", position: { x: 20, y: 30 } }));

    const gate = world.buildings.find((b) => b.type === "gate_wide_3");
    expect(gate?.gateState).toBe("closed");

    // Supply perspective: closed player gate center cell is still passable for food routing
    expect(isPassable(world, { x: 21, y: 30 }, "supply")).toBe(true);
    // Pillar cells remain impassable even for supply
    expect(isPassable(world, { x: 20, y: 30 }, "supply")).toBe(false);
    expect(isPassable(world, { x: 22, y: 30 }, "supply")).toBe(false);
  });
});
