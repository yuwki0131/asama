import type { CellCoord, MainToWorkerMessage, PlayerCommand, SerializedWorld, WorkerToMainMessage, WorldSnapshot } from "@asama/shared";

type SnapshotListener = (snapshot: WorldSnapshot) => void;
type ErrorListener = (message: string) => void;
type SaveStateListener = (state: SerializedWorld) => void;

export interface SimulationClient {
  init(): void;
  setSpeed(speed: 0 | 1 | 2 | 4): void;
  enqueueCommand(command: PlayerCommand): void;
  requestSaveState(): Promise<SerializedWorld>;
  loadSaveState(state: SerializedWorld): void;
  subscribe(listener: SnapshotListener): () => void;
  subscribeErrors(listener: ErrorListener): () => void;
  dispose(): void;
}

export function createSimulationClient(): SimulationClient {
  const worker = new Worker(new URL("../../worker/simulationWorker.ts", import.meta.url), {
    type: "module"
  });
  const listeners = new Set<SnapshotListener>();
  const errorListeners = new Set<ErrorListener>();
  const saveStateListeners = new Set<SaveStateListener>();
  let cachedMapCells: WorldSnapshot["map"]["cells"] | null = null;
  let cachedDecorations: WorldSnapshot["map"]["decorations"] | null = null;

  worker.addEventListener("message", (event: MessageEvent<WorkerToMainMessage>) => {
    const message = event.data;
    if (message.type === "ready" || message.type === "snapshot") {
      const snapshot = hydrateSnapshotMap(message.snapshot, cachedMapCells, cachedDecorations);
      cachedMapCells = snapshot.map.cells;
      cachedDecorations = snapshot.map.decorations;
      for (const listener of listeners) {
        listener(snapshot);
      }
      return;
    }

    if (message.type === "saveState") {
      for (const listener of saveStateListeners) {
        listener(message.state);
      }
      saveStateListeners.clear();
      return;
    }

    if (message.type === "commandRejected" || message.type === "error") {
      for (const listener of errorListeners) {
        listener(message.type === "error" ? message.message : message.reason);
      }
      console.warn(message);
    }
  });

  worker.addEventListener("error", (event) => {
    const message = event.message || "Simulation worker failed";
    for (const listener of errorListeners) {
      listener(message);
    }
  });

  worker.addEventListener("messageerror", () => {
    for (const listener of errorListeners) {
      listener("Simulation worker sent an unreadable message");
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
    requestSaveState() {
      return new Promise((resolve) => {
        saveStateListeners.add(resolve);
        post(worker, { type: "requestSaveState" });
      });
    },
    loadSaveState(state) {
      post(worker, { type: "loadSaveState", state });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeErrors(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    dispose() {
      worker.terminate();
      listeners.clear();
      errorListeners.clear();
    }
  };
}

function hydrateSnapshotMap(
  snapshot: WorldSnapshot,
  cachedMapCells: WorldSnapshot["map"]["cells"] | null,
  cachedDecorations: WorldSnapshot["map"]["decorations"] | null
): WorldSnapshot {
  if (snapshot.map.cells.length > 0) {
    return snapshot;
  }

  return {
    ...snapshot,
    map: {
      ...snapshot.map,
      cells: cachedMapCells ?? [],
      decorations: cachedDecorations ?? []
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
