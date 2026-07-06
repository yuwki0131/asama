import type { Application, Container } from "pixi.js";
import type { CellCoord, WorldSnapshot } from "@asama/shared";
import { clearLayer, type LoadedAsset } from "./assets";
import { roundScreenPixel, type CameraState } from "./camera";
import { getSnapshotCell, isInsideSnapshotMap } from "./gameRules";
import { addAlignmentDebugOverlay, addCellActionPreview, addOverlaySprite, addPathSprites } from "./overlayLayer";
import { buildTerrainChunks, terrainKeyFor, updateTerrainChunkVisibility } from "./terrainLayer";
import type { ToolMode } from "./GameCanvas";

/**
 * Snapshot/interaction-driven rendering: terrain chunk (re)build, overlay
 * sprites (paths, hover, build previews) and the alignment debug overlay.
 * Units and buildings live in the retained scene graph (sceneLayer.ts) and
 * are updated by the per-frame ticker in GameCanvas instead.
 */
export function renderScene(
  app: Application | null,
  world: Container | null,
  terrainLayer: Container | null,
  overlayLayer: Container | null,
  debugLayer: Container | null,
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
  if (app === null || world === null || terrainLayer === null || overlayLayer === null || debugLayer === null) {
    return;
  }

  world.position.set(roundScreenPixel(camera.x), roundScreenPixel(camera.y));
  world.scale.set(camera.zoom);

  // Terrain is static: build the whole map into chunk containers exactly
  // once (per map/assets identity) and cull whole chunks per frame by
  // toggling visibility. Rebuilding sprites on camera moves froze the tab
  // when many cells were visible.
  const terrainKey = terrainKeyFor(snapshot, assets);
  if (lastTerrainKeyRef.current !== terrainKey) {
    buildTerrainChunks(terrainLayer, snapshot, assets);
    lastTerrainKeyRef.current = terrainKey;
  }
  updateTerrainChunkVisibility(terrainLayer, camera, app.screen.width, app.screen.height);

  clearLayer(overlayLayer);

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

  clearLayer(debugLayer);
  if (debugOverlayVisible) {
    addAlignmentDebugOverlay(debugLayer, snapshot, camera, app.screen.width, app.screen.height, assets);
  }
}
