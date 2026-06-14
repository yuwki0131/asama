import { useCallback, useEffect, useRef, useState } from "react";
import type { WorldSnapshot } from "@asama/shared";
import { GameCanvas } from "../renderer/GameCanvas";
import { createSimulationClient, type SimulationClient } from "../worker-client/simulationClient";

export function App() {
  const simulationRef = useRef<SimulationClient | null>(null);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationStatus, setSimulationStatus] = useState("starting");
  const selectedUnits = snapshot?.units.filter((unit) => unit.selected) ?? [];

  useEffect(() => {
    let simulation: SimulationClient;
    try {
      simulation = createSimulationClient();
    } catch (error) {
      setSimulationStatus("failed");
      setSimulationError(error instanceof Error ? error.message : "Failed to create simulation worker");
      return;
    }

    setSimulationStatus("worker");
    simulationRef.current = simulation;
    const unsubscribe = simulation.subscribe((nextSnapshot) => {
      setSimulationStatus("ready");
      setSimulationError(null);
      setSnapshot(nextSnapshot);
    });
    const unsubscribeErrors = simulation.subscribeErrors(setSimulationError);
    simulation.init();
    simulation.setSpeed(1);
    return () => {
      unsubscribe();
      unsubscribeErrors();
      simulation.dispose();
      if (simulationRef.current === simulation) {
        simulationRef.current = null;
      }
    };
  }, []);

  const handleSelectUnit = useCallback(
    (unitId: string) => {
      simulationRef.current?.enqueueCommand({
        type: "selectUnits",
        unitIds: [unitId],
        issuedAtTick: snapshot?.currentTick ?? 0,
        clientSequence: Date.now()
      });
    },
    [snapshot?.currentTick]
  );

  const handleMoveSelected = useCallback(
    (destination: { readonly x: number; readonly y: number }) => {
      const selectedIds = snapshot?.units.filter((unit) => unit.selected).map((unit) => unit.id) ?? [];
      if (selectedIds.length === 0) {
        return;
      }

      simulationRef.current?.enqueueCommand({
        type: "moveUnits",
        unitIds: selectedIds,
        destination,
        issuedAtTick: snapshot?.currentTick ?? 0,
        clientSequence: Date.now()
      });
    },
    [snapshot?.currentTick, snapshot?.units]
  );

  return (
    <main className="app">
      <header className="topbar">
        <h1>Asama RTS</h1>
        <div className="stats">
          <span>tick {snapshot?.currentTick ?? 0}</span>
          <span>sim {simulationStatus}</span>
          <span>
            map {snapshot?.map.width ?? 128}x{snapshot?.map.height ?? 128}
          </span>
          <span>units {snapshot?.units.length ?? 0}</span>
          <span>selected {selectedUnits.length}</span>
          <span>
            destination{" "}
            {selectedUnits[0]?.destination === null || selectedUnits[0]?.destination === undefined
              ? "-"
              : `${selectedUnits[0].destination.x},${selectedUnits[0].destination.y}`}
          </span>
          {simulationError === null ? null : <span className="error-text">{simulationError}</span>}
        </div>
      </header>
      <section className="game-view">
        <GameCanvas snapshot={snapshot} onSelectUnit={handleSelectUnit} onMoveSelected={handleMoveSelected} />
      </section>
    </main>
  );
}
