import { describe, expect, it } from "vitest";
import { SIEGE_BALANCE, applyCommand, createInitialWorld, updateWorld, type WorldState } from "./index";

function recruitEngineer(world: WorldState) {
  const before = new Set(world.units.map((unit) => unit.id));
  const rejection = applyCommand(world, {
    type: "recruitUnit",
    unitType: "engineer",
    issuedAtTick: 0,
    clientSequence: 1
  });
  expect(rejection).toBeNull();
  const engineer = world.units.find((unit) => !before.has(unit.id));
  if (engineer === undefined) {
    throw new Error("engineer not recruited");
  }
  return engineer;
}

function taskCommand(unitIds: readonly string[], task: "ladder" | "fillMoat", position: { x: number; y: number }) {
  return { type: "engineerTask" as const, unitIds, task, position, issuedAtTick: 0, clientSequence: 1 };
}

describe("siege ladders", () => {
  it("builds a ladder on a wall and makes it climbable", () => {
    const world = createInitialWorld();
    const wall = world.buildings.find((building) => building.type === "wall");
    expect(wall).toBeDefined();
    if (wall === undefined) {
      return;
    }

    const engineer = recruitEngineer(world);
    engineer.position = { x: wall.position.x, y: wall.position.y + 1 };
    const rejection = applyCommand(world, taskCommand([engineer.id], "ladder", wall.position));
    expect(rejection).toBeNull();

    for (let i = 0; i <= SIEGE_BALANCE.ladderBuildTicks + 2 && wall.ladderHp === null; i += 1) {
      updateWorld(world);
    }

    expect(wall.ladderHp).toBe(SIEGE_BALANCE.ladderHp);
    expect(wall.passable).toBe(true);
    expect(wall.movementCostModifier).toBe(SIEGE_BALANCE.ladderMoveCost);
    expect(engineer.task).toBeNull();
  });

  it("melee attacks tear down the ladder and restore the wall", () => {
    const world = createInitialWorld();
    const wall = world.buildings.find((building) => building.type === "wall");
    if (wall === undefined) {
      expect.unreachable();
      return;
    }
    wall.ladderHp = SIEGE_BALANCE.ladderHp;
    wall.passable = true;
    wall.movementCostModifier = SIEGE_BALANCE.ladderMoveCost;
    const wallHpBefore = wall.hp;

    // Park an enemy melee unit next to the wall and order the attack from
    // the enemy side by direct assignment (defender ladders belong to the
    // besieger in practice; ownership is symmetric mechanically).
    const attacker = world.units.find((unit) => unit.owner === "enemy" && unit.attackRange === 1);
    if (attacker === undefined) {
      expect.unreachable();
      return;
    }
    attacker.position = { x: wall.position.x, y: wall.position.y + 1 };
    attacker.attackTargetId = wall.id;

    for (let i = 0; i < 400 && wall.ladderHp !== null; i += 1) {
      updateWorld(world);
    }

    expect(wall.ladderHp).toBeNull();
    expect(wall.passable).toBe(false);
    // The wall itself only starts taking damage after the ladder is gone.
    expect(wall.hp).toBe(wallHpBefore);
  });

  it("rejects ladder orders without engineers", () => {
    const world = createInitialWorld();
    const wall = world.buildings.find((building) => building.type === "wall");
    const spear = world.units.find((unit) => unit.owner === "player" && unit.type === "spear_ashigaru");
    if (wall === undefined || spear === undefined) {
      expect.unreachable();
      return;
    }
    const rejection = applyCommand(world, taskCommand([spear.id], "ladder", wall.position));
    expect(rejection).toBe("No engineers selected");
  });
});

describe("moat filling", () => {
  it("fills a moat after sustained work and removes it", () => {
    const world = createInitialWorld();
    // The moats sit near the enemy spawn; clear attackers so the engineer
    // can work undisturbed (waves stay pending, so no victory triggers).
    world.units = world.units.filter((unit) => unit.owner !== "enemy");
    const moat = world.buildings.find((building) => building.type === "dry_moat");
    expect(moat).toBeDefined();
    if (moat === undefined) {
      return;
    }

    const engineer = recruitEngineer(world);
    engineer.position = { x: moat.position.x + 1, y: moat.position.y };
    const rejection = applyCommand(world, taskCommand([engineer.id], "fillMoat", moat.position));
    expect(rejection).toBeNull();

    for (let i = 0; i <= SIEGE_BALANCE.moatFillTicks + 2; i += 1) {
      updateWorld(world);
      if (!world.buildings.some((building) => building.id === moat.id)) {
        break;
      }
    }

    expect(world.buildings.some((building) => building.id === moat.id)).toBe(false);
    expect(engineer.task).toBeNull();
  });

  it("keeps fill progress on the moat when work is interrupted", () => {
    const world = createInitialWorld();
    world.units = world.units.filter((unit) => unit.owner !== "enemy");
    const moat = world.buildings.find((building) => building.type === "dry_moat");
    if (moat === undefined) {
      expect.unreachable();
      return;
    }
    const engineer = recruitEngineer(world);
    engineer.position = { x: moat.position.x + 1, y: moat.position.y };
    applyCommand(world, taskCommand([engineer.id], "fillMoat", moat.position));

    for (let i = 0; i < 50; i += 1) {
      updateWorld(world);
    }
    const progress = moat.fillProgress;
    expect(progress).toBeGreaterThan(0);

    // Interrupt with a different order; the accumulated work remains.
    engineer.task = null;
    for (let i = 0; i < 20; i += 1) {
      updateWorld(world);
    }
    expect(moat.fillProgress).toBe(progress);
  });
});
