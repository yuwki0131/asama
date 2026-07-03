import { describe, expect, it } from "vitest";
import { applyCommand, createInitialWorld, snapshotWorld, type WorldState } from "./index";

function firstGate(world: WorldState) {
  const gate = world.buildings.find((building) => building.gateState !== null && building.owner === "player");
  if (gate === undefined) {
    throw new Error("no gate in initial layout");
  }
  return gate;
}

function toggleCommand(position: { x: number; y: number }) {
  return { type: "toggleGate" as const, position, issuedAtTick: 0, clientSequence: 1 };
}

describe("gate toggling", () => {
  it("opens a closed gate and makes it passable", () => {
    const world = createInitialWorld();
    const gate = firstGate(world);
    expect(gate.gateState).toBe("closed");
    expect(gate.passable).toBe(false);

    const rejection = applyCommand(world, toggleCommand(gate.position));

    expect(rejection).toBeNull();
    expect(gate.gateState).toBe("open");
    expect(gate.passable).toBe(true);
  });

  it("closes an open gate again", () => {
    const world = createInitialWorld();
    const gate = firstGate(world);
    applyCommand(world, toggleCommand(gate.position));
    applyCommand(world, toggleCommand(gate.position));

    expect(gate.gateState).toBe("closed");
    expect(gate.passable).toBe(false);
  });

  it("uses the open asset variant in snapshots", () => {
    const world = createInitialWorld();
    const gate = firstGate(world);
    applyCommand(world, toggleCommand(gate.position));

    const snapshot = snapshotWorld(world);
    const gateSnapshot = snapshot.buildings.find((building) => building.id === gate.id);
    expect(gateSnapshot?.assetId).toContain(".open.");
  });

  it("rejects toggling where no gate stands", () => {
    const world = createInitialWorld();
    const rejection = applyCommand(world, toggleCommand({ x: 5, y: 5 }));
    expect(rejection).toBe("No gate there");
  });
});
