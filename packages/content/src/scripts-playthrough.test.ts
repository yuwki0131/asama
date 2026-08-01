/**
 * Node-side playthroughs of the autoplay scripts against the real simulation.
 *
 * Mirrors the browser E2E autoplay runner (apps/game/e2e/autoplay.test.ts) but
 * drives the WorldState directly — no browser, no worker, no dev server — so
 * script-strategy regressions surface in seconds instead of a 10+ minute E2E
 * run. The browser E2E remains the integration check for the bridge/worker.
 *
 * Note: the browser run dispatches commands a few ticks later than atTick
 * (snapshot polling + worker round-trip), so exact outcome ticks differ
 * slightly between here and E2E. Scripts must keep enough timing margin that
 * the outcome *reason* is identical on both paths.
 */
import { describe, expect, it } from "vitest";
import { applyCommand, createInitialWorld, updateWorld } from "@asama/simulation";
import { scenarios } from "./index";
import { concentricCastleScript, mountainCastleScript } from "./scripts";
import type { PlaythroughScript } from "./scripts";

type World = ReturnType<typeof createInitialWorld>;

function resolveUnits(world: World, selector: Record<string, unknown>): string[] {
  const { units } = world;
  if (selector["kind"] === "all") {
    const own = selector["owner"] as string | undefined;
    return units.filter(u => !own || u.owner === own).map(u => u.id);
  }
  if (selector["kind"] === "byType") {
    const unitType = selector["unitType"] as string;
    const own = selector["owner"] as string | undefined;
    return units.filter(u => u.type === unitType && (!own || u.owner === own)).map(u => u.id);
  }
  const pos = selector["position"] as { x: number; y: number };
  const radius = selector["radius"] as number;
  const own = selector["owner"] as string | undefined;
  return units
    .filter(u => {
      const dx = u.position.x - pos.x;
      const dy = u.position.y - pos.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius && (!own || u.owner === own);
    })
    .map(u => u.id);
}

function resolveEntity(world: World, sel: Record<string, unknown>): string | null {
  const { units } = world;
  if (sel["kind"] === "byUnitType") {
    const unitType = sel["unitType"] as string;
    const own = sel["owner"] as string | undefined;
    return units.find(u => u.type === unitType && (!own || u.owner === own))?.id ?? null;
  }
  const pos = sel["position"] as { x: number; y: number };
  const radius = sel["radius"] as number;
  const own = sel["owner"] as string | undefined;
  return (
    units.find(u => {
      const dx = u.position.x - pos.x;
      const dy = u.position.y - pos.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius && (!own || u.owner === own);
    })?.id ?? null
  );
}

/** Mirrors resolveAndEnqueue in the browser runner. */
function dispatch(world: World, action: Record<string, unknown>, seq: number): void {
  const tick = world.currentTick;
  const type = action["type"] as string;
  const dest = action["destination"] as { x: number; y: number };
  const pos = action["position"] as { x: number; y: number };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  switch (type) {
    case "moveUnits": {
      const ids = resolveUnits(world, action["selector"] as Record<string, unknown>);
      if (!ids.length) return;
      applyCommand(world, { type: "moveUnits", unitIds: ids, destination: dest, issuedAtTick: tick, clientSequence: seq });
      break;
    }
    case "attackMoveUnits": {
      const ids = resolveUnits(world, action["selector"] as Record<string, unknown>);
      if (!ids.length) return;
      applyCommand(world, { type: "attackMoveUnits", unitIds: ids, destination: dest, issuedAtTick: tick, clientSequence: seq });
      break;
    }
    case "attackTarget": {
      const ids = resolveUnits(world, action["selector"] as Record<string, unknown>);
      const targetId = resolveEntity(world, action["targetSelector"] as Record<string, unknown>);
      if (!ids.length || !targetId) return;
      applyCommand(world, { type: "attackTarget", unitIds: ids, targetId, issuedAtTick: tick, clientSequence: seq });
      break;
    }
    case "stopUnits": {
      const ids = resolveUnits(world, action["selector"] as Record<string, unknown>);
      if (!ids.length) return;
      applyCommand(world, { type: "stopUnits", unitIds: ids, issuedAtTick: tick, clientSequence: seq });
      break;
    }
    case "recruitUnit":
      applyCommand(world, { type: "recruitUnit", unitType: action["unitType"] as any, issuedAtTick: tick, clientSequence: seq });
      break;
    case "marketTrade":
      applyCommand(world, { type: "marketTrade", trade: action["trade"] as any, issuedAtTick: tick, clientSequence: seq });
      break;
    case "placeBuilding":
      applyCommand(world, { type: "placeBuilding", buildingType: action["buildingType"] as any, position: pos, issuedAtTick: tick, clientSequence: seq });
      break;
    case "toggleGate":
      applyCommand(world, { type: "toggleGate", position: pos, issuedAtTick: tick, clientSequence: seq });
      break;
    default:
      break;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

function runPlaythrough(script: PlaythroughScript): void {
  const expected = script.expectedOutcome!;
  const scenario = scenarios.find(s => s.id === script.scenarioId);
  expect(scenario, `scenario ${script.scenarioId} must exist`).toBeDefined();
  const playWorld = createInitialWorld(scenario!);
  let stepIdx = 0;
  let seq = 200;
  const t0 = Date.now();
  let lastLog = t0;

  // time_held fires at holdTicks == maxTick, so run one tick past it.
  while (playWorld.outcome === null && playWorld.currentTick <= expected.maxTick) {
    while (
      stepIdx < script.steps.length &&
      script.steps[stepIdx]!.atTick <= playWorld.currentTick
    ) {
      dispatch(playWorld, script.steps[stepIdx]!.action as unknown as Record<string, unknown>, seq);
      seq += 10;
      stepIdx++;
    }
    updateWorld(playWorld);
    if (Date.now() - lastLog > 10_000) {
      lastLog = Date.now();
      console.log(
        `[playthrough] ${script.scenarioId} tick=${playWorld.currentTick} ` +
        `step=${stepIdx}/${script.steps.length} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`
      );
    }
  }

  console.log(`[playthrough] ${script.scenarioId} outcome=${JSON.stringify(playWorld.outcome)}`);
  expect(playWorld.outcome, "game must conclude").not.toBeNull();
  expect(playWorld.outcome!.reason).toBe(expected.outcome);
  expect(playWorld.outcome!.winner).toBe(expected.winner);
  expect(playWorld.outcome!.tick).toBeLessThanOrEqual(expected.maxTick);
}

describe("node playthroughs", () => {
  it("concentric-castle reaches supply_cut (player win) within maxTick", () => {
    runPlaythrough(concentricCastleScript);
  }, 300_000);

  it("mountain-castle reaches time_held (player win) within maxTick", () => {
    runPlaythrough(mountainCastleScript);
  }, 300_000);
});
