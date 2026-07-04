import { useCallback, useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { MAP_HEIGHT, MAP_WIDTH } from "@asama/shared";
import { buildingSpecs } from "@asama/content";
import type {
  BuildingSnapshot,
  BuildingType,
  CellCoord,
  EntityId,
  MapDecoration,
  TerrainCellSnapshot,
  UnitId,
  UnitSnapshot,
  WorldSnapshot
} from "@asama/shared";

export type ToolMode = BuildingType | "demolish" | "ladder" | "fillMoat" | null;

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
}

interface AssetManifest {
  readonly assets: readonly {
    readonly assetId: string;
    readonly file: string;
    readonly anchor: {
      readonly x: number;
      readonly y: number;
    };
  }[];
}

interface LoadedAsset {
  readonly texture: Texture;
  readonly anchor: {
    readonly x: number;
    readonly y: number;
  };
}

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const UNIT_GROUND_OFFSET_Y = 0;
const TERRAIN_UNDERLAY_PADDING = 0.5;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const GENERATED_MANIFEST_URL = "/assets/generated/manifest.json";
/** Initial state for the in-game debug toggle; the Debug button in the top
 * bar switches the overlay and status panel at runtime. */
export const DEBUG_OVERLAY_DEFAULT_ENABLED =
  import.meta.env.VITE_DEBUG_ALIGNMENT === "true" ||
  (import.meta.env.DEV && import.meta.env.VITE_DEBUG_ALIGNMENT !== "false");
// Placement previews use the same footprint data as the simulation, derived
// from @asama/content so the two can never drift apart again.
const BUILDING_FOOTPRINTS: Record<BuildingType, readonly CellCoord[]> = Object.fromEntries(
  Object.values(buildingSpecs).map((spec) => [spec.type, rectangleFootprint(spec.footprint.width, spec.footprint.height)])
) as Record<BuildingType, readonly CellCoord[]>;

