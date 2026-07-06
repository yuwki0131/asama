import { describe, expect, it } from "vitest";
import { applyCommand, createInitialWorld, snapshotWorld, updateWorld, type WorldState } from "./index";
import { computeConnectedStorehouseIds } from "./food";
import { findPath } from "./pathfinding";
import type { CellCoord, UnitType } from "@asama/shared";

function firstPlayerGate(world: WorldState) {
  const gate = world.buildings.find((building) => building.gateState !== null && building.owner === "player");
  if (gate === undefined) {
    throw new Error("no gate in initial layout");
  }
  return gate;
}

function toggleCommand(position: { x: number; y: number }) {
  return { type: "toggleGate" as const, position, issuedAtTick: 0, clientSequence: 1 };
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

function unit(id: string, owner: "player" | "enemy", type: UnitType, position: CellCoord): WorldState["units"][number] {
  return {
    id, owner, type, position,
    destination: null, path: [], selected: false,
    hp: 100, maxHp: 100, attackDamage: 14, attackRange: 1,
    attackCooldownTicks: 26, attackCooldownRemaining: 0,
    targetId: null, attackTargetId: null,
    assetId: `unit.${type}.test`, ticksPerStep: 6,
    movementProgress: 0, pathRetryCooldown: 0, task: null,
    attackMoveDestination: null
  };
}

describe("gate toggling", () => {
  it("initial gate state is open", () => {
    const world = createInitialWorld();
    const gate = firstPlayerGate(world);
    expect(gate.gateState).toBe("open");
    expect(gate.passable).toBe(true);
  });

  it("closes an open gate and makes it impassable", () => {
    const world = createInitialWorld();
    const gate = firstPlayerGate(world);
    expect(gate.gateState).toBe("open");

    const rejection = applyCommand(world, toggleCommand(gate.position));

    expect(rejection).toBeNull();
    expect(gate.gateState).toBe("closed");
    expect(gate.passable).toBe(false);
  });

  it("reopens a closed gate", () => {
    const world = createInitialWorld();
    const gate = firstPlayerGate(world);
    applyCommand(world, toggleCommand(gate.position));
    applyCommand(world, toggleCommand(gate.position));

    expect(gate.gateState).toBe("open");
    expect(gate.passable).toBe(true);
  });

  it("uses the closed asset variant after toggling an open gate", () => {
    const world = createInitialWorld();
    const gate = firstPlayerGate(world);
    applyCommand(world, toggleCommand(gate.position));

    const snapshot = snapshotWorld(world);
    const gateSnapshot = snapshot.buildings.find((building) => building.id === gate.id);
    expect(gateSnapshot?.assetId).toContain(".closed.");
  });

  it("rejects toggling where no gate stands", () => {
    const world = createInitialWorld();
    const rejection = applyCommand(world, toggleCommand({ x: 5, y: 5 }));
    expect(rejection).toBe("No gate there");
  });

  it("friendly unit cannot path through a closed gate", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings.splice(0, world.buildings.length);
    world.units = [unit("u1", "player", "spear_ashigaru", { x: 10, y: 12 })];

    applyCommand(world, {
      type: "placeBuilding", buildingType: "wall", position: { x: 12, y: 11 },
      issuedAtTick: 0, clientSequence: 10
    });
    applyCommand(world, {
      type: "placeBuilding", buildingType: "gate", position: { x: 12, y: 12 },
      issuedAtTick: 0, clientSequence: 11
    });
    applyCommand(world, {
      type: "placeBuilding", buildingType: "wall", position: { x: 12, y: 13 },
      issuedAtTick: 0, clientSequence: 12
    });

    const gate = world.buildings.find((b) => b.type === "gate");
    // Close the gate
    applyCommand(world, toggleCommand({ x: 12, y: 12 }));
    expect(gate?.gateState).toBe("closed");
    expect(gate?.passable).toBe(false);

    // Player unit cannot path through the closed gate
    const path = findPath(world, { x: 10, y: 12 }, { x: 14, y: 12 }, "player");
    expect(path.every((c) => !(c.x === 12 && c.y === 12))).toBe(true);
  });

  it("friendly unit can path through an open gate", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings.splice(0, world.buildings.length);
    world.units = [unit("u1", "player", "spear_ashigaru", { x: 10, y: 12 })];

    applyCommand(world, {
      type: "placeBuilding", buildingType: "wall", position: { x: 12, y: 11 },
      issuedAtTick: 0, clientSequence: 20
    });
    applyCommand(world, {
      type: "placeBuilding", buildingType: "gate", position: { x: 12, y: 12 },
      issuedAtTick: 0, clientSequence: 21
    });
    applyCommand(world, {
      type: "placeBuilding", buildingType: "wall", position: { x: 12, y: 13 },
      issuedAtTick: 0, clientSequence: 22
    });

    const gate = world.buildings.find((b) => b.type === "gate");
    expect(gate?.gateState).toBe("open");

    const path = findPath(world, { x: 10, y: 12 }, { x: 14, y: 12 }, "player");
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((c) => c.x === 12 && c.y === 12)).toBe(true);
  });

  it("food connects through a closed player-owned gate (supply perspective)", () => {
    const world = createInitialWorld();
    normalizeMap(world);
    world.buildings.splice(0, world.buildings.length);
    world.units = [];

    // Honmaru on the left, wall + gate between, storehouse on the right
    applyCommand(world, {
      type: "placeBuilding", buildingType: "wall", position: { x: 20, y: 19 },
      issuedAtTick: 0, clientSequence: 30
    });
    applyCommand(world, {
      type: "placeBuilding", buildingType: "gate", position: { x: 20, y: 20 },
      issuedAtTick: 0, clientSequence: 31
    });
    applyCommand(world, {
      type: "placeBuilding", buildingType: "wall", position: { x: 20, y: 21 },
      issuedAtTick: 0, clientSequence: 32
    });
    applyCommand(world, {
      type: "placeBuilding", buildingType: "honmaru", position: { x: 15, y: 20 },
      issuedAtTick: 0, clientSequence: 33
    });
    applyCommand(world, {
      type: "placeBuilding", buildingType: "storehouse", position: { x: 22, y: 20 },
      issuedAtTick: 0, clientSequence: 34
    });

    // Close the gate — food connectivity should still work
    applyCommand(world, toggleCommand({ x: 20, y: 20 }));
    const gate = world.buildings.find((b) => b.type === "gate");
    expect(gate?.gateState).toBe("closed");

    updateWorld(world);
    const connected = computeConnectedStorehouseIds(world);
    const storehouse = world.buildings.find((b) => b.type === "storehouse");
    expect(storehouse).toBeDefined();
    expect(connected).toContain(storehouse?.id);
  });
});
