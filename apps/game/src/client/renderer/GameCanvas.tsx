import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { Application, Container } from "pixi.js";
import type { BuildingType, CellCoord, EntityId, UnitId, WorldSnapshot } from "@asama/shared";
import { loadGeneratedAssets, type LoadedAsset } from "./assets";
import { cellToWorld, centerCameraOnCell, snapCamera, worldToScreen, type CameraState } from "./camera";
import { registerKeyboardInput, registerPointerInput } from "./input";
import { drawMinimap, jumpCameraFromMinimap, MAP_HEIGHT, MAP_WIDTH, type MinimapTerrainCache } from "./minimap";
import { renderScene } from "./renderScene";

export type ToolMode = BuildingType | "demolish" | "ladder" | "fillMoat" | null;

export interface GameCanvasHandle {
  jumpCameraToCell: (cell: CellCoord) => void;
  /** DEV-only: returns absolute screen position {x,y} of a cell center. */
  cellToScreenPoint: (cell: CellCoord) => { x: number; y: number } | null;
}

interface GameCanvasProps {
  readonly snapshot: WorldSnapshot | null;
  readonly buildTool: ToolMode;
  readonly debugOverlayVisible: boolean;
  readonly onSelectUnits: (unitIds: readonly UnitId[], additive: boolean) => void;
  readonly onAttackTarget: (targetId: EntityId) => void;
  readonly onMoveSelected: (destination: CellCoord) => void;
  readonly onPlaceBuilding: (buildingType: BuildingType, position: CellCoord) => void;
  readonly onDemolishBuilding: (position: CellCoord) => void;
  readonly onToggleGate: (position: CellCoord) => void;
  readonly onEngineerTask: (task: "ladder" | "fillMoat", position: CellCoord) => void;
  readonly onAttackMove: (destination: CellCoord) => void;
  readonly onStopSelected: () => void;
  readonly onCellSelected?: (cell: CellCoord | null) => void;
  readonly onGroupSave: (groupNum: number, unitIds: readonly UnitId[]) => void;
  readonly onGroupRecall: (groupNum: number, jump: boolean) => void;
  readonly onCancelBuildTool: () => void;
}

/** Initial state for the in-game debug toggle; the Debug button in the top
 * bar switches the overlay and status panel at runtime. */