export function GameCanvas({
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
  onStopSelected
}: GameCanvasProps) {
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
  const heldKeysRef = useRef<Set<string>>(new Set());
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const minimapTerrainRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{
    pointerId: number;
    mode: "select" | "pan";
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [assets, setAssets] = useState<ReadonlyMap<string, LoadedAsset>>(new Map());
  const [hoverCell, setHoverCell] = useState<CellCoord | null>(null);
  const [selectedCell, setSelectedCell] = useState<CellCoord | null>(null);
  const [localInvalidMoveTarget, setLocalInvalidMoveTarget] = useState<CellCoord | null>(null);
  const [cameraVersion, setCameraVersion] = useState(0);
  const [selectionBox, setSelectionBox] = useState<{
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  } | null>(null);
  const cameraRafRef = useRef<number | null>(null);

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = event.key.toLowerCase();
      heldKeysRef.current.add(key);
      // While A is held it acts as the attack-move modifier, so it must not
      // also scroll the camera.
      if (key === "s" && !event.repeat) {
        onStopSelectedRef.current();
        return;
      }
      // Camera scroll lives on the arrow keys: the controls spec assigns
      // WASD to the camera but also S=stop and A=attack-move, so the letter
      // keys go to unit commands and arrows drive the camera.
      const step = 64;
      switch (event.key) {
        case "ArrowUp":
          cameraRef.current.y += step;
          break;
        case "ArrowDown":
          cameraRef.current.y -= step;
          break;
        case "ArrowLeft":
          cameraRef.current.x += step;
          break;
        case "ArrowRight":
          cameraRef.current.x -= step;
          break;
        default:
          return;
      }
      event.preventDefault();
      scheduleCameraRender();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      heldKeysRef.current.delete(event.key.toLowerCase());
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [scheduleCameraRender]);

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
          app.destroy();
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
      });

    return () => {
      disposed = true;
      appRef.current?.destroy(true);
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

    async function loadAssets(): Promise<void> {
      const response = await fetch(GENERATED_MANIFEST_URL);
      if (!response.ok) {
        throw new Error(`Failed to load asset manifest: ${response.status}`);
      }

      const manifest = (await response.json()) as AssetManifest;
      const loaded = new Map<string, LoadedAsset>();
      for (const asset of manifest.assets) {
        const texture = await Assets.load<Texture>(`/assets/${asset.file}`);
        loaded.set(asset.assetId, {
          texture,
          anchor: asset.anchor
        });
      }

      if (!disposed) {
        setAssets(loaded);
      }
    }

    void loadAssets().catch((error) => {
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
    const host = hostRef.current;
    if (app === null || host === null) {
      return;
    }

    const canvas = app.canvas;

    const handlePointerDown = (event: PointerEvent) => {
      // Left button drags a selection box (per controls spec); middle button
      // pans the camera. Right button issues commands via contextmenu.
      if (event.button !== 0 && event.button !== 1) {
        return;
      }
      if (event.button === 1) {
        event.preventDefault();
      }
      dragRef.current = {
        pointerId: event.pointerId,
        mode: event.button === 1 ? "pan" : "select",
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false
      };
      canvas.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag !== null && drag.pointerId === event.pointerId) {
        const totalDx = event.clientX - drag.startX;
        const totalDy = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(totalDx, totalDy) > 6) {
          drag.moved = true;
        }
        if (drag.moved && drag.mode === "pan") {
          const dx = event.clientX - drag.lastX;
          const dy = event.clientY - drag.lastY;
          cameraRef.current.x = roundScreenPixel(cameraRef.current.x + dx);
          cameraRef.current.y = roundScreenPixel(cameraRef.current.y + dy);
          scheduleCameraRender();
        }
        if (drag.moved && drag.mode === "select" && buildToolRef.current === null) {
          const rect = canvas.getBoundingClientRect();
          setSelectionBox({
            x0: drag.startX - rect.left,
            y0: drag.startY - rect.top,
            x1: event.clientX - rect.left,
            y1: event.clientY - rect.top
          });
        }
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      setHoverCell(screenToCell(event.clientX - rect.left, event.clientY - rect.top, cameraRef.current));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) {
        return;
      }

      dragRef.current = null;
      canvas.releasePointerCapture(event.pointerId);
      setSelectionBox(null);

      const rect = canvas.getBoundingClientRect();

      if (drag.moved && drag.mode === "select" && buildToolRef.current === null) {
        // Box select: every player unit whose screen point falls inside the
        // dragged rectangle.
        const minX = Math.min(drag.startX, event.clientX) - rect.left;
        const maxX = Math.max(drag.startX, event.clientX) - rect.left;
        const minY = Math.min(drag.startY, event.clientY) - rect.top;
        const maxY = Math.max(drag.startY, event.clientY) - rect.top;
        const snapshot = snapshotRef.current;
        const ids: UnitId[] = [];
        for (const unit of snapshot?.units ?? []) {
          if (unit.owner !== "player") {
            continue;
          }
          const point = unitScreenPoint(unit, cameraRef.current);
          if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
            ids.push(unit.id);
          }
        }
        if (ids.length > 0 || !event.shiftKey) {
          onSelectUnitsRef.current(ids, event.shiftKey);
        }
        setSelectedCell(null);
        return;
      }

      if (drag.mode !== "select" || drag.moved) {
        return;
      }

      const screenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      const clickedCell = screenToCell(screenPoint.x, screenPoint.y, cameraRef.current);
      const activeBuildTool = buildToolRef.current;
      if (activeBuildTool === "demolish") {
        setSelectedCell(clickedCell);
        onDemolishBuildingRef.current(clickedCell);
        return;
      }

      if (activeBuildTool === "ladder" || activeBuildTool === "fillMoat") {
        setSelectedCell(clickedCell);
        onEngineerTaskRef.current(activeBuildTool, clickedCell);
        return;
      }

      if (activeBuildTool !== null) {
        setSelectedCell(clickedCell);
        onPlaceBuildingRef.current(activeBuildTool, clickedCell);
        return;
      }

      if (heldKeysRef.current.has("a")) {
        onAttackMoveRef.current(clickedCell);
        setSelectedCell(clickedCell);
        return;
      }

      const hitUnit = findUnitAtScreenPoint(screenPoint, snapshotRef.current, cameraRef.current);
      if (hitUnit !== null && hitUnit.owner === "player") {
        onSelectUnitsRef.current([hitUnit.id], event.shiftKey);
        setSelectedCell(null);
        return;
      }

      // Clicking one of our own gates toggles it open or closed.
      const hitBuilding = findBuildingAtCell(clickedCell, snapshotRef.current);
      if (hitBuilding !== null && hitBuilding.owner === "player" && hitBuilding.gateState !== null) {
        onToggleGateRef.current(clickedCell);
        setSelectedCell(clickedCell);
        return;
      }

      // Plain click on the ground clears the current selection.
      if (!event.shiftKey) {
        onSelectUnitsRef.current([], false);
      }
      setSelectedCell(clickedCell);
    };

    const handlePointerLeave = () => {
      setHoverCell(null);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const before = screenToWorld(event.clientX - rect.left, event.clientY - rect.top, cameraRef.current);
      const nextZoom = stepZoom(cameraRef.current.zoom, event.deltaY > 0 ? -1 : 1);
      cameraRef.current.zoom = nextZoom;
      cameraRef.current.x = roundScreenPixel(event.clientX - rect.left - before.x * nextZoom);
      cameraRef.current.y = roundScreenPixel(event.clientY - rect.top - before.y * nextZoom);
      scheduleCameraRender();
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const screenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      const destination = screenToCell(screenPoint.x, screenPoint.y, cameraRef.current);
      if (buildToolRef.current !== null) {
        return;
      }

      const snapshot = snapshotRef.current;
      const hitUnit = findUnitAtScreenPoint(screenPoint, snapshot, cameraRef.current);
      if (hitUnit !== null && hitUnit.owner === "enemy") {
        setSelectedCell(hitUnit.position);
        setLocalInvalidMoveTarget(null);
        onAttackTargetRef.current(hitUnit.id);
        return;
      }

      const hitBuilding = findBuildingAtCell(destination, snapshot);
      if (hitBuilding !== null && hitBuilding.owner === "enemy") {
        setSelectedCell(destination);
        setLocalInvalidMoveTarget(null);
        onAttackTargetRef.current(hitBuilding.id);
        return;
      }

      const targetCell = getSnapshotCell(snapshotRef.current, destination);
      setSelectedCell(destination);
      if (targetCell === null || !isSnapshotPassable(snapshot, destination)) {
        setLocalInvalidMoveTarget(destination);
        return;
      }

      setLocalInvalidMoveTarget(null);
      onMoveSelected(destination);
    };

    const blockMiddleAutoscroll = (event: MouseEvent) => {
      if (event.button === 1) {
        event.preventDefault();
      }
    };
    canvas.addEventListener("mousedown", blockMiddleAutoscroll);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("contextmenu", handleContextMenu);

    return () => {
      canvas.removeEventListener("mousedown", blockMiddleAutoscroll);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [onMoveSelected, ready, scheduleCameraRender]);

  const handleMinimapPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.buttons === 0 && event.type !== "pointerdown") {
      return;
    }
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const cellX = ((event.clientX - rect.left) / rect.width) * MAP_WIDTH;
    const cellY = ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT;
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const world = cellToWorld({ x: cellX, y: cellY });
    const camera = cameraRef.current;
    camera.x = roundScreenPixel(host.clientWidth / 2 - world.x * camera.zoom);
    camera.y = roundScreenPixel(host.clientHeight / 2 - world.y * camera.zoom);
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
}

