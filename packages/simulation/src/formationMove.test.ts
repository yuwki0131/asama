import { describe, expect, it } from "vitest";
import { createInitialWorld, applyCommand, updateWorld, type WorldState } from "./index";

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
    // (40, 38) is mid-river water in the procedural map.
    const rejection = applyCommand(world, moveCommand(ids, { x: 40, y: 38 }));
    expect(rejection).toBe("That cell is not passable");
  });
});
