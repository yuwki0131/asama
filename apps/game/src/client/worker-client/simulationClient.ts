import type { CellCoord, MainToWorkerMessage, PlayerCommand, WorkerToMainMessage, WorldSnapshot } from "@asama/shared";

type SnapshotListener = (snapshot: WorldSnapshot) => void;

export interface SimulationClient {
  init(): void;
  setSpeed(speed: 0 | 1 | 2 | 4): void;
  enqueueCommand(command: PlayerCommand): void;
  subscribe(listener: SnapshotListener): () => void;
  dispose(): void;
}

export function createSimulationClient(): SimulationClient {
  const worker = new Worker(new URL("../../worker/simulationWorker.ts", import.meta.url), {
    type: "module"
  });
  const listeners = new Set<SnapshotListener>();

  worker.addEventListener("message", (event: MessageEvent<WorkerToMainMessage>) => {
    const message = event.data;
    if (message.type === "ready" || message.type === "snapshot") {
      for (const listener of listeners) {
        listener(message.snapshot);
      }
      return;
    }

    if (message.type === "commandRejected" || message.type === "error") {
      console.warn(message);
    }
  });

  return {
    init() {
      post(worker, { type: "init" });
    },
    setSpeed(speed) {
      post(worker, { type: "setSpeed", speed });
    },
    enqueueCommand(command) {
      post(worker, { type: "enqueueCommand", command });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      worker.terminate();
      listeners.clear();
    }
  };
}

function post(worker: Worker, message: MainToWorkerMessage): void {
  worker.postMessage(message);
}

export function screenToCell(x: number, y: number): CellCoord {
  const tileWidth = 64;
  const tileHeight = 32;
  return {
    x: Math.floor(y / tileHeight + x / tileWidth),
    y: Math.floor(y / tileHeight - x / tileWidth)
  };
}