function renderScene(
  app: Application | null,
  world: Container | null,
  terrainLayer: Container | null,
  overlayLayer: Container | null,
  unitLayer: Container | null,
  lastTerrainKeyRef: { current: string | null },
  snapshot: WorldSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  camera: CameraState,
  buildTool: ToolMode,
  debugOverlayVisible: boolean,
  hoverCell: CellCoord | null,
  selectedCell: CellCoord | null,
  localInvalidMoveTarget: CellCoord | null
): void {
  if (app === null || world === null || terrainLayer === null || overlayLayer === null || unitLayer === null) {
    return;
  }

  world.position.set(roundScreenPixel(camera.x), roundScreenPixel(camera.y));
  world.scale.set(camera.zoom);

  const firstCell = snapshot.map.cells[0]?.coord;
  const lastCell = snapshot.map.cells[snapshot.map.cells.length - 1]?.coord;
  // Terrain is static: build the whole map into chunk containers exactly
  // once (per map/assets identity) and cull whole chunks per frame by
  // toggling visibility. Rebuilding sprites on camera moves froze the tab
  // when many cells were visible.
  const terrainKey = `${snapshot.map.width}:${snapshot.map.height}:${assets.size}:${snapshot.map.cells.length}:${firstCell?.x ?? 0},${firstCell?.y ?? 0}:${lastCell?.x ?? 0},${lastCell?.y ?? 0}`;
  if (lastTerrainKeyRef.current !== terrainKey) {
    buildTerrainChunks(terrainLayer, snapshot, assets);
    lastTerrainKeyRef.current = terrainKey;
  }
  updateTerrainChunkVisibility(terrainLayer, camera, app.screen.width, app.screen.height);

  clearLayer(overlayLayer);
  clearLayer(unitLayer);

  for (const unit of snapshot.units) {
    addPathSprites(overlayLayer, unit, assets);
  }

  if (selectedCell !== null) {
    addCellActionPreview(overlayLayer, selectedCell, snapshot, buildTool, assets);
  }

  if (hoverCell !== null && isInsideSnapshotMap(hoverCell, snapshot)) {
    const cell = getSnapshotCell(snapshot, hoverCell);
    addOverlaySprite(overlayLayer, hoverCell, cell?.passable === false ? "overlay.cell.blocked" : "overlay.cell.hover", assets);
  }

  const invalidMoveTarget = snapshot.invalidMoveTarget ?? localInvalidMoveTarget;
  if (invalidMoveTarget !== null && isInsideSnapshotMap(invalidMoveTarget, snapshot)) {
    addOverlaySprite(overlayLayer, invalidMoveTarget, "overlay.cell.blocked", assets);
  }

  // Cells covered by intact buildings hide their decorations.
  const occupiedCells = new Set<string>();
  for (const building of snapshot.buildings) {
    if (building.lifecycleState !== "intact") {
      continue;
    }
    for (const cell of building.footprint) {
      occupiedCells.add(`${cell.x},${cell.y}`);
    }
  }

  for (const building of [...snapshot.buildings].sort(compareBuildingsForDraw)) {
    addBuildingSprite(unitLayer, building, assets, camera.zoom);
  }

  for (const decoration of snapshot.map.decorations) {
    if (occupiedCells.has(`${decoration.position.x},${decoration.position.y}`)) {
      continue;
    }
    if (!isVisibleCell(decoration.position, camera, app.screen.width, app.screen.height)) {
      continue;
    }
    addDecorationSprite(unitLayer, decoration, assets, camera.zoom);
  }

  for (const unit of [...snapshot.units].sort(compareUnitsForDraw)) {
    addUnitSprite(unitLayer, unit, assets, camera.zoom);
  }

  if (debugOverlayVisible) {
    addAlignmentDebugOverlay(unitLayer, snapshot, camera, app.screen.width, app.screen.height, assets);
  }
}

function addTerrainSprite(layer: Container, cell: TerrainCellSnapshot, assets: ReadonlyMap<string, LoadedAsset>): void {
  const point = cellToWorld(cell.coord);
  const sprite = createSpriteFromCandidates([cell.assetId, terrainFallbackAssetId(cell)], assets);
  sprite.position.copyFrom(point);
  layer.addChild(sprite);
}

