// Fixed oblique orthographic camera for the trial 3D renderer.
//
// The camera never rotates — it sits on a fixed direction (roughly the same
// oblique top-down angle as the current 2D isometric view) and only pans /
// zooms. This preserves the game-board readability the shipped renderer
// already has, and avoids the "generic 3D castle game" trap.

import { OrthographicCamera } from "three";
import { CELL_SIZE, cellCenterToThreeWorld } from "./coord";
import type { CellCoord } from "@asama/shared";

/** Discrete zoom rungs (world units of vertical viewport height). Smaller =
 *  more zoomed in. Chosen to keep pixel snap plausible on the 24x24 trial map. */
const ZOOM_LEVELS = [40, 30, 24, 18, 14, 10, 7, 5] as const;

/** Default index into ZOOM_LEVELS at scene start (2 → 24 units, fits the
 *  trial window comfortably). */
const DEFAULT_ZOOM_INDEX = 2;

/** Fixed oblique view direction: look toward -X, -Y (south-east from above)
 *  so both the +X and +Z axes tilt away from the viewer, matching the
 *  isometric read of the 2D layer where +x/+y both extend down-right. */
const CAMERA_DIRECTION = { x: 1, y: -1.4, z: 1 } as const;

const CAMERA_UP = { x: 0, y: 1, z: 0 } as const;

/** How far from the focus point the camera sits along CAMERA_DIRECTION.
 *  Orthographic projection makes this a framing choice only (no perspective
 *  divide), but a large offset keeps near/far planes generous. */
const CAMERA_DISTANCE = 100;

export interface CameraControls {
  readonly camera: OrthographicCamera;
  /** World-space ground point the camera looks at (y is dropped: pan is 2D). */
  focus: { x: number; z: number };
  zoomIndex: number;
  updateProjection(viewportWidth: number, viewportHeight: number): void;
  panByScreen(dxPx: number, dyPx: number, viewportHeight: number): void;
  zoomStep(direction: -1 | 1, viewportWidth: number, viewportHeight: number): void;
  centerOnCell(cell: CellCoord): void;
}

export function createCameraControls(
  viewportWidth: number,
  viewportHeight: number
): CameraControls {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const state: CameraControls = {
    camera,
    focus: { x: 0, z: 0 },
    zoomIndex: DEFAULT_ZOOM_INDEX,
    updateProjection(width, height) {
      const halfHeight = ZOOM_LEVELS[state.zoomIndex]! / 2;
      const aspect = width / height;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      applyCameraTransform(camera, state.focus);
    },
    panByScreen(dxPx, dyPx, vpHeight) {
      // Convert screen pixels to world units at the current zoom. The camera
      // is oriented so screen +x ≈ world +x on the ground, but the oblique
      // tilt makes screen +y move both +z and slightly +y in world space.
      // For pan the user cares about ground movement only, so use the ground
      // plane projection of the camera axes.
      const worldPerPixel = ZOOM_LEVELS[state.zoomIndex]! / vpHeight;
      // Ground-projected right and down vectors for the fixed camera direction.
      // Because CAMERA_DIRECTION is (+1, -1.4, +1), right ≈ (1, 0, -1)/√2 in
      // world XZ (rotating x/z 45°), and screen-down ≈ (1, 0, 1)/√2.
      const invSqrt2 = 1 / Math.SQRT2;
      state.focus.x += (-dxPx * worldPerPixel) * invSqrt2 + (-dyPx * worldPerPixel) * invSqrt2;
      state.focus.z += (dxPx * worldPerPixel) * invSqrt2 + (-dyPx * worldPerPixel) * invSqrt2;
      applyCameraTransform(camera, state.focus);
    },
    zoomStep(direction, width, height) {
      const next = clamp(state.zoomIndex + direction, 0, ZOOM_LEVELS.length - 1);
      if (next === state.zoomIndex) return;
      state.zoomIndex = next;
      state.updateProjection(width, height);
    },
    centerOnCell(cell) {
      const p = cellCenterToThreeWorld(cell);
      state.focus.x = p.x;
      state.focus.z = p.z;
      applyCameraTransform(camera, state.focus);
    }
  };
  state.updateProjection(viewportWidth, viewportHeight);
  return state;
}

function applyCameraTransform(
  camera: OrthographicCamera,
  focus: { x: number; z: number }
): void {
  camera.position.set(
    focus.x + CAMERA_DIRECTION.x * CAMERA_DISTANCE,
    CAMERA_DIRECTION.y * CAMERA_DISTANCE * -1, // world +Y is up; direction.y is negative to look down
    focus.z + CAMERA_DIRECTION.z * CAMERA_DISTANCE
  );
  camera.up.set(CAMERA_UP.x, CAMERA_UP.y, CAMERA_UP.z);
  camera.lookAt(focus.x, 0, focus.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Number of screen pixels one cell edge occupies at the given zoom index.
 *  Used by picking sanity checks and QA. */
export function pixelsPerCell(zoomIndex: number, viewportHeight: number): number {
  return (viewportHeight * CELL_SIZE) / ZOOM_LEVELS[zoomIndex]!;
}

export function zoomLevelCount(): number {
  return ZOOM_LEVELS.length;
}
