import { useEffect, useMemo, useState } from "react";
import type { WorldSnapshot } from "@asama/shared";
import { GameCanvas } from "../renderer/GameCanvas";
import { createSimulationClient } from "../worker-client/simulationClient";

export function App() {
  const simulation = useMemo(() => createSimulationClient(), []);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);

  useEffect(() => {
    const unsubscribe = simulation.subscribe(setSnapshot);
    simulation.init();
    simulation.setSpeed(1);
    return () => {
      unsubscribe();
      simulation.dispose();
    };
  }, [simulation]);

  return (
    <main className="app">
      <header className="topbar">
        <h1>Asama RTS</h1>
        <div className="stats">
          <span>tick {snapshot?.currentTick ?? 0}</span>
          <span>
            map {snapshot?.map.width ?? 128}x{snapshot?.map.height ?? 128}
          </span>
          <span>units {snapshot?.units.length ?? 0}</span>
        </div>
      </header>
      <section className="game-view">
        <GameCanvas
          snapshot={snapshot}
          onSelectUnit={(unitId) =>
            simulation.enqueueCommand({
              type: "selectUnits",
              unitIds: [unitId],
              issuedAtTick: snapshot?.currentTick ?? 0,
              clientSequence: Date.now()
            })
          }
          onMoveSelected={(destination) => {
            const selectedIds = snapshot?.units.filter((unit) => unit.selected).map((unit) => unit.id) ?? [];
            if (selectedIds.length === 0) {
              return;
            }
            simulation.enqueueCommand({
              type: "moveUnits",
              unitIds: selectedIds,
              destination,
              issuedAtTick: snapshot?.currentTick ?? 0,
              clientSequence: Date.now()
            });
          }}
        />
      </section>
    </main>
  );
}