function terrainFallbackAssetId(cell: TerrainCellSnapshot): string {
  if (cell.terrain === "grass" && (cell.coord.x * 17 + cell.coord.y * 31) % 7 === 0) {
    return "terrain.grass.variant.1";
  }

  if (cell.terrain === "dirt" && (cell.coord.x + cell.coord.y) % 3 === 0) {
    return "terrain.dirt.variant.1";
  }

  return `terrain.${cell.terrain}.base`;
}

function addTerrainUnderlay(graphics: Graphics, cell: TerrainCellSnapshot): void {
  const point = cellToWorld(cell.coord);
  const halfWidth = TILE_WIDTH / 2 + TERRAIN_UNDERLAY_PADDING;
  const halfHeight = TILE_HEIGHT / 2 + TERRAIN_UNDERLAY_PADDING / 2;

  graphics
    .poly([
      point.x,
      point.y - halfHeight,
      point.x + halfWidth,
      point.y,
      point.x,
      point.y + halfHeight,
      point.x - halfWidth,
      point.y
    ])
    .fill({ color: 0x63753a, alpha: 1 });
}

function addPathSprites(layer: Container, unit: UnitSnapshot, assets: ReadonlyMap<string, LoadedAsset>): void {
  if (!unit.selected) {
    return;
  }

  for (const step of unit.path) {
    addOverlaySprite(layer, step, "overlay.path.step", assets);
  }

  if (unit.destination !== null) {
    addOverlaySprite(layer, unit.destination, "overlay.move.destination", assets);
  }
}

function addOverlaySprite(
  layer: Container,
  cell: CellCoord,
  assetId: string,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const sprite = createSprite(assetId, assets);
  sprite.position.copyFrom(cellToWorld(cell));
  layer.addChild(sprite);
}

function addCellActionPreview(
  layer: Container,
  cell: CellCoord,
  snapshot: WorldSnapshot,
  buildTool: ToolMode,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  if (buildTool === null) {
    addOverlaySprite(layer, cell, "overlay.cell.selected", assets);
    return;
  }

  if (buildTool === "ladder" || buildTool === "fillMoat") {
    addOverlaySprite(layer, cell, "overlay.cell.selected", assets);
    return;
  }

  if (buildTool === "demolish") {
    const hasBuilding = findBuildingAtCell(cell, snapshot) !== null;
    addOverlaySprite(layer, cell, hasBuilding ? "overlay.demolish.target" : "overlay.build.invalid", assets);
    return;
  }

  const footprint = buildingPreviewFootprint(buildTool, cell);
  const canPlace = footprint.every((footprintCell) => canPreviewPlaceBuildingCell(snapshot, footprintCell, buildTool));
  for (const footprintCell of footprint) {
    if (isInsideSnapshotMap(footprintCell, snapshot)) {
      addOverlaySprite(layer, footprintCell, canPlace ? "overlay.build.valid" : "overlay.build.invalid", assets);
    }
  }
}

function addBuildingSprite(
  layer: Container,
  building: BuildingSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  zoom: number
): void {
  const sprite = createSpriteFromCandidates(buildingAssetCandidates(building), assets);
  const point = buildingRenderPoint(building);
  sprite.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y, zoom));
  if (building.owner === "enemy") {
    sprite.tint = 0xffaaa0;
  }
  layer.addChild(sprite);

  if (building.ladderHp !== null) {
    const ladderAsset = assets.get("building.wall.ladder.attached");
    if (ladderAsset !== undefined) {
      const ladder = new Sprite(ladderAsset.texture);
      ladder.anchor.set(ladderAsset.anchor.x, ladderAsset.anchor.y);
      ladder.position.set(sprite.position.x, sprite.position.y);
      layer.addChild(ladder);
    }
  }
}

function addUnitSprite(
  layer: Container,
  unit: UnitSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  zoom: number
): void {
  if (unit.selected) {
    const ring = createSprite("overlay.unit.selection-ring", assets);
    const ringPoint = cellToWorld(unit.position);
    ring.position.set(roundWorldPixel(ringPoint.x, zoom), roundWorldPixel(ringPoint.y, zoom));
    layer.addChild(ring);
  }

  const sprite = createSprite(unit.assetId, assets);
  const point = cellToWorld(unit.position);
  sprite.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y + UNIT_GROUND_OFFSET_Y, zoom));
  if (unit.owner === "enemy") {
    sprite.tint = 0xff9f8f;
  }
  layer.addChild(sprite);

  addUnitHealthBar(layer, unit, point, zoom);
}

function addUnitHealthBar(layer: Container, unit: UnitSnapshot, point: CellCoord, zoom: number): void {
  if (unit.hp >= unit.maxHp) {
    return;
  }

  const width = 28;
  const height = 4;
  const ratio = clamp(unit.hp / unit.maxHp, 0, 1);
  const bar = new Graphics();
  bar.rect(-width / 2, -46, width, height).fill({ color: 0x211d18, alpha: 0.9 });
  bar.rect(-width / 2 + 1, -45, (width - 2) * ratio, height - 2).fill({
    color: unit.owner === "enemy" ? 0xd85a4a : 0x58d99a,
    alpha: 0.95
  });
  bar.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y + UNIT_GROUND_OFFSET_Y, zoom));
  layer.addChild(bar);
}

function createSprite(assetId: string, assets: ReadonlyMap<string, LoadedAsset>, fallbackAssetId = "overlay.cell.selected"): Sprite {
  const asset = assets.get(assetId) ?? assets.get(fallbackAssetId);
  const sprite = new Sprite(asset?.texture ?? Texture.EMPTY);
  sprite.anchor.set(asset?.anchor.x ?? 0.5, asset?.anchor.y ?? 0.5);
  return sprite;
}

