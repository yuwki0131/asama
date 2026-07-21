// Trial-only rendering-domain data models for the hybrid 3D renderer.
//
// These live in the renderer layer (not simulation state) and describe the
// procedural geometry the trial generates. Keeping them here avoids inflating
// the simulation type surface for an evaluation-only feature — the
// simulation still sees only its usual grid, cells, and BuildingSnapshot.

import type { CellCoord } from "@asama/shared";

export type LinearFeatureKind =
  | "stone_wall" // stone rampart (石垣): sloped-face terrace edge
  | "plaster_wall" // 白壁: castle wall body with dark roof cap
  | "wood_fence" // 木柵: posts + horizontal member
  | "earthwork" // 土塁: earthen berm
  | "dry_moat" // 空堀: dry trench
  | "water_moat"; // 水堀: water-filled moat

export interface LinearFeature {
  readonly id: string;
  readonly kind: LinearFeatureKind;
  /** Polyline in simulation-grid coordinates. Segments >= 1. */
  readonly path: readonly CellCoord[];
  /** Perpendicular width in cell units. */
  readonly width: number;
  /** Vertical extent above the base surface in cell units (visual only). */
  readonly height: number;
  /** Elevation of the base surface the feature sits on (integer level). */
  readonly baseElevation?: number;
  /** Reserved for a future material lookup; unused in the trial. */
  readonly materialId?: string;
}

export type AreaFeatureKind =
  | "bailey" // 曲輪: raised castle grounds
  | "courtyard" // 中庭: interior flat area
  | "raised_ground" // 高台
  | "water" // 池・水堀の湛水部
  | "slope_area"; // 傾斜地

export interface AreaFeature {
  readonly id: string;
  readonly kind: AreaFeatureKind;
  /** CCW polygon in simulation-grid coordinates (auto-triangulated on build). */
  readonly polygon: readonly CellCoord[];
  /** Integer elevation level for the top surface. Water uses this for depth. */
  readonly elevation: number;
  readonly materialId?: string;
}

export interface TrialFeatures {
  readonly areas: readonly AreaFeature[];
  readonly linears: readonly LinearFeature[];
}

/** Reject paths that would produce degenerate geometry. Returns the reason
 *  string on failure, or null on success. */
export function validateLinearPath(path: readonly CellCoord[]): string | null {
  if (path.length < 2) return "path must have at least 2 points";
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (a.x === b.x && a.y === b.y) return `duplicate consecutive point at index ${i}`;
  }
  return null;
}

/** Reject polygons that would produce degenerate geometry. */
export function validateAreaPolygon(polygon: readonly CellCoord[]): string | null {
  if (polygon.length < 3) return "polygon must have at least 3 vertices";
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if (a.x === b.x && a.y === b.y) return `duplicate adjacent vertex at index ${i}`;
  }
  return null;
}
