import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BuildingType, CellCoord, EntityId, MarketTrade, Season, UnitId, UnitType, WorldSnapshot } from "@asama/shared";
import { DEBUG_OVERLAY_DEFAULT_ENABLED, GameCanvas, type GameCanvasHandle, type ToolMode } from "../renderer/GameCanvas";
import { computeGroupCentroid } from "../renderer/groupManager";
import { createSimulationClient, type SimulationClient } from "../worker-client/simulationClient";
import { SelectionInfoPanel } from "./SelectionInfoPanel";

const DEBUG_STATUS_PANEL_ENABLED =
  import.meta.env.VITE_DEBUG_STATUS_PANEL === "true" ||
  (import.meta.env.DEV && import.meta.env.VITE_DEBUG_STATUS_PANEL !== "false");

export function App() {
  const simulationRef = useRef<SimulationClient | null>(null);
  const gameCanvasRef = useRef<GameCanvasHandle | null>(null);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationStatus, setSimulationStatus] = useState("starting");
  const [buildTool, setBuildTool] = useState<ToolMode>(null);
  const [debugVisible, setDebugVisible] = useState(DEBUG_STATUS_PANEL_ENABLED || DEBUG_OVERLAY_DEFAULT_ENABLED);
  const [speed, setSpeed] = useState<0 | 1 | 2 | 4>(1);
  const lastRunningSpeedRef = useRef<1 | 2 | 4>(1);
  const selectedUnits = snapshot?.units.filter((unit) => unit.selected) ?? [];

  // Unit groups: Ctrl+1~9 saves, 1~9 recalls
  const [groups, setGroups] = useState<ReadonlyMap<number, readonly UnitId[]>>(new Map());
  const [selectedCell, setSelectedCell] = useState<CellCoord | null>(null);

  const selectedBuilding = useMemo(() => {
    if (selectedCell === null || snapshot === null || selectedUnits.length > 0) {
      return null;
    }
    return (
      snapshot.buildings.find(
        (b) =>
          b.lifecycleState === "intact" &&
          b.footprint.some((c) => c.x === selectedCell.x && c.y === selectedCell.y)
      ) ?? null
    );
  }, [selectedCell, snapshot, selectedUnits.length]);

  useEffect(() => {
    simulationRef.current?.setSpeed(speed);
    if (speed !== 0) {
      lastRunningSpeedRef.current = speed;
    }
  }, [speed]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      event.preventDefault();
      setSpeed((current) => (current === 0 ? lastRunningSpeedRef.current : 0));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const handleSelectUnits = useCallback(
    (unitIds: readonly string[], additive: boolean) => {
      let nextIds: readonly string[] = unitIds;
      if (additive) {
        // Shift adds to the selection; shift-clicking an already selected
        // unit removes it (controls spec: 追加・除外).
        const current = new Set(snapshot?.units.filter((unit) => unit.selected).map((unit) => unit.id) ?? []);
        for (const id of unitIds) {
          if (current.has(id)) {
            current.delete(id);
          } else {
            current.add(id);
          }
        }
        nextIds = [...current];
      }
      simulationRef.current?.enqueueCommand({
        type: "selectUnits",
        unitIds: nextIds,
        issuedAtTick: snapshot?.currentTick ?? 0,
        clientSequence: Date.now()
      });
    },
    [snapshot?.currentTick, snapshot?.units]
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

  const handleAttackTarget = useCallback(
    (targetId: EntityId) => {
      const selectedIds = snapshot?.units.filter((unit) => unit.selected).map((unit) => unit.id) ?? [];
      if (selectedIds.length === 0) {
        return;
      }

      simulationRef.current?.enqueueCommand({
        type: "attackTarget",
        unitIds: selectedIds,
        targetId,
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

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveSlot, setSaveSlot] = useState("quicksave");

  const saveToSlot = useCallback(async (slot: string, silent = false) => {
    const simulation = simulationRef.current;
    if (simulation === null) {
      return;
    }
    try {
      const state = await simulation.requestSaveState();
      const response = await fetch("/api/saves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ saveId: slot, data: state })
      });
      if (!silent || !response.ok) {
        setSaveStatus(response.ok ? `${slot} saved` : `save failed (${response.status})`);
      }
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "save failed");
    }
  }, []);

  const loadFromSlot = useCallback(async (slot: string) => {
    const simulation = simulationRef.current;
    if (simulation === null) {
      return;
    }
    try {
      const response = await fetch(`/api/saves/${slot}`);
      if (!response.ok) {
        setSaveStatus(`load failed (${response.status})`);
        return;
      }
      const stream = response.body?.pipeThrough(new DecompressionStream("gzip"));
      if (stream === undefined) {
        setSaveStatus("load failed (no body)");
        return;
      }
      const state = JSON.parse(await new Response(stream).text());
      simulation.loadSaveState(state);
      setSaveStatus(`${slot} loaded`);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "load failed");
    }
  }, []);

  // Autosave every two minutes while the game is undecided.
  const outcomeDecided = snapshot?.outcome != null;
  useEffect(() => {
    if (outcomeDecided) {
      return;
    }
    const timer = setInterval(() => {
      void saveToSlot("autosave", true);
    }, 120000);
    return () => clearInterval(timer);
  }, [outcomeDecided, saveToSlot]);

  const handleToggleGate = useCallback(
    (position: CellCoord) => {
      simulationRef.current?.enqueueCommand({
        type: "toggleGate",
        position,
        issuedAtTick: snapshot?.currentTick ?? 0,
        clientSequence: Date.now()
      });
    },
    [snapshot?.currentTick]
  );

  const handleEngineerTask = useCallback(
    (task: "ladder" | "fillMoat", position: CellCoord) => {
      const selectedIds = snapshot?.units.filter((unit) => unit.selected).map((unit) => unit.id) ?? [];
      simulationRef.current?.enqueueCommand({
        type: "engineerTask",
        unitIds: selectedIds,
        task,
        position,
        issuedAtTick: snapshot?.currentTick ?? 0,
        clientSequence: Date.now()
      });
    },
    [snapshot?.currentTick, snapshot?.units]
  );

  const handleAttackMove = useCallback(
    (destination: CellCoord) => {
      const selectedIds = snapshot?.units.filter((unit) => unit.selected).map((unit) => unit.id) ?? [];
      if (selectedIds.length === 0) {
        return;
      }
      simulationRef.current?.enqueueCommand({
        type: "attackMoveUnits",
        unitIds: selectedIds,
        destination,
        issuedAtTick: snapshot?.currentTick ?? 0,
        clientSequence: Date.now()
      });
    },
    [snapshot?.currentTick, snapshot?.units]
  );

  const handleStopSelected = useCallback(() => {
    const selectedIds = snapshot?.units.filter((unit) => unit.selected).map((unit) => unit.id) ?? [];
    if (selectedIds.length === 0) {
      return;
    }
    simulationRef.current?.enqueueCommand({
      type: "stopUnits",
      unitIds: selectedIds,
      issuedAtTick: snapshot?.currentTick ?? 0,
      clientSequence: Date.now()
    });
  }, [snapshot?.currentTick, snapshot?.units]);

  const handleGroupSave = useCallback((groupNum: number, unitIds: readonly UnitId[]) => {
    setGroups((prev) => new Map(prev).set(groupNum, unitIds));
  }, []);

  const handleGroupRecall = useCallback(
    (groupNum: number, jump: boolean) => {
      const ids = groups.get(groupNum) ?? [];
      if (ids.length > 0) {
        simulationRef.current?.enqueueCommand({
          type: "selectUnits",
          unitIds: ids,
          issuedAtTick: snapshot?.currentTick ?? 0,
          clientSequence: Date.now()
        });
      }
      if (jump && ids.length > 0 && snapshot !== null) {
        const centroid = computeGroupCentroid(ids, snapshot);
        if (centroid !== null) {
          gameCanvasRef.current?.jumpCameraToCell(centroid);
        }
      }
    },
    [groups, snapshot]
  );

  const outcome = snapshot?.outcome ?? null;
  const food = snapshot?.food ?? null;
  const economy = snapshot?.economy ?? null;
  const alerts = useGameAlerts(snapshot);

  const handleRecruit = useCallback(
    (unitType: UnitType) => {
      simulationRef.current?.enqueueCommand({
        type: "recruitUnit",
        unitType,
        issuedAtTick: snapshot?.currentTick ?? 0,
        clientSequence: Date.now()
      });
    },
    [snapshot?.currentTick]
  );

  const handleMarketTrade = useCallback(
    (trade: MarketTrade) => {
      simulationRef.current?.enqueueCommand({
        type: "marketTrade",
        trade,
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
          <span>
            food {food === null ? "-" : `${food.available}/${food.capacity}`}
            {food !== null && food.requiredPerCycle > 0
              ? ` (-${food.requiredPerCycle} in ${Math.ceil(food.nextConsumptionInTicks / 20)}s)`
              : ""}
          </span>
          <span>gold {economy?.gold ?? "-"}</span>
          <span>weapons {economy?.weapons ?? "-"}</span>
          <span>
            pop {economy === null ? "-" : `${economy.population}/${economy.populationCapacity}`}
          </span>
          <span>
            recruits {economy === null ? "-" : `${economy.recruitPool}/${economy.recruitPoolMax}`}
          </span>
          <span>{economy === null ? "-" : `${economy.year}年 ${seasonLabel(economy.season)}`}</span>
          <span>selected {selectedUnits.length}</span>
          <span>
            destination{" "}
            {selectedUnits[0]?.destination === null || selectedUnits[0]?.destination === undefined
              ? "-"
              : `${selectedUnits[0].destination.x},${selectedUnits[0].destination.y}`}
          </span>
          {saveStatus === null ? null : <span>{saveStatus}</span>}
          {simulationError === null ? null : <span className="error-text">{simulationError}</span>}
          {([0, 1, 2, 4] as const).map((value) => (
            <button
              className={speed === value ? "active" : ""}
              key={value}
              type="button"
              onClick={() => setSpeed(value)}
            >
              {value === 0 ? "⏸" : `${value}x`}
            </button>
          ))}
          <select value={saveSlot} onChange={(event) => setSaveSlot(event.target.value)}>
            <option value="quicksave">quicksave</option>
            <option value="slot1">slot1</option>
            <option value="slot2">slot2</option>
            <option value="slot3">slot3</option>
            <option value="autosave">autosave</option>
          </select>
          <button type="button" disabled={saveSlot === "autosave"} onClick={() => void saveToSlot(saveSlot)}>
            Save
          </button>
          <button type="button" onClick={() => void loadFromSlot(saveSlot)}>
            Load
          </button>
          <button
            className={debugVisible ? "active" : ""}
            type="button"
            onClick={() => setDebugVisible((visible) => !visible)}
          >
            Debug
          </button>
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
        <span className="bar-divider" />
        <button type="button" onClick={() => handleRecruit("spear_ashigaru")}>
          徴兵:槍
        </button>
        <button type="button" onClick={() => handleRecruit("sword_ashigaru")}>
          徴兵:刀
        </button>
        <button type="button" onClick={() => handleRecruit("archer")}>
          徴兵:弓
        </button>
        <button type="button" onClick={() => handleRecruit("engineer")}>
          徴兵:工兵
        </button>
        <span className="bar-divider" />
        <button className={buildTool === "ladder" ? "active" : ""} type="button" onClick={() => setBuildTool("ladder")}>
          梯子設置
        </button>
        <button className={buildTool === "fillMoat" ? "active" : ""} type="button" onClick={() => setBuildTool("fillMoat")}>
          堀埋め
        </button>
        <span className="bar-divider" />
        <button type="button" onClick={() => handleMarketTrade("buyFood")}>
          市場:食料購入
        </button>
        <button type="button" onClick={() => handleMarketTrade("sellFood")}>
          市場:食料売却
        </button>
        <button type="button" onClick={() => handleMarketTrade("buyWeapons")}>
          市場:武器購入
        </button>
      </div>
      <section className="game-view">
        {alerts.length === 0 ? null : (
          <div className="alert-stack" aria-live="polite">
            {alerts.map((alert) => (
              <div className="alert-toast" key={alert.id}>
                {alert.text}
              </div>
            ))}
          </div>
        )}
        {outcome === null ? null : (
          <div className={`outcome-banner ${outcome.winner === "player" ? "victory" : "defeat"}`}>
            <strong>{outcome.winner === "player" ? "勝利" : "敗北"}</strong>
            <span>
              {outcome.reason === "honmaru_fallen"
                ? "本丸が陥落しました"
                : outcome.reason === "starvation"
                  ? "兵糧が尽き、開城しました"
                  : outcome.reason === "time_held"
                    ? "規定時間、本丸を守り抜きました"
                    : "敵軍を全滅させました"}
            </span>
          </div>
        )}
        <GameCanvas
          ref={gameCanvasRef}
          buildTool={buildTool}
          debugOverlayVisible={debugVisible}
          snapshot={snapshot}
          onDemolishBuilding={handleDemolishBuilding}
          onPlaceBuilding={handlePlaceBuilding}
          onToggleGate={handleToggleGate}
          onEngineerTask={handleEngineerTask}
          onAttackMove={handleAttackMove}
          onStopSelected={handleStopSelected}
          onSelectUnits={handleSelectUnits}
          onAttackTarget={handleAttackTarget}
          onMoveSelected={handleMoveSelected}
          onCellSelected={setSelectedCell}
          onGroupSave={handleGroupSave}
          onGroupRecall={handleGroupRecall}
        />
        <SelectionInfoPanel selectedUnits={selectedUnits} selectedBuilding={selectedBuilding} />
        {debugVisible ? (
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

interface GameAlert {
  readonly id: number;
  readonly text: string;
}

const ALERT_DURATION_MS = 6000;
const HONMARU_ALERT_RANGE = 12;

/** Derives alert toasts by diffing successive snapshots client-side. */
function useGameAlerts(snapshot: WorldSnapshot | null): readonly GameAlert[] {
  const [alerts, setAlerts] = useState<readonly (GameAlert & { readonly expiresAt: number })[]>([]);
  const nextIdRef = useRef(1);
  const prevRef = useRef<{
    enemyCount: number;
    ladderedWalls: number;
    foodLow: boolean;
    enemyNearHonmaru: boolean;
  } | null>(null);

  useEffect(() => {
    if (snapshot === null) {
      return;
    }
    const enemyCount = snapshot.units.filter((unit) => unit.owner === "enemy").length;
    const ladderedWalls = snapshot.buildings.filter(
      (building) => building.owner === "player" && building.ladderHp !== null
    ).length;
    const foodLow = snapshot.food.requiredPerCycle > 0 && snapshot.food.available < snapshot.food.requiredPerCycle * 3;
    const honmaru = snapshot.buildings.find((building) => building.type === "honmaru");
    const enemyNearHonmaru =
      honmaru !== undefined &&
      snapshot.units.some(
        (unit) =>
          unit.owner === "enemy" &&
          Math.abs(unit.position.x - honmaru.position.x) + Math.abs(unit.position.y - honmaru.position.y) <=
            HONMARU_ALERT_RANGE
      );

    const previous = prevRef.current;
    prevRef.current = { enemyCount, ladderedWalls, foodLow, enemyNearHonmaru };
    if (previous === null) {
      return;
    }

    const fired: string[] = [];
    if (enemyCount > previous.enemyCount) {
      fired.push("敵の増援が出現しました");
    }
    if (ladderedWalls > previous.ladderedWalls) {
      fired.push("城壁に梯子が架けられています!");
    }
    if (foodLow && !previous.foodLow) {
      fired.push("兵糧が残りわずかです");
    }
    if (enemyNearHonmaru && !previous.enemyNearHonmaru) {
      fired.push("敵が本丸に接近しています!");
    }
    if (fired.length === 0) {
      return;
    }
    const now = Date.now();
    setAlerts((current) => [
      ...current.filter((alert) => alert.expiresAt > now),
      ...fired.map((text) => ({ id: nextIdRef.current++, text, expiresAt: now + ALERT_DURATION_MS }))
    ]);
  }, [snapshot]);

  useEffect(() => {
    if (alerts.length === 0) {
      return;
    }
    const timer = setInterval(() => {
      const now = Date.now();
      setAlerts((current) => (current.some((alert) => alert.expiresAt <= now) ? current.filter((alert) => alert.expiresAt > now) : current));
    }, 1000);
    return () => clearInterval(timer);
  }, [alerts.length]);

  return alerts;
}

function seasonLabel(season: Season): string {
  switch (season) {
    case "spring":
      return "春";
    case "summer":
      return "夏";
    case "autumn":
      return "秋";
    case "winter":
      return "冬";
  }
}

interface DebugStatusPanelProps {
  readonly buildTool: ToolMode;
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
        <DebugRow label="selected owner" value={selectedUnit?.owner ?? "-"} />
        <DebugRow label="selected type" value={selectedUnit?.type ?? "-"} />
        <DebugRow label="selected hp" value={selectedUnit === null ? "-" : `${selectedUnit.hp}/${selectedUnit.maxHp}`} />
        <DebugRow label="target id" value={selectedUnit?.targetId ?? "-"} />
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
  // MVP exposes only the 3-tile gates (2026-07-03 decision); the narrower
  // gate types remain in the data model but are not placeable.
  { type: "gate_wide_3", label: "Gate NW-SE" },
  { type: "gate_wide_3_ne_sw", label: "Gate NE-SW" },
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
  { type: "yagura", label: "Yagura" },
  { type: "honmaru", label: "Honmaru" },
  { type: "tenshu", label: "Tenshu" }
];