function createSpriteFromCandidates(assetIds: readonly string[], assets: ReadonlyMap<string, LoadedAsset>): Sprite {
  for (const assetId of assetIds) {
    const asset = assets.get(assetId);
    if (asset !== undefined) {
      const sprite = new Sprite(asset.texture);
      sprite.anchor.set(asset.anchor.x, asset.anchor.y);
      return sprite;
    }
  }

  const sprite = new Sprite(Texture.EMPTY);
  sprite.anchor.set(0.5, 0.5);
  return sprite;
}

function cellToWorld(cell: CellCoord): CellCoord {
  return {
    x: (cell.x - cell.y) * (TILE_WIDTH / 2),
    y: (cell.x + cell.y) * (TILE_HEIGHT / 2)
  };
}

function addDecorationSprite(
  layer: Container,
  decoration: MapDecoration,
  assets: ReadonlyMap<string, LoadedAsset>,
  zoom: number
): void {
  const asset = assets.get(decoration.assetId);
  if (asset === undefined) {
    return;
  }
  const sprite = new Sprite(asset.texture);
  sprite.anchor.set(asset.anchor.x, asset.anchor.y);
  const point = cellToWorld(decoration.position);
  sprite.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y, zoom));
  layer.addChild(sprite);
}

function clearLayer(layer: Container): void {
  // removeChildren alone does not release display objects in Pixi v8; the
  // scene is rebuilt every snapshot, so undestroyed Graphics geometry (HP
  // bars, rings, grid) accumulates until the tab runs out of memory.
  // `context: true` matters: a Graphics owns an implicit GraphicsContext
  // that destroy() keeps alive by default, which leaks several MB/s here.
  for (const child of layer.removeChildren()) {
    child.destroy({ children: true, context: true });
  }
}

const MINIMAP_TERRAIN_COLORS: Record<string, string> = {
  grass: "#7d9c60",
  dirt: "#8a7a58",
  water: "#33566b",
  stone: "#6f7278"
};

