import type { MutableRefObject } from "react";
import type { BuildingType, CellCoord, EntityId, UnitId, WorldSnapshot } from "@asama/shared";
import {
  roundScreenPixel,
  screenToWorld,
  stepZoom,
  type CameraState
} from "./camera";
import { pickCellAtScreenPoint } from "./elevation";
import { canPreviewPlaceBuildingCell, findBuildingAtCell, getSnapshotCell, isSnapshotPassable } from "./gameRules";
import { findUnitAtScreenPoint, unitScreenPoint } from "./sceneLayer";
import type { ToolMode } from "./GameCanvas";

const DOUBLE_CLICK_MS = 350;
const DOUBLE_CLICK_RADIUS_PX = 8;
const DOUBLE_PRESS_MS = 600;

interface DragState {
  pointerId: number;
  mode: "select" | "pan" | "build";
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

/** Building types that support drag-to-place (1×1 connection-kit pieces). */
const DRAG_BUILD_TYPES = new Set<ToolMode>(["fence", "wall", "hazama_wall", "road", "dry_moat", "water_moat"]);

function isDragBuildTool(tool: ToolMode): tool is BuildingType {
  return DRAG_BUILD_TYPES.has(tool);
}

export interface InputRefs {
  readonly cameraRef: MutableRefObject<CameraState>;
  readonly dragRef: MutableRefObject<DragState | null>;
  readonly snapshotRef: MutableRefObject<WorldSnapshot | null>;
  readonly buildToolRef: MutableRefObject<ToolMode>;
  readonly heldKeysRef: MutableRefObject<Set<string>>;
  readonly onSelectUnitsRef: MutableRefObject<(unitIds: readonly UnitId[], additive: boolean) => void>;
  readonly onAttackTargetRef: MutableRefObject<(targetId: EntityId) => void>;
  readonly onPlaceBuildingRef: MutableRefObject<(buildingType: BuildingType, position: CellCoord) => void>;
  readonly onDemolishBuildingRef: MutableRefObject<(position: CellCoord) => void>;
  readonly onToggleGateRef: MutableRefObject<(position: CellCoord) => void>;
  readonly onEngineerTaskRef: MutableRefObject<(task: "ladder" | "fillMoat", position: CellCoord) => void>;
  readonly onAttackMoveRef: MutableRefObject<(destination: CellCoord) => void>;
  readonly onStopSelectedRef: MutableRefObject<() => void>;
  readonly onGroupSaveRef: MutableRefObject<(groupNum: number, unitIds: readonly UnitId[]) => void>;
  readonly onGroupRecallRef: MutableRefObject<(groupNum: number, jump: boolean) => void>;
  readonly onCancelBuildToolRef: MutableRefObject<() => void>;
  readonly onRaiseTerrainRef: MutableRefObject<(position: CellCoord) => void>;
  readonly onLowerTerrainRef: MutableRefObject<(position: CellCoord) => void>;
  readonly onPlaceSlopeRef: MutableRefObject<(position: CellCoord, length: 1 | 2) => void>;
  readonly onRemoveSlopeRef: MutableRefObject<(position: CellCoord) => void>;
}

export interface PointerInputOptions {
  readonly canvas: HTMLCanvasElement;
  readonly refs: InputRefs;
  readonly scheduleCameraRender: () => void;
  readonly setHoverCell: (cell: CellCoord | null) => void;
  readonly setSelectedCell: (cell: CellCoord | null) => void;
  readonly setLocalInvalidMoveTarget: (cell: CellCoord | null) => void;
  readonly setSelectionBox: (
    box: {
      readonly x0: number;
      readonly y0: number;
      readonly x1: number;
      readonly y1: number;
    } | null
  ) => void;
  readonly onMoveSelected: (destination: CellCoord) => void;
}

export function registerKeyboardInput(
  refs: Pick<
    InputRefs,
    | "cameraRef"
    | "heldKeysRef"
    | "onStopSelectedRef"
    | "snapshotRef"
    | "onGroupSaveRef"
    | "onGroupRecallRef"
  >,
  scheduleCameraRender: () => void
): () => void {
  let lastGroupKeyNum = -1;
  let lastGroupKeyTime = 0;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    const key = event.key.toLowerCase();
    refs.heldKeysRef.current.add(key);
    // While A is held it acts as the attack-move modifier, so it must not
    // also scroll the camera.
    if (key === "s" && !event.repeat) {
      refs.onStopSelectedRef.current();
      return;
    }

    // Group save: Ctrl+1~9
    if (event.ctrlKey && !event.repeat) {
      const digit = parseInt(event.key, 10);
      if (digit >= 1 && digit <= 9) {
        event.preventDefault();
        const selectedIds =
          refs.snapshotRef.current?.units
            .filter((u) => u.selected && u.owner === "player")
            .map((u) => u.id) ?? [];
        refs.onGroupSaveRef.current(digit, selectedIds);
        return;
      }
    }

    // Group recall: 1~9 (no Ctrl, no repeat)
    if (!event.ctrlKey && !event.repeat) {
      const digit = parseInt(event.key, 10);
      if (digit >= 1 && digit <= 9) {
        const now = performance.now();
        const isDoublePress =
          lastGroupKeyNum === digit && now - lastGroupKeyTime < DOUBLE_PRESS_MS;
        refs.onGroupRecallRef.current(digit, isDoublePress);
        lastGroupKeyNum = digit;
        lastGroupKeyTime = now;
        return;
      }
    }

    // Camera scroll lives on the arrow keys: the controls spec assigns
    // WASD to the camera but also S=stop and A=attack-move, so the letter
    // keys go to unit commands and arrows drive the camera.
    const step = 64;
    switch (event.key) {
      case "ArrowUp":
        refs.cameraRef.current.y += step;
        break;
      case "ArrowDown":
        refs.cameraRef.current.y -= step;
        break;
      case "ArrowLeft":
        refs.cameraRef.current.x += step;
        break;
      case "ArrowRight":
        refs.cameraRef.current.x -= step;
        break;
      default:
        return;
    }
    event.preventDefault();
    scheduleCameraRender();
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    refs.heldKeysRef.current.delete(event.key.toLowerCase());
  };
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  };
}

