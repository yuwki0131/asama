import type { CellCoord } from "@asama/shared";

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const UNIT_GROUND_OFFSET_Y = 0;

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function cellToWorld(cell: CellCoord): CellCoord {
  return {
    x: (cell.x - cell.y) * (TILE_WIDTH / 2),
    y: (cell.x + cell.y) * (TILE_HEIGHT / 2)
  };
}

export function gridCornerToWorld(corner: CellCoord): CellCoord {
  return {
    x: (corner.x - corner.y) * (TILE_WIDTH / 2),
    y: (corner.x + corner.y) * (TILE_HEIGHT / 2) - TILE_HEIGHT / 2
  };
}

export function snapCamera(camera: CameraState): void {
  camera.x = roundScreenPixel(camera.x);
  camera.y = roundScreenPixel(camera.y);
  camera.zoom = nearestZoomStep(camera.zoom);
}

export function stepZoom(currentZoom: number, direction: -1 | 1): number {
  const index = ZOOM_STEPS.findIndex((zoom) => zoom === nearestZoomStep(currentZoom));
  const nextIndex = clamp(index + direction, 0, ZOOM_STEPS.length - 1);
  return ZOOM_STEPS[nextIndex] ?? 1;
}

export function nearestZoomStep(zoom: number): number {
  return ZOOM_STEPS.reduce((nearest, candidate) =>
    Math.abs(candidate - zoom) < Math.abs(nearest - zoom) ? candidate : nearest
  );
}

export function roundScreenPixel(value: number): number {
  return Math.round(value);
}

export function roundWorldPixel(value: number, zoom: number): number {
  return Math.round(value * zoom) / zoom;
}

export function screenToWorld(x: number, y: number, camera: CameraState): CellCoord {
  return {
    x: (x - camera.x) / camera.zoom,
    y: (y - camera.y) / camera.zoom
  };
}

export function screenToCellFloat(x: number, y: number, camera: CameraState): { x: number; y: number } {
  const local = screenToWorld(x, y, camera);
  return {
    x: local.y / TILE_HEIGHT + local.x / TILE_WIDTH,
    y: local.y / TILE_HEIGHT - local.x / TILE_WIDTH
  };
}

export function screenToCell(x: number, y: number, camera: CameraState): CellCoord {
  const local = screenToWorld(x, y, camera);
  return {
    x: Math.round(local.y / TILE_HEIGHT + local.x / TILE_WIDTH),
    y: Math.round(local.y / TILE_HEIGHT - local.x / TILE_WIDTH)
  };
}

export function worldToScreen(point: CellCoord, camera: CameraState): CellCoord {
  return {
    x: camera.x + point.x * camera.zoom,
    y: camera.y + point.y * camera.zoom
  };
}

export function centerCameraOnCell(cell: CellCoord, host: HTMLElement, camera: CameraState): void {
  const world = cellToWorld(cell);
  camera.zoom = 1;
  camera.x = host.clientWidth / 2 - world.x;
  camera.y = host.clientHeight / 2 - world.y;
}

export function isVisibleCell(cell: CellCoord, camera: CameraState, width: number, height: number): boolean {
  const point = worldToScreen(cellToWorld(cell), camera);
  const margin = TILE_WIDTH * camera.zoom * 2;
  return point.x >= -margin && point.x <= width + margin && point.y >= -margin && point.y <= height + margin;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