function drawMinimap(
  canvas: HTMLCanvasElement | null,
  terrainCacheRef: { current: { key: string; canvas: HTMLCanvasElement } | null },
  snapshot: WorldSnapshot,
  camera: CameraState,
  host: HTMLElement | null
): void {
  if (canvas === null || snapshot.map.cells.length === 0) {
    return;
  }
  const context = canvas.getContext("2d");
  if (context === null) {
    return;
  }

  const terrainKey = `${snapshot.map.width}:${snapshot.map.height}:${snapshot.map.cells.length}`;
  let terrainCache = terrainCacheRef.current;
  if (terrainCache === null || terrainCache.key !== terrainKey) {
    const offscreen = document.createElement("canvas");
    offscreen.width = snapshot.map.width;
    offscreen.height = snapshot.map.height;
    const offscreenContext = offscreen.getContext("2d");
    if (offscreenContext === null) {
      return;
    }
    for (const cell of snapshot.map.cells) {
      offscreenContext.fillStyle = MINIMAP_TERRAIN_COLORS[cell.terrain] ?? "#555";
      offscreenContext.fillRect(cell.coord.x, cell.coord.y, 1, 1);
    }
    terrainCache = { key: terrainKey, canvas: offscreen };
    terrainCacheRef.current = terrainCache;
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(terrainCache.canvas, 0, 0);

  for (const building of snapshot.buildings) {
    context.fillStyle = building.owner === "enemy" ? "#c2543f" : "#e0d6b8";
    for (const cell of building.footprint) {
      context.fillRect(cell.x, cell.y, 1, 1);
    }
  }

  for (const unit of snapshot.units) {
    context.fillStyle = unit.owner === "enemy" ? "#ff5040" : "#63e063";
    context.fillRect(unit.position.x - 1, unit.position.y - 1, 2, 2);
  }

  // Viewport: project the visible screen corners into cell space.
  if (host !== null) {
    const corners = [
      screenToCellFloat(0, 0, camera),
      screenToCellFloat(host.clientWidth, 0, camera),
      screenToCellFloat(host.clientWidth, host.clientHeight, camera),
      screenToCellFloat(0, host.clientHeight, camera)
    ];
    context.strokeStyle = "#f4efe6";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(corners[0]?.x ?? 0, corners[0]?.y ?? 0);
    for (const corner of corners.slice(1)) {
      context.lineTo(corner.x, corner.y);
    }
    context.closePath();
    context.stroke();
  }
}

function screenToCellFloat(x: number, y: number, camera: CameraState): { x: number; y: number } {
  const local = screenToWorld(x, y, camera);
  return {
    x: local.y / TILE_HEIGHT + local.x / TILE_WIDTH,
    y: local.y / TILE_HEIGHT - local.x / TILE_WIDTH
  };
}

const TERRAIN_CHUNK_CELLS = 16;

interface TerrainChunkBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function buildTerrainChunks(
  terrainLayer: Container,
  snapshot: WorldSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  clearLayer(terrainLayer);
  const chunks = new Map<string, { container: Container; underlay: Graphics; bounds: TerrainChunkBounds }>();

  for (const cell of snapshot.map.cells) {
    const key = `${Math.floor(cell.coord.x / TERRAIN_CHUNK_CELLS)}:${Math.floor(cell.coord.y / TERRAIN_CHUNK_CELLS)}`;
    let chunk = chunks.get(key);
    if (chunk === undefined) {
      const container = new Container();
      const underlay = new Graphics();
      container.addChild(underlay);
      chunk = {
        container,
        underlay,
        bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
      };
      chunks.set(key, chunk);
      terrainLayer.addChild(container);
    }

    addTerrainUnderlay(chunk.underlay, cell);
    addTerrainSprite(chunk.container, cell, assets);

    const world = cellToWorld(cell.coord);
    chunk.bounds = {
      minX: Math.min(chunk.bounds.minX, world.x - TILE_WIDTH),
      minY: Math.min(chunk.bounds.minY, world.y - TILE_HEIGHT * 2),
      maxX: Math.max(chunk.bounds.maxX, world.x + TILE_WIDTH),
      maxY: Math.max(chunk.bounds.maxY, world.y + TILE_HEIGHT * 2)
    };
  }

  for (const chunk of chunks.values()) {
    (chunk.container as Container & { __terrainBounds?: TerrainChunkBounds }).__terrainBounds = chunk.bounds;
  }
}

function updateTerrainChunkVisibility(terrainLayer: Container, camera: CameraState, width: number, height: number): void {
  for (const child of terrainLayer.children) {
    const bounds = (child as Container & { __terrainBounds?: TerrainChunkBounds }).__terrainBounds;
    if (bounds === undefined) {
      continue;
    }
    const left = bounds.minX * camera.zoom + camera.x;
    const right = bounds.maxX * camera.zoom + camera.x;
    const top = bounds.minY * camera.zoom + camera.y;
    const bottom = bounds.maxY * camera.zoom + camera.y;
    child.visible = right >= 0 && left <= width && bottom >= 0 && top <= height;
  }
}

function buildingRenderPoint(building: BuildingSnapshot): CellCoord {
  if (building.footprint.length === 0) {
    return cellToWorld(building.position);
  }

  if (!isCenterAnchoredBuilding(building.type)) {
    return footprintSouthWorld(building.footprint);
  }

  return footprintCenterWorld(building.footprint);
}

function footprintCenterWorld(footprint: readonly CellCoord[]): CellCoord {
  const bounds = footprintBounds(footprint);
  const centerCell = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
  return cellToWorld(centerCell);
}

function footprintSouthWorld(footprint: readonly CellCoord[]): CellCoord {
  const bounds = footprintBounds(footprint);
  return gridCornerToWorld({ x: bounds.maxX + 1, y: bounds.maxY + 1 });
}

function footprintBounds(footprint: readonly CellCoord[]): {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
} {
  return footprint.reduce(
    (bounds, cell) => ({
      minX: Math.min(bounds.minX, cell.x),
      maxX: Math.max(bounds.maxX, cell.x),
      minY: Math.min(bounds.minY, cell.y),
      maxY: Math.max(bounds.maxY, cell.y)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
  );
}

function footprintDiamondPoints(footprint: readonly CellCoord[]): readonly CellCoord[] {
  const bounds = footprintBounds(footprint);
  return [
    gridCornerToWorld({ x: bounds.minX, y: bounds.minY }),
    gridCornerToWorld({ x: bounds.maxX + 1, y: bounds.minY }),
    gridCornerToWorld({ x: bounds.maxX + 1, y: bounds.maxY + 1 }),
    gridCornerToWorld({ x: bounds.minX, y: bounds.maxY + 1 })
  ];
}

function gridCornerToWorld(corner: CellCoord): CellCoord {
  return {
    x: (corner.x - corner.y) * (TILE_WIDTH / 2),
    y: (corner.x + corner.y) * (TILE_HEIGHT / 2) - TILE_HEIGHT / 2
  };
}

function isCenterAnchoredBuilding(buildingType: BuildingType): boolean {
  return (
    buildingType === "fence" ||
    buildingType === "wall" ||
    isGateType(buildingType) ||
    buildingType === "dry_moat" ||
    buildingType === "water_moat" ||
    buildingType === "honmaru" ||
    buildingType === "farm" ||
    buildingType === "road" ||
    buildingType === "earth_bridge" ||
    buildingType === "wood_bridge"
  );
}

function addAlignmentDebugOverlay(
  layer: Container,
  snapshot: WorldSnapshot,
  camera: CameraState,
  screenWidth: number,
  screenHeight: number,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const grid = new Graphics();
  for (const cell of snapshot.map.cells) {
    if (isVisibleCell(cell.coord, camera, screenWidth, screenHeight)) {
      drawCellDiamond(grid, cell.coord, 0x65c8ff, 0.18);
    }
  }

  for (const building of snapshot.buildings) {
    drawFootprintDiamond(grid, building.footprint, 0xffd166, 0.85);
    const anchor = buildingRenderPoint(building);
    drawCrosshair(grid, anchor, 0xff3b30);
    drawSpriteBounds(grid, building, assets);
  }

  layer.addChild(grid);
}

function drawCellDiamond(graphics: Graphics, cell: CellCoord, color: number, alpha: number): void {
  const point = cellToWorld(cell);
  graphics
    .poly([
      point.x,
      point.y - TILE_HEIGHT / 2,
      point.x + TILE_WIDTH / 2,
      point.y,
      point.x,
      point.y + TILE_HEIGHT / 2,
      point.x - TILE_WIDTH / 2,
      point.y
    ])
    .stroke({ color, alpha, width: 1 });
}

function drawFootprintDiamond(graphics: Graphics, footprint: readonly CellCoord[], color: number, alpha: number): void {
  const points = footprintDiamondPoints(footprint);
  graphics
    .poly(points.flatMap((point) => [point.x, point.y]))
    .stroke({ color, alpha, width: 2 });
}

function drawCrosshair(graphics: Graphics, point: CellCoord, color: number): void {
  graphics
    .moveTo(point.x - 6, point.y)
    .lineTo(point.x + 6, point.y)
    .moveTo(point.x, point.y - 6)
    .lineTo(point.x, point.y + 6)
    .stroke({ color, alpha: 0.95, width: 1.5 });
}

function drawSpriteBounds(
  graphics: Graphics,
  building: BuildingSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const spriteAsset = firstLoadedAsset(buildingAssetCandidates(building), assets);
  if (spriteAsset === null) {
    return;
  }

  const point = buildingRenderPoint(building);
  const width = spriteAsset.texture.width;
  const height = spriteAsset.texture.height;
  const left = point.x - width * spriteAsset.anchor.x;
  const top = point.y - height * spriteAsset.anchor.y;
  graphics.rect(left, top, width, height).stroke({ color: 0xff4fd8, alpha: 0.65, width: 1 });
}

function firstLoadedAsset(assetIds: readonly string[], assets: ReadonlyMap<string, LoadedAsset>): LoadedAsset | null {
  for (const assetId of assetIds) {
    const asset = assets.get(assetId);
    if (asset !== undefined) {
      return asset;
    }
  }
  return null;
}

function snapCamera(camera: CameraState): void {
  camera.x = roundScreenPixel(camera.x);
  camera.y = roundScreenPixel(camera.y);
  camera.zoom = nearestZoomStep(camera.zoom);
}

function stepZoom(currentZoom: number, direction: -1 | 1): number {
  const index = ZOOM_STEPS.findIndex((zoom) => zoom === nearestZoomStep(currentZoom));
  const nextIndex = clamp(index + direction, 0, ZOOM_STEPS.length - 1);
  return ZOOM_STEPS[nextIndex] ?? 1;
}

function nearestZoomStep(zoom: number): number {
  return ZOOM_STEPS.reduce((nearest, candidate) =>
    Math.abs(candidate - zoom) < Math.abs(nearest - zoom) ? candidate : nearest
  );
}

function roundScreenPixel(value: number): number {
  return Math.round(value);
}

function roundWorldPixel(value: number, zoom: number): number {
  return Math.round(value * zoom) / zoom;
}

function screenToWorld(x: number, y: number, camera: CameraState): CellCoord {
  return {
    x: (x - camera.x) / camera.zoom,
    y: (y - camera.y) / camera.zoom
  };
}

function screenToCell(x: number, y: number, camera: CameraState): CellCoord {
  const local = screenToWorld(x, y, camera);
  return {
    x: Math.round(local.y / TILE_HEIGHT + local.x / TILE_WIDTH),
    y: Math.round(local.y / TILE_HEIGHT - local.x / TILE_WIDTH)
  };
}

function worldToScreen(point: CellCoord, camera: CameraState): CellCoord {
  return {
    x: camera.x + point.x * camera.zoom,
    y: camera.y + point.y * camera.zoom
  };
}

function unitScreenPoint(unit: UnitSnapshot, camera: CameraState): CellCoord {
  const point = cellToWorld(unit.position);
  return worldToScreen({ x: point.x, y: point.y + UNIT_GROUND_OFFSET_Y }, camera);
}

function findUnitAtScreenPoint(
  point: CellCoord,
  snapshot: WorldSnapshot | null,
  camera: CameraState
): UnitSnapshot | null {
  if (snapshot === null) {
    return null;
  }

  let nearest: UnitSnapshot | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const hitRadius = 30 * camera.zoom;

  for (const unit of snapshot.units) {
    const unitPoint = unitScreenPoint(unit, camera);
    const distance = Math.hypot(point.x - unitPoint.x, point.y - unitPoint.y);
    if (distance <= hitRadius && distance < nearestDistance) {
      nearest = unit;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function isVisibleCell(cell: CellCoord, camera: CameraState, width: number, height: number): boolean {
  const point = worldToScreen(cellToWorld(cell), camera);
  const margin = TILE_WIDTH * camera.zoom * 2;
  return point.x >= -margin && point.x <= width + margin && point.y >= -margin && point.y <= height + margin;
}

function centerCameraOnCell(cell: CellCoord, host: HTMLElement, camera: CameraState): void {
  const world = cellToWorld(cell);
  camera.zoom = 1;
  camera.x = host.clientWidth / 2 - world.x;
  camera.y = host.clientHeight / 2 - world.y;
}

function compareUnitsForDraw(a: UnitSnapshot, b: UnitSnapshot): number {
  const ay = cellToWorld(a.position).y + UNIT_GROUND_OFFSET_Y;
  const by = cellToWorld(b.position).y + UNIT_GROUND_OFFSET_Y;
  if (ay !== by) {
    return ay - by;
  }
  return a.id.localeCompare(b.id);
}

function compareBuildingsForDraw(a: BuildingSnapshot, b: BuildingSnapshot): number {
  const ay = buildingRenderPoint(a).y;
  const by = buildingRenderPoint(b).y;
  if (ay !== by) {
    return ay - by;
  }
  return a.id.localeCompare(b.id);
}

function isInsideSnapshotMap(cell: CellCoord, snapshot: WorldSnapshot): boolean {
  return cell.x >= 0 && cell.x < snapshot.map.width && cell.y >= 0 && cell.y < snapshot.map.height;
}

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

function getSnapshotCell(snapshot: WorldSnapshot | null, cell: CellCoord): TerrainCellSnapshot | null {
  if (snapshot === null || !isInsideSnapshotMap(cell, snapshot)) {
    return null;
  }

  return snapshot.map.cells[cell.y * snapshot.map.width + cell.x] ?? null;
}

function findBuildingAtCell(cell: CellCoord, snapshot: WorldSnapshot | null): BuildingSnapshot | null {
  return snapshot?.buildings.find((building) => building.footprint.some((footprintCell) => sameCell(footprintCell, cell))) ?? null;
}

function isSnapshotPassable(snapshot: WorldSnapshot | null, cell: CellCoord): boolean {
  const terrain = getSnapshotCell(snapshot, cell);
  if (terrain === null) {
    return false;
  }

  const building = findBuildingAtCell(cell, snapshot);
  if (building !== null) {
    return building.passable && (terrain.passable || building.type === "earth_bridge" || building.type === "wood_bridge");
  }

  return terrain.passable;
}

function canPreviewPlaceBuildingCell(snapshot: WorldSnapshot, cell: CellCoord, buildTool: BuildingType): boolean {
  const terrain = getSnapshotCell(snapshot, cell);
  if (terrain === null || findBuildingAtCell(cell, snapshot) !== null) {
    return false;
  }

  const unitAtCell = snapshot.units.some((unit) => sameCell(unit.position, cell));
  if (unitAtCell) {
    return false;
  }

  return terrain.passable || isBridgeBuildTool(buildTool);
}

function buildingPreviewFootprint(buildingType: BuildingType, position: CellCoord): readonly CellCoord[] {
  return BUILDING_FOOTPRINTS[buildingType].map((offset) => ({
    x: position.x + offset.x,
    y: position.y + offset.y
  }));
}

function buildingAssetCandidates(building: BuildingSnapshot): readonly string[] {
  return [building.assetId, baseBuildingAssetId(building), finalBuildingFallbackAssetId(building)];
}

function baseBuildingAssetId(building: BuildingSnapshot): string {
  if (building.type === "fence") {
    return "building.fence.wood";
  }

  if (building.type === "wall") {
    return "building.wall.plaster";
  }

  if (building.type === "gate") {
    return "building.gate.wood.closed";
  }

  if (building.type === "gate_wide_2") {
    return "building.gate.wood.closed.width2";
  }

  if (building.type === "gate_wide_3") {
    return "building.gate.wood.closed.width3";
  }

  if (building.type === "gate_ne_sw") {
    return "building.gate.wood.closed";
  }

  if (building.type === "gate_wide_2_ne_sw") {
    return "building.gate.wood.closed.width2";
  }

  if (building.type === "gate_wide_3_ne_sw") {
    return "building.gate.wood.closed.width3";
  }

  if (building.type === "dry_moat") {
    return "building.dry_moat";
  }

  if (building.type === "water_moat") {
    return "building.water_moat";
  }

  if (building.type === "storehouse") {
    return "building.storehouse";
  }

  if (building.type === "market") {
    return "building.market";
  }

  if (building.type === "barracks") {
    return "building.barracks";
  }

  if (building.type === "samurai_residence") {
    return "building.samurai_residence";
  }

  if (building.type === "town_block") {
    return "building.town_block";
  }

  if (building.type === "farm") {
    return "building.farm";
  }

  if (building.type === "road") {
    return "building.road";
  }

  if (building.type === "earth_bridge") {
    return "building.earth_bridge";
  }

  if (building.type === "wood_bridge") {
    return "building.wood_bridge";
  }

  if (building.type === "tenshu") {
    return "building.tenshu.test";
  }

  return "building.honmaru.marker";
}

function finalBuildingFallbackAssetId(building: BuildingSnapshot): string {
  if (building.type === "dry_moat") {
    return "terrain.dirt.base";
  }

  if (building.type === "water_moat") {
    return "terrain.water.base";
  }

  if (building.type === "honmaru") {
    return "overlay.cell.selected";
  }

  return "overlay.cell.blocked";
}

function isBridgeBuildTool(buildTool: BuildingType): boolean {
  return buildTool === "earth_bridge" || buildTool === "wood_bridge";
}

function isNeSwGateType(buildingType: BuildingType): boolean {
  return (
    buildingType === "gate_ne_sw" ||
    buildingType === "gate_wide_2_ne_sw" ||
    buildingType === "gate_wide_3_ne_sw"
  );
}

function isGateType(buildingType: BuildingType): boolean {
  return (
    buildingType === "gate" ||
    buildingType === "gate_wide_2" ||
    buildingType === "gate_wide_3" ||
    isNeSwGateType(buildingType)
  );
}

function rectangleFootprint(width: number, height: number): readonly CellCoord[] {
  const footprint: CellCoord[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      footprint.push({ x, y });
    }
  }
  return footprint;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
