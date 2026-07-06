import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BuildingType, CellCoord, EntityId, MarketTrade, Season, UnitId, UnitType, WorldSnapshot } from "@asama/shared";
import type {} from "../testBridge";
import { unitSpecs } from "@asama/content";
import { DEBUG_OVERLAY_DEFAULT_ENABLED, GameCanvas, type GameCanvasHandle, type ToolMode } from "../renderer/GameCanvas";
import { computeGroupCentroid } from "../renderer/groupManager";
import { createSimulationClient, type SimulationClient } from "../worker-client/simulationClient";
import { SelectionInfoPanel } from "./SelectionInfoPanel";
import { ticksToMmSs, unitTypeLabel } from "./selectionPanelUtils";

const RECRUITABLE_UNIT_TYPES: readonly UnitType[] = (Object.values(unitSpecs) as (typeof unitSpecs)[keyof typeof unitSpecs][])
  .filter((spec) => spec.type !== "supply_cart")
  .map((spec) => spec.type);

const DEBUG_STATUS_PANEL_ENABLED =
  import.meta.env.VITE_DEBUG_STATUS_PANEL === "true" ||
  (import.meta.env.DEV && import.meta.env.VITE_DEBUG_STATUS_PANEL !== "false");

export function App() {
  const simulationRef = useRef<SimulationClient | null>(null);
  const gameCanvasRef = useRef<GameCanvasHandle | null>(null);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const snapshotRef = useRef<WorldSnapshot | null>(null);
  const buildToolRef = useRef<BuildingType | "demolish" | "ladder" | "fillMoat" | null>(null);
  const tickWaitersRef = useRef<Map<number, Array<(s: WorldSnapshot) => void>>>(new Map());
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
    buildToolRef.current = buildTool;
  }, [buildTool]);

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
    if (!import.meta.env.DEV) return;
    window.__asamaTest = {
      getSnapshot: () => snapshotRef.current,
      enqueue: (command) => {
        simulationRef.current?.enqueueCommand(command);
      },
      setSpeed: (s) => {
        simulationRef.current?.setSpeed(s);
        setSpeed(s);
      },
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
      getBuildTool: () => buildToolRef.current,
      cellToScreenPoint: (cell) => gameCanvasRef.current?.cellToScreenPoint(cell) ?? null,
      getFps: () => gameCanvasRef.current?.getFps() ?? 0,
      setTone: (enabled) => {
        gameCanvasRef.current?.setTone(enabled);
      },
    };
    return () => {
      delete window.__asamaTest;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleCancelBuildTool = useCallback(() => {
    setBuildTool(null);
  }, []);

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

  const outcome = snapshot?.outcome ?? null;
  const food = snapshot?.food ?? null;
  const economy = snapshot?.economy ?? null;
  const alerts = useGameAlerts(snapshot);

  // Food crisis: show persistent banner when storage drops below 2 consumption cycles.
  const foodCritical =
    food !== null && food.requiredPerCycle > 0 && food.available < food.requiredPerCycle * 2;

  const currentTick = snapshot?.currentTick ?? 0;
  const holdDeadlineTick = snapshot?.holdDeadlineTick ?? null;
  const nextWaveTick = snapshot?.nextWaveTick ?? null;

  return (
    <main className="app">
      {/* Row 1: Time controls + resource displays */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="game-title">Asama</span>
          {([0, 1, 2, 4] as const).map((value) => (
            <button
              className={`speed-btn${speed === value ? " active" : ""}`}
              key={value}
              type="button"
              onClick={() => setSpeed(value)}
            >
              {value === 0 ? "⏸" : `${value}x`}
            </button>
          ))}
        </div>
        <div className="topbar-resources">
          <span className="res-item">
            <span className="res-label">兵糧</span>
            <span className={foodCritical ? "res-value res-critical" : "res-value"}>
              {food === null ? "-" : `${food.available}/${food.capacity}`}
              {food !== null && food.requiredPerCycle > 0 ? ` ▼${food.requiredPerCycle}` : ""}
            </span>
          </span>
          <span className="res-item">
            <span className="res-label">金</span>
            <span className="res-value">{economy?.gold ?? "-"}</span>
          </span>
          <span className="res-item">
            <span className="res-label">武器</span>
            <span className="res-value">{economy?.weapons ?? "-"}</span>
          </span>
          <span className="res-item">
            <span className="res-label">人口</span>
            <span className="res-value">
              {economy === null ? "-" : `${economy.population}/${economy.populationCapacity}`}
            </span>
          </span>
          <span className="res-item">
            <span className="res-label">招兵</span>
            <span className="res-value">
              {economy === null ? "-" : `${economy.recruitPool}/${economy.recruitPoolMax}`}
            </span>
          </span>
          <span className="res-item res-season">
            {economy === null ? "-" : `${economy.year}年 ${seasonLabel(economy.season)}`}
          </span>
        </div>
        <div className="topbar-right">
          {saveStatus !== null && <span className="save-status">{saveStatus}</span>}
          {simulationError !== null && <span className="error-text">{simulationError}</span>}
        </div>
      </header>

      {/* Row 2: Castle + Infrastructure build tools */}
      <div className="buildbar">
        <button className={buildTool === null ? "active" : ""} type="button" onClick={() => setBuildTool(null)}>
          Select
        </button>
        <span className="bar-divider" />
        <span className="bar-group-label">城郭</span>
        {CASTLE_TOOLS.map((tool) => (
          <button
            className={buildTool === tool.type ? "active" : ""}
            key={tool.type}
            type="button"
            onClick={() => setBuildTool(tool.type)}
          >
            {tool.label}
          </button>
        ))}
        <span className="bar-divider" />
        <span className="bar-group-label">インフラ</span>
        {INFRA_TOOLS.map((tool) => (
          <button
            className={buildTool === tool.type ? "active" : ""}
            key={tool.type}
            type="button"
            onClick={() => setBuildTool(tool.type)}
          >
            {tool.label}
          </button>
        ))}
        <span className="bar-divider" />
        <button
          className={buildTool === "demolish" ? "active danger" : "danger"}
          type="button"
          onClick={() => setBuildTool("demolish")}
        >
          解体
        </button>
      </div>

      {/* Row 3: Economy + Military + Engineer + Market + System */}
      <div className="buildbar">
        <span className="bar-group-label">経済</span>
        {ECONOMY_TOOLS.map((tool) => (
          <button
            className={buildTool === tool.type ? "active" : ""}
            key={tool.type}
            type="button"
            onClick={() => setBuildTool(tool.type)}
          >
            {tool.label}
          </button>
        ))}
        <span className="bar-divider" />
        <span className="bar-group-label">徴兵</span>
        {RECRUITABLE_UNIT_TYPES.map((type) => (
          <button key={type} type="button" onClick={() => handleRecruit(type)}>
            {unitTypeLabel(type)}
          </button>
        ))}
        <span className="bar-divider" />
        <span className="bar-group-label">工兵</span>
        <button
          className={buildTool === "ladder" ? "active" : ""}
          type="button"
          onClick={() => setBuildTool("ladder")}
        >
          梯子
        </button>
        <button
          className={buildTool === "fillMoat" ? "active" : ""}
          type="button"
          onClick={() => setBuildTool("fillMoat")}
        >
          堀埋
        </button>
        <span className="bar-divider" />
        <span className="bar-group-label">市場</span>
        <button type="button" onClick={() => handleMarketTrade("buyFood")}>食購入</button>
        <button type="button" onClick={() => handleMarketTrade("sellFood")}>食売却</button>
        <button type="button" onClick={() => handleMarketTrade("buyWeapons")}>武購入</button>
        <span className="bar-divider" />
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

      <section className="game-view">
        {/* Persistent status panel: hold timer + next wave (top-left) */}
        {(holdDeadlineTick !== null || nextWaveTick !== null) && outcome === null ? (
          <div className="status-panel">
            {holdDeadlineTick !== null && (
              <div className="status-row">
                <span className="status-label">本丸保持</span>
                <span className="status-value">{ticksToMmSs(Math.max(0, holdDeadlineTick - currentTick))}</span>
              </div>
            )}
            {nextWaveTick !== null && nextWaveTick > currentTick && (
              <div className="status-row status-warn">
                <span className="status-label">敵援軍</span>
                <span className="status-value">{ticksToMmSs(nextWaveTick - currentTick)}</span>
              </div>
            )}
          </div>
        ) : null}

        {/* Emergency banners: stacked at top-center */}
        <div className="top-banner-stack">
          {snapshot?.supplyRetreat.active === true ? (
            <div className="retreat-banner">
              敵兵站切断! 撤退まで {ticksToMmSs(snapshot.supplyRetreat.remainingTicks)}
            </div>
          ) : null}
          {foodCritical && outcome === null ? (
            <div className="food-crisis-banner" role="alert">
              ⚠ 兵糧危機!　残{food?.available ?? 0}（消費{food?.requiredPerCycle ?? 0}/サイクル）
            </div>
          ) : null}
        </div>

        {/* Alert toasts: tactical events (top-center, below banners) */}
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
                    : outcome.reason === "supply_cut"
                      ? "敵兵站を断ち、敵軍を撤退させました"
                      : "敵軍を全滅させました"}
            </span>
          </div>
        )}
        <GameCanvas
          ref={gameCanvasRef}
          buildTool={buildTool}
          debugOverlayVisible={debugVisible}
          snapshot={snapshot}
          speed={speed}
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
          onCancelBuildTool={handleCancelBuildTool}
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

// Building tools split by category for the 3-row header layout.
const CASTLE_TOOLS: readonly { readonly type: BuildingType; readonly label: string }[] = [
  { type: "fence", label: "柵" },
  { type: "wall", label: "壁" },
  { type: "gate_wide_3", label: "門NW" },
  { type: "gate_wide_3_ne_sw", label: "門NE" },
  { type: "yagura", label: "矢倉" },
  { type: "honmaru", label: "本丸" },
  { type: "tenshu", label: "天守" }
];

const INFRA_TOOLS: readonly { readonly type: BuildingType; readonly label: string }[] = [
  { type: "dry_moat", label: "空堀" },
  { type: "water_moat", label: "水堀" },
  { type: "road", label: "道" },
  { type: "earth_bridge", label: "土橋" },
  { type: "wood_bridge", label: "木橋" }
];

const ECONOMY_TOOLS: readonly { readonly type: BuildingType; readonly label: string }[] = [
  { type: "farm", label: "農地" },
  { type: "storehouse", label: "蔵" },
  { type: "market", label: "市場" },
  { type: "barracks", label: "兵舎" },
  { type: "samurai_residence", label: "武家屋敷" },
  { type: "town_block", label: "町区画" }
];
