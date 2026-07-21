// Pointer → cell picking for the trial 3D renderer.
//
// Two strategies:
//   1. Fast path — a virtual ground plane at each elevation level; ray-plane
//      intersection is O(1) and always yields a hit inside the map.
//   2. Fallback — direct raycast against the terrain mesh for accuracy.
//
// The trial uses (1) because the trial scenario has a small, known elevation
// set and the fast path keeps picking predictable when the camera pans.

import { Camera, Plane, Raycaster, Vector2, Vector3 } from "three";
import type { CellCoord, WorldSnapshot } from "@asama/shared";
import { CELL_SIZE, ELEVATION_HEIGHT, threeWorldToCell } from "./coord";

const raycaster = new Raycaster();
const ndc = new Vector2();

export function pickCell(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  camera: Camera,
  snapshot: WorldSnapshot | null
): CellCoord | null {
  ndc.x = ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
  ndc.y = -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);

  const maxElevation = maxScenarioElevation(snapshot);
  // Try each elevation from highest to lowest; the first plane the ray hits
  // inside a matching-elevation cell wins.
  for (let e = maxElevation; e >= 0; e -= 1) {
    const cell = intersectAtElevation(e, snapshot);
    if (cell !== null) return cell;
  }
  // Fallback: ground plane at y=0.
  return intersectAtElevation(0, snapshot);
}

function intersectAtElevation(elevation: number, snapshot: WorldSnapshot | null): CellCoord | null {
  const plane = new Plane(new Vector3(0, 1, 0), -elevation * ELEVATION_HEIGHT);
  const target = new Vector3();
  const hit = raycaster.ray.intersectPlane(plane, target);
  if (hit === null) return null;
  const cell = threeWorldToCell(target.x, target.z);
  if (snapshot === null) return cell;
  const { width, height, cells } = snapshot.map;
  if (cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= height) return null;
  const cellRow = cells.find(
    (c) => c.coord.x === cell.x && c.coord.y === cell.y
  );
  if (cellRow === undefined) return cell;
  // Only accept the hit if this cell is actually at the tested elevation
  // (or lower with no cell above it). Otherwise fall through so a higher
  // terrace plane can claim it.
  if (cellRow.elevation === elevation) return cell;
  if (elevation === 0 && cellRow.elevation === 0) return cell;
  return null;
}

function maxScenarioElevation(snapshot: WorldSnapshot | null): number {
  if (snapshot === null) return 0;
  let max = 0;
  for (const cell of snapshot.map.cells) {
    if (cell.elevation > max) max = cell.elevation;
  }
  return max;
}

/** Convert a cell to on-screen pixel coordinates within the canvas. */
export function cellToScreen(
  cell: CellCoord,
  elevation: number,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const world = new Vector3(
    (cell.x + 0.5) * CELL_SIZE,
    elevation * ELEVATION_HEIGHT,
    (cell.y + 0.5) * CELL_SIZE
  );
  world.project(camera);
  return {
    x: (world.x * 0.5 + 0.5) * canvasWidth,
    y: (-world.y * 0.5 + 0.5) * canvasHeight
  };
}