export const DEBUG_OVERLAY_DEFAULT_ENABLED =
  import.meta.env.VITE_DEBUG_ALIGNMENT === "true" ||
  (import.meta.env.DEV && import.meta.env.VITE_DEBUG_ALIGNMENT !== "false");

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(function GameCanvas({
  snapshot,
  buildTool,
  debugOverlayVisible,
  onSelectUnits,
  onAttackTarget,
  onMoveSelected,
  onPlaceBuilding,
  onDemolishBuilding,
  onToggleGate,
  onEngineerTask,
  onAttackMove,
  onStopSelected,
  onCellSelected,
  onGroupSave,
  onGroupRecall,
  onCancelBuildTool
}: GameCanvasProps, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const terrainLayerRef = useRef<Container | null>(null);
  const overlayLayerRef = useRef<Container | null>(null);
  const unitLayerRef = useRef<Container | null>(null);
  const lastTerrainKeyRef = useRef<string | null>(null);
  const snapshotRef = useRef<WorldSnapshot | null>(snapshot);
  const buildToolRef = useRef<ToolMode>(buildTool);
  const onSelectUnitsRef = useRef(onSelectUnits);
  const onAttackTargetRef = useRef(onAttackTarget);
  const onPlaceBuildingRef = useRef(onPlaceBuilding);
  const onDemolishBuildingRef = useRef(onDemolishBuilding);
  const onToggleGateRef = useRef(onToggleGate);
  const onEngineerTaskRef = useRef(onEngineerTask);
  const onAttackMoveRef = useRef(onAttackMove);
  const onStopSelectedRef = useRef(onStopSelected);
  const onCellSelectedRef = useRef(onCellSelected);
  const onGroupSaveRef = useRef(onGroupSave);
  const onGroupRecallRef = useRef(onGroupRecall);
  const onCancelBuildToolRef = useRef(onCancelBuildTool);
  const heldKeysRef = useRef<Set<string>>(new Set());
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const minimapTerrainRef = useRef<MinimapTerrainCache | null>(null);
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{
    pointerId: number;
    mode: "select" | "pan" | "build";
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const cameraRafRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [assets, setAssets] = useState<ReadonlyMap<string, LoadedAsset>>(new Map());
  const [hoverCell, setHoverCell] = useState<CellCoord | null>(null);
  const [selectedCell, setSelectedCellState] = useState<CellCoord | null>(null);
  const setSelectedCell = useCallback((cell: CellCoord | null) => {
    setSelectedCellState(cell);
    onCellSelectedRef.current?.(cell);
  }, []);
  const [localInvalidMoveTarget, setLocalInvalidMoveTarget] = useState<CellCoord | null>(null);
  const [cameraVersion, setCameraVersion] = useState(0);
  const [selectionBox, setSelectionBox] = useState<{
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  } | null>(null);

  // Wheel and drag events fire far more often than the display refreshes;
  // coalescing camera-driven re-renders to one per animation frame keeps a
  // zoom gesture from queueing dozens of full scene rebuilds.
  const scheduleCameraRender = useCallback(() => {
    if (cameraRafRef.current !== null) {
      return;
    }
    cameraRafRef.current = requestAnimationFrame(() => {
      cameraRafRef.current = null;
      setCameraVersion((version) => version + 1);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (cameraRafRef.current !== null) {
        cancelAnimationFrame(cameraRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    buildToolRef.current = buildTool;
  }, [buildTool]);

  useEffect(() => {
    onSelectUnitsRef.current = onSelectUnits;
  }, [onSelectUnits]);

  useEffect(() => {
    onAttackTargetRef.current = onAttackTarget;
  }, [onAttackTarget]);

  useEffect(() => {
    onPlaceBuildingRef.current = onPlaceBuilding;
  }, [onPlaceBuilding]);

  useEffect(() => {
    onDemolishBuildingRef.current = onDemolishBuilding;
  }, [onDemolishBuilding]);

  useEffect(() => {
    onToggleGateRef.current = onToggleGate;
  }, [onToggleGate]);

  useEffect(() => {
    onEngineerTaskRef.current = onEngineerTask;
  }, [onEngineerTask]);

  useEffect(() => {
    onAttackMoveRef.current = onAttackMove;
  }, [onAttackMove]);

  useEffect(() => {
    onStopSelectedRef.current = onStopSelected;
  }, [onStopSelected]);

  useEffect(() => {
    onCellSelectedRef.current = onCellSelected;
  }, [onCellSelected]);

  useEffect(() => {
    onGroupSaveRef.current = onGroupSave;
  }, [onGroupSave]);

  useEffect(() => {
    onGroupRecallRef.current = onGroupRecall;
  }, [onGroupRecall]);

  useEffect(() => {
    onCancelBuildToolRef.current = onCancelBuildTool;
  }, [onCancelBuildTool]);

  useImperativeHandle(ref, () => ({
    jumpCameraToCell: (cell: CellCoord) => {
      const host = hostRef.current;
      if (host !== null) {
        centerCameraOnCell(cell, host, cameraRef.current);
        scheduleCameraRender();
      }
    },
    cellToScreenPoint: (cell: CellCoord) => {
      const app = appRef.current;
      if (app === null) return null;
      const world = cellToWorld(cell);
      const screen = worldToScreen(world, cameraRef.current);
      const rect = app.canvas.getBoundingClientRect();
      return { x: rect.left + screen.x, y: rect.top + screen.y };
    }
  }), [scheduleCameraRender]);

  useEffect(() => {
    return registerKeyboardInput(
      {
        cameraRef,
        heldKeysRef,
        onStopSelectedRef,
        snapshotRef,
        onGroupSaveRef,
        onGroupRecallRef
      },
      scheduleCameraRender
    );
  }, [scheduleCameraRender]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }

    const app = new Application();
    let disposed = false;

    void app
      .init({
        resizeTo: host,
        background: "#1c2227",
        antialias: true
      })
      .then(() => {
        if (disposed) {
          app.destroy({ removeView: true }, { children: true, context: true });
          return;
        }

        host.appendChild(app.canvas);
        app.canvas.style.width = "100%";
        app.canvas.style.height = "100%";
        app.canvas.style.touchAction = "none";

        const world = new Container();
        const terrainLayer = new Container();
        const overlayLayer = new Container();
        const unitLayer = new Container();
        world.addChild(terrainLayer, overlayLayer, unitLayer);
        app.stage.addChild(world);

        appRef.current = app;
        worldRef.current = world;
        terrainLayerRef.current = terrainLayer;
        overlayLayerRef.current = overlayLayer;
        unitLayerRef.current = unitLayer;
        centerCameraOnCell({ x: 64, y: 64 }, host, cameraRef.current);
        snapCamera(cameraRef.current);
        setReady(true);
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      disposed = true;
      appRef.current?.destroy({ removeView: true }, { children: true, context: true });
      appRef.current = null;
      worldRef.current = null;
      terrainLayerRef.current = null;
      overlayLayerRef.current = null;
      unitLayerRef.current = null;
      lastTerrainKeyRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    void loadGeneratedAssets()
      .then((loadedAssets) => {
        if (!disposed) {
          setAssets(loadedAssets);
        }
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || snapshot === null || assets.size === 0) {
      return;
    }

    renderScene(
      appRef.current,
      worldRef.current,
      terrainLayerRef.current,
      overlayLayerRef.current,
      unitLayerRef.current,
      lastTerrainKeyRef,
      snapshot,
      assets,
      cameraRef.current,
      buildTool,
      debugOverlayVisible,
      hoverCell,
      selectedCell,
      localInvalidMoveTarget
    );
    drawMinimap(minimapRef.current, minimapTerrainRef, snapshot, cameraRef.current, hostRef.current);
    // cameraVersion is not read by renderScene, but camera pans and zooms
    // mutate cameraRef without new state; the version bump re-triggers this
    // effect so the scene follows the camera.
  }, [assets, buildTool, cameraVersion, debugOverlayVisible, hoverCell, localInvalidMoveTarget, ready, selectedCell, snapshot]);

  useEffect(() => {
    const app = appRef.current;
    if (!ready || app === null) {
      return;
    }

    return registerPointerInput({
      canvas: app.canvas,
      refs: {
        cameraRef,
        dragRef,
        snapshotRef,
        buildToolRef,
        heldKeysRef,
        onSelectUnitsRef,
        onAttackTargetRef,
        onPlaceBuildingRef,
        onDemolishBuildingRef,
        onToggleGateRef,
        onEngineerTaskRef,
        onAttackMoveRef,
        onStopSelectedRef,
        onGroupSaveRef,
        onGroupRecallRef,
        onCancelBuildToolRef
      },
      scheduleCameraRender,
      setHoverCell,
      setSelectedCell,
      setLocalInvalidMoveTarget,
      setSelectionBox,
      onMoveSelected
    });
  }, [onMoveSelected, ready, scheduleCameraRender]);

  const handleMinimapPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.buttons === 0 && event.type !== "pointerdown") {
      return;
    }

    const host = hostRef.current;
    if (host === null) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    jumpCameraFromMinimap(
      {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      },
      rect,
      host,
      cameraRef.current
    );
    scheduleCameraRender();
  };

  return (
    <div ref={hostRef} className="game-canvas">
      <canvas
        ref={minimapRef}
        className="minimap"
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        onPointerDown={handleMinimapPointer}
        onPointerMove={handleMinimapPointer}
      />
      {selectionBox === null ? null : (
        <div
          className="selection-box"
          style={{
            left: Math.min(selectionBox.x0, selectionBox.x1),
            top: Math.min(selectionBox.y0, selectionBox.y1),
            width: Math.abs(selectionBox.x1 - selectionBox.x0),
            height: Math.abs(selectionBox.y1 - selectionBox.y0)
          }}
        />
      )}
    </div>
  );
});
