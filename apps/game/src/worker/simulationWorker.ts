import { createInitialWorld, applyCommand, snapshotWorld, updateWorld } from "@asama/simulation";
import { SIM_TICKS_PER_SECOND, SNAPSHOTS_PER_SECOND, type MainToWorkerMessage, type WorkerToMainMessage } from "@asama/shared";

let world = createInitialWorld();
let speed: 0 | 1 | 2 | 4 = 0;
let lastTime = performance.now();
let accumulatedMs = 0;
let lastSnapshotTick = 0;
const tickMs = 1000 / SIM_TICKS_PER_SECOND;
const snapshotIntervalTicks = SIM_TICKS_PER_SECOND / SNAPSHOTS_PER_SECOND;

self.addEventListener("message", (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;

  if (message.type === "init") {
    world = createInitialWorld();
    post({ type: "ready", snapshot: snapshotWorld(world) });
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
    post({ type: "snapshot", snapshot: snapshotWorld(world) });
    return;
  }

  if (message.type === "requestSnapshot") {
    post({ type: "snapshot", snapshot: snapshotWorld(world) });
  }
});

function loop(now: number): void {
  const elapsed = now - lastTime;
  lastTime = now;
  accumulatedMs += elapsed * speed;

  let processed = 0;
  while (accumulatedMs >= tickMs && processed < 8) {
    updateWorld(world);
    accumulatedMs -= tickMs;
    processed += 1;
  }

  if (world.currentTick - lastSnapshotTick >= snapshotIntervalTicks) {
    lastSnapshotTick = world.currentTick;
    post({ type: "snapshot", snapshot: snapshotWorld(world) });
  }

  setTimeout(() => loop(performance.now()), 16);
}

post({ type: "ready", snapshot: snapshotWorld(world) });
loop(performance.now());

function post(message: WorkerToMainMessage): void {
  self.postMessage(message);
}