export function registerPointerInput({
  canvas,
  refs,
  scheduleCameraRender,
  setHoverCell,
  setSelectedCell,
  setLocalInvalidMoveTarget,
  setSelectionBox,
  onMoveSelected
}: PointerInputOptions): () => void {
  let lastClickTime = 0;
  let lastClickScreenX = -Infinity;
  let lastClickScreenY = -Infinity;
  // Tracks the last cell placed during a drag-build gesture to avoid duplicate placement.
  let lastBuildCell: { x: number; y: number } | null = null;

  // Elevation-aware screen → cell: a raised cell's diamond is drawn 24px per
  // level higher, so the inverse must probe the lifted grids from the top
  // level down (falls back to the flat inverse on fully flat maps).
  const pickCell = (screenX: number, screenY: number): CellCoord =>
    pickCellAtScreenPoint(screenX, screenY, refs.cameraRef.current, refs.snapshotRef.current?.map ?? null);

  const handlePointerDown = (event: PointerEvent) => {
    // Left button drags a selection box (per controls spec); middle button
    // pans the camera. Right button issues commands via contextmenu.
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    if (event.button === 1) {
      event.preventDefault();
    }

    // Drag-to-build: for 1×1 connection-kit types, fire placement on pointer
    // down and again for each new cell the pointer enters while held.
    if (event.button === 0 && isDragBuildTool(refs.buildToolRef.current)) {
      const rect = canvas.getBoundingClientRect();
      const clickedCell = pickCell(event.clientX - rect.left, event.clientY - rect.top);
      const activeTool = refs.buildToolRef.current as BuildingType;
      const snapshot = refs.snapshotRef.current;
      if (snapshot !== null && canPreviewPlaceBuildingCell(snapshot, clickedCell, activeTool)) {
        refs.onPlaceBuildingRef.current(activeTool, clickedCell);
      }
      lastBuildCell = clickedCell;
      refs.dragRef.current = {
        pointerId: event.pointerId,
        mode: "build",
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    refs.dragRef.current = {
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
    const drag = refs.dragRef.current;
    if (drag !== null && drag.pointerId === event.pointerId) {
      const totalDx = event.clientX - drag.startX;
      const totalDy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(totalDx, totalDy) > 6) {
        drag.moved = true;
      }

      if (drag.mode === "build") {
        const rect = canvas.getBoundingClientRect();
        const currentCell = pickCell(event.clientX - rect.left, event.clientY - rect.top);
        if (lastBuildCell === null || currentCell.x !== lastBuildCell.x || currentCell.y !== lastBuildCell.y) {
          const activeTool = refs.buildToolRef.current;
          const snapshot = refs.snapshotRef.current;
          if (isDragBuildTool(activeTool) && snapshot !== null && canPreviewPlaceBuildingCell(snapshot, currentCell, activeTool as BuildingType)) {
            refs.onPlaceBuildingRef.current(activeTool as BuildingType, currentCell);
          }
          lastBuildCell = currentCell;
        }
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        return;
      }

      if (drag.moved && drag.mode === "pan") {
        const dx = event.clientX - drag.lastX;
        const dy = event.clientY - drag.lastY;
        refs.cameraRef.current.x = roundScreenPixel(refs.cameraRef.current.x + dx);
        refs.cameraRef.current.y = roundScreenPixel(refs.cameraRef.current.y + dy);
        scheduleCameraRender();
      }
      if (drag.moved && drag.mode === "select" && refs.buildToolRef.current === null) {
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
    setHoverCell(pickCell(event.clientX - rect.left, event.clientY - rect.top));
  };

  const handlePointerUp = (event: PointerEvent) => {
    const drag = refs.dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }

    refs.dragRef.current = null;
    canvas.releasePointerCapture(event.pointerId);
    setSelectionBox(null);

    // Drag-build gesture ends: placement already fired on down/move, skip up.
    if (drag.mode === "build") {
      lastBuildCell = null;
      return;
    }

    const rect = canvas.getBoundingClientRect();

    if (drag.moved && drag.mode === "select" && refs.buildToolRef.current === null) {
      // Box select: every player unit whose screen point falls inside the
      // dragged rectangle.
      const minX = Math.min(drag.startX, event.clientX) - rect.left;
      const maxX = Math.max(drag.startX, event.clientX) - rect.left;
      const minY = Math.min(drag.startY, event.clientY) - rect.top;
      const maxY = Math.max(drag.startY, event.clientY) - rect.top;
      const snapshot = refs.snapshotRef.current;
      const ids: UnitId[] = [];
      for (const unit of snapshot?.units ?? []) {
        if (unit.owner !== "player") {
          continue;
        }
        const point = unitScreenPoint(unit, refs.cameraRef.current, snapshot?.map ?? null);
        if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
          ids.push(unit.id);
        }
      }
      if (ids.length > 0 || !event.shiftKey) {
        refs.onSelectUnitsRef.current(ids, event.shiftKey);
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
    const clickedCell = pickCell(screenPoint.x, screenPoint.y);
    // Cliff terrain cells are visual-only; treat a click on one as a
    // plain non-interactive ground click (clear selection, do nothing else).
    {
      const snap = refs.snapshotRef.current;
      const clickedTerrain = snap?.map.cells[clickedCell.y * snap.map.width + clickedCell.x];
      if (clickedTerrain?.terrain === "cliff") {
        if (!event.shiftKey) {
          refs.onSelectUnitsRef.current([], false);
        }
        setSelectedCell(null);
        return;
      }
    }
    const activeBuildTool = refs.buildToolRef.current;
    if (activeBuildTool === "demolish") {
      setSelectedCell(clickedCell);
      refs.onDemolishBuildingRef.current(clickedCell);
      return;
    }

    if (activeBuildTool === "ladder" || activeBuildTool === "fillMoat") {
      setSelectedCell(clickedCell);
      refs.onEngineerTaskRef.current(activeBuildTool, clickedCell);
      return;
    }

    if (activeBuildTool === "raiseTerrain") {
      setSelectedCell(clickedCell);
      refs.onRaiseTerrainRef.current(clickedCell);
      return;
    }

    if (activeBuildTool === "lowerTerrain") {
      setSelectedCell(clickedCell);
      refs.onLowerTerrainRef.current(clickedCell);
      return;
    }

    if (activeBuildTool === "placeSlope" || activeBuildTool === "placeSlopeGentle") {
      setSelectedCell(clickedCell);
      refs.onPlaceSlopeRef.current(clickedCell, activeBuildTool === "placeSlopeGentle" ? 2 : 1);
      return;
    }

    if (activeBuildTool === "removeSlope") {
      setSelectedCell(clickedCell);
      refs.onRemoveSlopeRef.current(clickedCell);
      return;
    }

    if (activeBuildTool !== null) {
      setSelectedCell(clickedCell);
      refs.onPlaceBuildingRef.current(activeBuildTool, clickedCell);
      return;
    }

    if (refs.heldKeysRef.current.has("a")) {
      refs.onAttackMoveRef.current(clickedCell);
      setSelectedCell(clickedCell);
      return;
    }

    const hitUnit = findUnitAtScreenPoint(screenPoint, refs.snapshotRef.current, refs.cameraRef.current);
    if (hitUnit !== null && hitUnit.owner === "player") {
      const now = performance.now();
      const isDoubleClick =
        now - lastClickTime < DOUBLE_CLICK_MS &&
        Math.hypot(event.clientX - lastClickScreenX, event.clientY - lastClickScreenY) <
          DOUBLE_CLICK_RADIUS_PX;

      if (isDoubleClick) {
        const snapshot = refs.snapshotRef.current;
        const camera = refs.cameraRef.current;
        const rect = canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const sameTypeIds =
          snapshot?.units
            .filter((u) => u.owner === "player" && u.type === hitUnit.type)
            .filter((u) => {
              const pt = unitScreenPoint(u, camera, snapshot?.map ?? null);
              return pt.x >= 0 && pt.x <= w && pt.y >= 0 && pt.y <= h;
            })
            .map((u) => u.id) ?? [];
        refs.onSelectUnitsRef.current(sameTypeIds, false);
        lastClickTime = 0;
        setSelectedCell(null);
        return;
      }

      lastClickTime = now;
      lastClickScreenX = event.clientX;
      lastClickScreenY = event.clientY;
      refs.onSelectUnitsRef.current([hitUnit.id], event.shiftKey);
      setSelectedCell(null);
      return;
    }

    // Clicking one of our own gates toggles it open or closed.
    const hitBuilding = findBuildingAtCell(clickedCell, refs.snapshotRef.current);
    if (hitBuilding !== null && hitBuilding.owner === "player" && hitBuilding.gateState !== null) {
      refs.onToggleGateRef.current(clickedCell);
      setSelectedCell(clickedCell);
      return;
    }

    // Plain click on the ground clears the current selection.
    if (!event.shiftKey) {
      refs.onSelectUnitsRef.current([], false);
    }
    setSelectedCell(clickedCell);
  };

  const handlePointerLeave = () => {
    setHoverCell(null);
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const before = screenToWorld(event.clientX - rect.left, event.clientY - rect.top, refs.cameraRef.current);
    const nextZoom = stepZoom(refs.cameraRef.current.zoom, event.deltaY > 0 ? -1 : 1);
    refs.cameraRef.current.zoom = nextZoom;
    refs.cameraRef.current.x = roundScreenPixel(event.clientX - rect.left - before.x * nextZoom);
    refs.cameraRef.current.y = roundScreenPixel(event.clientY - rect.top - before.y * nextZoom);
    scheduleCameraRender();
  };

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const screenPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    const destination = pickCell(screenPoint.x, screenPoint.y);
    if (refs.buildToolRef.current !== null) {
      // Right-click during build mode cancels the tool and returns to Select.
      refs.onCancelBuildToolRef.current();
      return;
    }

    const snapshot = refs.snapshotRef.current;
    const hitUnit = findUnitAtScreenPoint(screenPoint, snapshot, refs.cameraRef.current);
    if (hitUnit !== null && hitUnit.owner === "enemy") {
      setSelectedCell(hitUnit.position);
      setLocalInvalidMoveTarget(null);
      refs.onAttackTargetRef.current(hitUnit.id);
      return;
    }

    const hitBuilding = findBuildingAtCell(destination, snapshot);
    if (hitBuilding !== null && hitBuilding.owner === "enemy") {
      setSelectedCell(destination);
      setLocalInvalidMoveTarget(null);
      refs.onAttackTargetRef.current(hitBuilding.id);
      return;
    }

    const targetCell = getSnapshotCell(refs.snapshotRef.current, destination);
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
}
