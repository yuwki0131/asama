// Simplified App shell for the trial 3D renderer (?renderer=3d).
//
// Keeps the shipped PixiJS App untouched: this component owns its own
// simulation client, scenario selection, and canvas. The trial is
// evaluation-only, so the HUD is intentionally minimal (no build/recruit
// bars — the geometry is the point of the test). Selection, camera, and
// picking are wired to the ThreeGameCanvas.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CellCoord, WorldSnapshot } from "@asama/shared";
import type {} from "../testBridge";
import { createSimulationClient, type SimulationClient } from "../worker-client/simulationClient";
import { LoadingScreen } from "./LoadingScreen";
import { ScenarioSelectScreen } from "./ScenarioSelectScreen";
import { ThreeGameCanvas, type ThreeGameCanvasHandle } from "../renderer3d/ThreeGameCanvas";
import { Minimap3d } from "../renderer3d/Minimap3d";
import { TRIAL_SCENARIO_ID } from "../rendererMode";

const DEV_SCENARIO_ID = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("scenario") ?? undefined
  : undefined;

export function App3d() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    DEV_SCENARIO_ID ?? TRIAL_SCENARIO_ID
  );
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [simulationStatus, setSimulationStatus] = useState("starting");
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [loadingFaded, setLoadingFaded] = useState(false);
  const [selectedCell, setSelectedCell] = useState<CellCoord | null>(null);
  const simulationRef = useRef<SimulationClient | null>(null);
  const gameCanvasRef = useRef<ThreeGameCanvasHandle | null>(null);
  const snapshotRef = useRef<WorldSnapshot | null>(null);
  const tickWaitersRef = useRef<Map<number, Array<(s: WorldSnapshot) => void>>>(new Map());

  useEffect(() => {
    snapshotRef.current = snapshot;
    if (snapshot === null) return;
    const waiters = tickWaitersRef.current;
    for (const [tick, resolvers] of [...waiters.entries()]) {
      if (snapshot.currentTick >= tick) {
        waiters.delete(tick);
        for (const resolve of resolvers) resolve(snapshot);
      }
    }
  }, [snapshot]);

  useEffect(() => {
    if (simulationStatus !== "ready" || loadingFaded) return;
    const timer = setTimeout(() => setLoadingFaded(true), 500);
    return () => clearTimeout(timer);
  }, [simulationStatus, loadingFaded]);

  useEffect(() => {
    if (selectedScenarioId === null) return;
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
    const unsubscribe = simulation.subscribe((next) => {
      setSimulationStatus("ready");
      setSimulationError(null);
      setSnapshot(next);
    });
    const unsubscribeErrors = simulation.subscribeErrors(setSimulationError);
    simulation.init(selectedScenarioId);
    simulation.setSpeed(1);
    return () => {
      unsubscribe();
      unsubscribeErrors();
      simulation.dispose();
      if (simulationRef.current === simulation) {
        simulationRef.current = null;
      }
    };
  }, [selectedScenarioId]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__asamaTest = {
      getSnapshot: () => snapshotRef.current,
      enqueue: (command) => simulationRef.current?.enqueueCommand(command),
      setSpeed: (s) => simulationRef.current?.setSpeed(s),
      waitForTick: (tick) =>
        new Promise<WorldSnapshot>((resolve) => {
          const current = snapshotRef.current;
          if (current !== null && current.currentTick >= tick) {
            resolve(current);
            return;
          }
          const list = tickWaitersRef.current.get(tick) ?? [];
          list.push(resolve);
          tickWaitersRef.current.set(tick, list);
        }),
      getBuildTool: () => null,
      cellToScreenPoint: (cell) => gameCanvasRef.current?.cellToScreenPoint(cell) ?? null,
      jumpCameraToCell: (cell) => gameCanvasRef.current?.jumpCameraToCell(cell),
      getFps: () => gameCanvasRef.current?.getFps() ?? 0,
      setTone: (enabled) => gameCanvasRef.current?.setTone(enabled),
      setSeason: () => {
        /* trial 3D does not support season override */
      },
    };
    return () => {
      delete window.__asamaTest;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectCell = useCallback((cell: CellCoord | null) => {
    setSelectedCell(cell);
  }, []);

  if (selectedScenarioId === null) {
    return <ScenarioSelectScreen onSelect={setSelectedScenarioId} />;
  }

  return (
    <>
      <main className="app app-3d-trial">
        <header className="topbar">
          <div className="topbar-left">
            <span className="game-title">Asama — 3D Trial</span>
            <span style={{ color: "#888", marginLeft: 12 }}>
              scenario: {selectedScenarioId}
            </span>
          </div>
          <div className="topbar-right">
            {simulationError !== null && (
              <span className="error-text">{simulationError}</span>
            )}
            {selectedCell !== null && (
              <span className="save-status">
                cell: {selectedCell.x},{selectedCell.y}
              </span>
            )}
          </div>
        </header>
        <section className="game-view" style={{ flex: 1, position: "relative" }}>
          <ThreeGameCanvas
            key={selectedScenarioId}
            ref={gameCanvasRef}
            scenarioId={selectedScenarioId}
            snapshot={snapshot}
            onCellSelected={handleSelectCell}
          />
          <div className="minimap-3d-wrap" title="クリックでカメラ移動">
            <Minimap3d
              snapshot={snapshot}
              onJump={(cell) => gameCanvasRef.current?.jumpCameraToCell(cell)}
            />
            <div className="minimap-3d-help">
              ↑↓←→/WASD: 移動 &nbsp; +/−: ズーム &nbsp; Home: 中心へ &nbsp; クリック: セル選択
            </div>
          </div>
        </section>
      </main>
      {!loadingFaded && (
        <LoadingScreen
          status={simulationStatus}
          isReady={simulationStatus === "ready"}
        />
      )}
    </>
  );
}
