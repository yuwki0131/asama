import { MAP_HEIGHT, MAP_WIDTH } from "@asama/shared";
import type { CellCoord, WorldSnapshot } from "@asama/shared";
import { cellToWorld, roundScreenPixel, screenToCellFloat, type CameraState } from "./camera";

export interface MinimapTerrainCache {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
}

const MINIMAP_TERRAIN_COLORS: Record<string, string> = {
  grass: "#7d9c60",
  dirt: "#8a7a58",
  water: "#33566b",
  stone: "#6f7278"
};

export function drawMinimap(
  canvas: HTMLCanvasElement | null,
  terrainCacheRef: { current: MinimapTerrainCache | null },
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

export function jumpCameraFromMinimap(
  pointer: CellCoord,
  canvasRect: DOMRect,
  host: HTMLElement,
  camera: CameraState
): void {
  const cellX = (pointer.x / canvasRect.width) * MAP_WIDTH;
  const cellY = (pointer.y / canvasRect.height) * MAP_HEIGHT;
  const world = cellToWorld({ x: cellX, y: cellY });
  camera.x = roundScreenPixel(host.clientWidth / 2 - world.x * camera.zoom);
  camera.y = roundScreenPixel(host.clientHeight / 2 - world.y * camera.zoom);
}

export { MAP_HEIGHT, MAP_WIDTH };
