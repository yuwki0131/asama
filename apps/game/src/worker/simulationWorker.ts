import { createInitialWorld, applyCommand, deserializeWorld, serializeWorld, snapshotWorld, updateWorld } from "@asama/simulation";
import { DEFAULT_SCENARIO, scenarios } from "@asama/content";
import {
  SIM_TICKS_PER_SECOND,
  SNAPSHOTS_PER_SECOND,
  type MainToWorkerMessage,
  type ScenarioDefinition,
  type WorkerToMainMessage
} from "@asama/shared";
import { elevationFixtureScenario } from "../dev/elevationFixtureScenario";

function scenarioForId(scenarioId: string | undefined): ScenarioDefinition {
  if (import.meta.env.DEV && scenarioId === "elevation-fixture") {
    return elevationFixtureScenario;
  }
  if (scenarioId !== undefined) {
    const found = scenarios.find(s => s.id === scenarioId);
    if (found) return found;
  }
  return DEFAULT_SCENARIO;
}

// The game boots the first-play scenario; sim tests keep their own fixtures.
let world = createInitialWorld(DEFAULT_SCENARIO);
let speed: 0 | 1 | 2 | 4 = 0;
let lastTime = performance.now();
let accumulatedMs = 0;
let lastSnapshotTick = 0;
const tickMs = 1000 / SIM_TICKS_PER_SECOND;
const snapshotIntervalTicks = SIM_TICKS_PER_SECOND / SNAPSHOTS_PER_SECOND;

self.addEventListener("message", (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;

  if (message.type === "init") {
    world = createInitialWorld(scenarioForId(message.scenarioId));
    lastSnapshotTick = world.currentTick;
    post({ type: "ready", snapshot: snapshotWorld(world, { includeMapCells: true }) });
    return;
  }

  if (message.type === "setSpeed") {
    speed = message.speed;
    return;
  }

  if (message.type === "enqueueCommand") {
    const rejectionReason = applyCommand(world, message.command);
    if (rejectionReason !== null) {
      post({ type: "commandRejected", reason: rejectionReason });
    }
    // Terrain mutation commands require fresh cell data so the renderer can
    // rebuild its chunk cache with the updated elevation/slope state.
    const isTerrainCommand =
      message.command.type === "raiseTerrain" ||
      message.command.type === "lowerTerrain" ||
      message.command.type === "placeSlope" ||
      message.command.type === "removeSlope";
    post({ type: "snapshot", snapshot: snapshotWorld(world, { includeMapCells: isTerrainCommand }) });
    return;
  }

  if (message.type === "requestSnapshot") {
    post({ type: "snapshot", snapshot: snapshotWorld(world, { includeMapCells: false }) });
    return;
  }

  if (message.type === "requestSaveState") {
    post({ type: "saveState", state: serializeWorld(world) });
    return;
  }

  if (message.type === "loadSaveState") {
    try {
      world = deserializeWorld(message.state);
    } catch (error) {
      post({ type: "error", message: error instanceof Error ? error.message : "Failed to load save" });
      return;
    }
    lastSnapshotTick = world.currentTick;
    post({ type: "snapshot", snapshot: snapshotWorld(world, { includeMapCells: true }) });
  }
});

function loop(now: number): void {
  const elapsed = now - lastTime;
  lastTime = now;
  // Cap the backlog: if the simulation falls behind, drop excess sim time
  // instead of trying to fast-forward forever (which would keep the worker
  // pegged and the tab frozen).
  accumulatedMs = Math.min(accumulatedMs + elapsed * speed, tickMs * 16);

  let processed = 0;
  while (accumulatedMs >= tickMs && processed < 8) {
    updateWorld(world);
    accumulatedMs -= tickMs;
    processed += 1;
  }

  if (world.currentTick - lastSnapshotTick >= snapshotIntervalTicks) {
    lastSnapshotTick = world.currentTick;
    post({ type: "snapshot", snapshot: snapshotWorld(world, { includeMapCells: false }) });
  }

  setTimeout(() => loop(performance.now()), 16);
}

loop(performance.now());

function post(message: WorkerToMainMessage): void {
  self.postMessage(message);
}
