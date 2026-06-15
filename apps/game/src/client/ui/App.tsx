import { useCallback, useEffect, useRef, useState } from "react";
import type { BuildingType, CellCoord, WorldSnapshot } from "@asama/shared";
import { GameCanvas } from "../renderer/GameCanvas";
import { createSimulationClient, type SimulationClient } from "../worker-client/simulationClient";

const DEBUG_STATUS_PANEL_ENABLED =
  import.meta.env.VITE_DEBUG_STATUS_PANEL === "true" ||
  (import.meta.env.DEV && import.meta.env.VITE_DEBUG_STATUS_PANEL !== "false");

export function App() {
  const simulationRef = useRef<SimulationClient | null>(null);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationStatus, setSimulationStatus] = useState("starting");
  const [buildTool, setBuildTool] = useState<BuildingType | "demolish" | null>(null);
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

  const handlePlaceBuilding = useCallback(
    (buildingType: BuildingType, position: CellCoord) => {
      simulationRef.current?.enqueueCommand({
        type: "placeBuilding",
        buildingType,
        position,
        issuedAtTick: snapshot?.currentTick ?? 0,
        clientSequence: Date.now()
      });
    },
    [snapshot?.currentTick]
  );

  const handleDemolishBuilding = useCallback(
    (position: CellCoord) => {
      simulationRef.current?.enqueueCommand({
        type: "demolishBuilding",
        position,
        issuedAtTick: snapshot?.currentTick ?? 0,
        clientSequence: Date.now()
      });
    },
    [snapshot?.currentTick]
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
      <div className="buildbar">
        <button className={buildTool === null ? "active" : ""} type="button" onClick={() => setBuildTool(null)}>
          Select
        </button>
        {buildingTools.map((tool) => (
          <button
            className={buildTool === tool.type ? "active" : ""}
            key={tool.type}
            type="button"
            onClick={() => setBuildTool(tool.type)}
          >
            {tool.label}
          </button>
        ))}
        <button
          className={buildTool === "demolish" ? "active danger" : "danger"}
          type="button"
          onClick={() => setBuildTool("demolish")}
        >
          Demolish
        </button>
      </div>
      <section className="game-view">
        <GameCanvas
          buildTool={buildTool}
          snapshot={snapshot}
          onDemolishBuilding={handleDemolishBuilding}
          onPlaceBuilding={handlePlaceBuilding}
          onSelectUnit={handleSelectUnit}
          onMoveSelected={handleMoveSelected}
        />
        {DEBUG_STATUS_PANEL_ENABLED ? (
          <DebugStatusPanel
            buildTool={buildTool}
            selectedUnits={selectedUnits}
            simulationError={simulationError}
            simulationStatus={simulationStatus}
            snapshot={snapshot}
          />
        ) : null}
      </section>
    </main>
  );
}

interface DebugStatusPanelProps {
  readonly buildTool: BuildingType | "demolish" | null;
  readonly selectedUnits: NonNullable<WorldSnapshot["units"]>;
  readonly simulationError: string | null;
  readonly simulationStatus: string;
  readonly snapshot: WorldSnapshot | null;
}

function DebugStatusPanel({
  buildTool,
  selectedUnits,
  simulationError,
  simulationStatus,
  snapshot
}: DebugStatusPanelProps) {
  const buildingCounts = buildingTypeCounts(snapshot);
  const selectedUnit = selectedUnits[0] ?? null;
  const invalidMoveTarget = snapshot?.invalidMoveTarget ?? null;

  return (
    <aside className="debug-status-panel" aria-label="Debug status">
      <div className="debug-status-header">
        <span>Debug Status</span>
        <span className="debug-status-flag">VITE_DEBUG_STATUS_PANEL</span>
      </div>
      <dl className="debug-status-grid">
        <DebugRow label="flag" value="on" />
        <DebugRow label="sim" value={simulationStatus} />
        <DebugRow label="tick" value={String(snapshot?.currentTick ?? 0)} />
        <DebugRow label="map" value={`${snapshot?.map.width ?? 128}x${snapshot?.map.height ?? 128}`} />
        <DebugRow label="tool" value={buildTool ?? "select"} />
        <DebugRow label="units" value={String(snapshot?.units.length ?? 0)} />
        <DebugRow label="selected" value={String(selectedUnits.length)} />
        <DebugRow label="selected id" value={selectedUnit?.id ?? "-"} />
        <DebugRow
          label="selected pos"
          value={selectedUnit === null ? "-" : `${selectedUnit.position.x},${selectedUnit.position.y}`}
        />
        <DebugRow label="path len" value={String(selectedUnit?.path.length ?? 0)} />
        <DebugRow
          label="invalid target"
          value={invalidMoveTarget === null ? "-" : `${invalidMoveTarget.x},${invalidMoveTarget.y}`}
        />
        <DebugRow label="buildings" value={String(snapshot?.buildings.length ?? 0)} />
        <DebugRow label="types" value={buildingCounts} />
        <DebugRow label="error" value={simulationError ?? "-"} />
      </dl>
    </aside>
  );
}

function DebugRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function buildingTypeCounts(snapshot: WorldSnapshot | null): string {
  if (snapshot === null || snapshot.buildings.length === 0) {
    return "-";
  }

  const counts = new Map<BuildingType, number>();
  for (const building of snapshot.buildings) {
    counts.set(building.type, (counts.get(building.type) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");
}

const buildingTools: readonly { readonly type: BuildingType; readonly label: string }[] = [
  { type: "fence", label: "Fence" },
  { type: "wall", label: "Wall" },
  { type: "gate", label: "Gate 1" },
  { type: "gate_wide_2", label: "Gate 2" },
  { type: "gate_wide_3", label: "Gate 3" },
  { type: "dry_moat", label: "Dry Moat" },
  { type: "water_moat", label: "Water Moat" },
  { type: "road", label: "Road" },
  { type: "earth_bridge", label: "Earth Bridge" },
  { type: "wood_bridge", label: "Wood Bridge" },
  { type: "farm", label: "Farm" },
  { type: "storehouse", label: "Storehouse" },
  { type: "market", label: "Market" },
  { type: "barracks", label: "Barracks" },
  { type: "samurai_residence", label: "Samurai House" },
  { type: "town_block", label: "Town Block" },
  { type: "honmaru", label: "Honmaru" },
  { type: "tenshu", label: "Tenshu" }
];
