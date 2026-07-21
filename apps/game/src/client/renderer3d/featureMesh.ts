// Procedural geometry for LinearFeature and AreaFeature (石垣・壁・柵・堀・曲輪).
//
// Each generator returns a Mesh (or Group) that can be added directly to the
// scene. The trial does not attempt to model individual stones or planks: the
// point is to prove that irregular castle outlines are expressible without a
// per-direction sprite matrix.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  Vector2,
  Vector3
} from "three";
import { CELL_SIZE, ELEVATION_HEIGHT } from "./coord";
import type { AreaFeature, LinearFeature } from "./features";

// --- Colour palette: hand-picked to sit next to the illustrated 2D sprites --

const STONE_COLOR = new Color(0x9c8f7a);
const STONE_TOP_COLOR = new Color(0xb8ac95);
const PLASTER_BODY = new Color(0xefe6d3);
const PLASTER_ROOF = new Color(0x3a2f26);
const FENCE_POST = new Color(0x6b4a2b);
const EARTHWORK = new Color(0x8f7a58);
const DRY_MOAT_FLOOR = new Color(0x6a5238);
const WATER_SURFACE = new Color(0x3a70a0);
const BAILEY_TOP = new Color(0xa4a982);
const COURTYARD_TOP = new Color(0xcbc19a);

/** Convert a polyline (cell coords) to Vector3 waypoints on the ground plane
 *  at the requested base elevation. */
function pathToVectors(path: readonly { x: number; y: number }[], baseElevation: number): Vector3[] {
  return path.map(
    (p) => new Vector3(p.x * CELL_SIZE, baseElevation * ELEVATION_HEIGHT, p.y * CELL_SIZE)
  );
}

/** Build a ribbon mesh along a polyline with a trapezoidal cross-section
 *  (outer face slopes outward for stone ramparts, straight for walls/fences). */
function buildRibbon(
  waypoints: Vector3[],
  {
    width,
    height,
    baseWidenBy,
    color,
    topColor
  }: {
    width: number;
    height: number;
    baseWidenBy: number;
    color: Color;
    topColor: Color;
  }
): BufferGeometry {
  // Compute perpendicular offsets at each waypoint using average tangent.
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const halfTop = width / 2;
  const halfBase = width / 2 + baseWidenBy;

  const tangents: Vector3[] = [];
  for (let i = 0; i < waypoints.length; i += 1) {
    const prev = (i > 0 ? waypoints[i - 1] : waypoints[i])!;
    const next = (i < waypoints.length - 1 ? waypoints[i + 1] : waypoints[i])!;
    const t = new Vector3().subVectors(next, prev);
    t.y = 0;
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    t.normalize();
    tangents.push(t);
  }

  const perps = tangents.map((t) => new Vector3(-t.z, 0, t.x)); // rotate 90° in XZ

  // Build 4 rings of vertices per waypoint: outer-base, outer-top, inner-top,
  // inner-base. Then two side quads (outer face + inner face) + top strip.
  for (let i = 0; i < waypoints.length; i += 1) {
    const c = waypoints[i]!;
    const p = perps[i]!;
    const outerBase = new Vector3(c.x + p.x * halfBase, c.y, c.z + p.z * halfBase);
    const outerTop = new Vector3(c.x + p.x * halfTop, c.y + height * ELEVATION_HEIGHT, c.z + p.z * halfTop);
    const innerTop = new Vector3(c.x - p.x * halfTop, c.y + height * ELEVATION_HEIGHT, c.z - p.z * halfTop);
    const innerBase = new Vector3(c.x - p.x * halfBase, c.y, c.z - p.z * halfBase);
    positions.push(
      outerBase.x, outerBase.y, outerBase.z,
      outerTop.x, outerTop.y, outerTop.z,
      innerTop.x, innerTop.y, innerTop.z,
      innerBase.x, innerBase.y, innerBase.z
    );
    // 4 colors per waypoint: base uses stone body, top uses lighter cap
    colors.push(color.r, color.g, color.b);
    colors.push(topColor.r, topColor.g, topColor.b);
    colors.push(topColor.r, topColor.g, topColor.b);
    colors.push(color.r, color.g, color.b);
  }

  const stride = 4;
  for (let i = 0; i + 1 < waypoints.length; i += 1) {
    const a = i * stride;
    const b = (i + 1) * stride;
    // Outer face: outerBase(0)/outerTop(1)
    indices.push(a + 0, a + 1, b + 1);
    indices.push(a + 0, b + 1, b + 0);
    // Top: outerTop(1)/innerTop(2)
    indices.push(a + 1, a + 2, b + 2);
    indices.push(a + 1, b + 2, b + 1);
    // Inner face: innerTop(2)/innerBase(3)
    indices.push(a + 2, a + 3, b + 3);
    indices.push(a + 2, b + 3, b + 2);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// --- Stone rampart (石垣) ---------------------------------------------------

export function createStoneRampartMesh(feature: LinearFeature): Mesh {
  const waypoints = pathToVectors(feature.path, feature.baseElevation ?? 0);
  // Sloped outer face (batter): base 40% wider than top so it reads as 石垣.
  const geometry = buildRibbon(waypoints, {
    width: feature.width * CELL_SIZE,
    height: feature.height,
    baseWidenBy: feature.width * 0.4 * CELL_SIZE,
    color: STONE_COLOR,
    topColor: STONE_TOP_COLOR
  });
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: DoubleSide
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = feature.id;
  return mesh;
}

// --- Plaster wall (白壁) ----------------------------------------------------

export function createPlasterWallMesh(feature: LinearFeature): Mesh {
  const waypoints = pathToVectors(feature.path, feature.baseElevation ?? 0);
  const geometry = buildRibbon(waypoints, {
    width: feature.width * CELL_SIZE,
    height: feature.height,
    baseWidenBy: 0.02 * CELL_SIZE, // minimal splay
    color: PLASTER_BODY,
    topColor: PLASTER_ROOF
  });
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    metalness: 0,
    side: DoubleSide
  });
  return new Mesh(geometry, material);
}

// --- Wood fence (木柵) ------------------------------------------------------

export function createWoodFenceMesh(feature: LinearFeature): Group {
  const group = new Group();
  const baseY = (feature.baseElevation ?? 0) * ELEVATION_HEIGHT;
  const postHeight = feature.height * ELEVATION_HEIGHT;
  const postThickness = 0.08 * CELL_SIZE;

  // Rail: one thin ribbon at the top.
  const railGeom = buildRibbon(pathToVectors(feature.path, feature.baseElevation ?? 0), {
    width: feature.width * CELL_SIZE * 0.15,
    height: feature.height * 0.85,
    baseWidenBy: 0,
    color: FENCE_POST,
    topColor: FENCE_POST
  });
  const railMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0
  });
  group.add(new Mesh(railGeom, railMat));

  // Posts sampled along the path every ~1 cell.
  const samplePoints = samplePathAtInterval(feature.path, 1.0);
  const postGeom = new BufferGeometry();
  const posts: number[] = [];
  const postColors: number[] = [];
  const postIndices: number[] = [];
  let idx = 0;
  for (const p of samplePoints) {
    const px = p.x * CELL_SIZE;
    const pz = p.y * CELL_SIZE;
    const h = postThickness / 2;
    // 4 bottom + 4 top corners
    posts.push(
      px - h, baseY, pz - h,
      px + h, baseY, pz - h,
      px + h, baseY, pz + h,
      px - h, baseY, pz + h,
      px - h, baseY + postHeight, pz - h,
      px + h, baseY + postHeight, pz - h,
      px + h, baseY + postHeight, pz + h,
      px - h, baseY + postHeight, pz + h
    );
    for (let i = 0; i < 8; i += 1) {
      postColors.push(FENCE_POST.r, FENCE_POST.g, FENCE_POST.b);
    }
    // Box faces
    const b = idx;
    // top
    postIndices.push(b + 4, b + 5, b + 6, b + 4, b + 6, b + 7);
    // sides
    postIndices.push(b + 0, b + 4, b + 5, b + 0, b + 5, b + 1);
    postIndices.push(b + 1, b + 5, b + 6, b + 1, b + 6, b + 2);
    postIndices.push(b + 2, b + 6, b + 7, b + 2, b + 7, b + 3);
    postIndices.push(b + 3, b + 7, b + 4, b + 3, b + 4, b + 0);
    idx += 8;
  }
  postGeom.setAttribute("position", new BufferAttribute(new Float32Array(posts), 3));
  postGeom.setAttribute("color", new BufferAttribute(new Float32Array(postColors), 3));
  postGeom.setIndex(postIndices);
  postGeom.computeVertexNormals();
  const postMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0
  });
  group.add(new Mesh(postGeom, postMat));
  return group;
}

// --- Earthwork (土塁) -------------------------------------------------------

export function createEarthworkMesh(feature: LinearFeature): Mesh {
  const waypoints = pathToVectors(feature.path, feature.baseElevation ?? 0);
  const geometry = buildRibbon(waypoints, {
    width: feature.width * CELL_SIZE,
    height: feature.height,
    baseWidenBy: feature.width * 0.6 * CELL_SIZE,
    color: EARTHWORK,
    topColor: EARTHWORK.clone().lerp(new Color(0xa89676), 0.5)
  });
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0
  });
  return new Mesh(geometry, material);
}

// --- Moat (空堀・水堀) ------------------------------------------------------

/** Trench floor mesh sunk below the base surface. For water moats a separate
 *  translucent surface mesh sits on top at surface elevation. */
export function createMoatMeshes(feature: LinearFeature): Group {
  const group = new Group();
  const baseElevation = feature.baseElevation ?? 0;
  const trenchDepthCells = feature.height;
  const trenchColor = feature.kind === "water_moat" ? DRY_MOAT_FLOOR.clone().lerp(new Color(0x1e3a52), 0.6) : DRY_MOAT_FLOOR;

  const floorWaypoints = pathToVectors(feature.path, baseElevation).map((v) => {
    v.y -= trenchDepthCells * ELEVATION_HEIGHT;
    return v;
  });

  const trenchGeom = buildTrenchGeometry(feature.path, baseElevation, trenchDepthCells, feature.width, trenchColor);
  const trenchMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: DoubleSide
  });
  group.add(new Mesh(trenchGeom, trenchMat));

  if (feature.kind === "water_moat") {
    // Water surface: single translucent ribbon just below ground level.
    const surfaceGeom = buildWaterSurfaceGeometry(feature.path, baseElevation, feature.width);
    const surfaceMat = new MeshStandardMaterial({
      color: WATER_SURFACE,
      roughness: 0.4,
      metalness: 0.05,
      transparent: true,
      opacity: 0.85,
      side: DoubleSide
    });
    const surfaceMesh = new Mesh(surfaceGeom, surfaceMat);
    surfaceMesh.renderOrder = 1;
    group.add(surfaceMesh);
  }

  // Silence lint by referring to derived floor points (used implicitly via trenchGeom).
  void floorWaypoints;
  return group;
}

function buildTrenchGeometry(
  path: readonly { x: number; y: number }[],
  baseElevation: number,
  depthCells: number,
  widthCells: number,
  color: Color
): BufferGeometry {
  const waypoints = pathToVectors(path, baseElevation);
  const perps: Vector3[] = [];
  for (let i = 0; i < waypoints.length; i += 1) {
    const prev = (i > 0 ? waypoints[i - 1] : waypoints[i])!;
    const next = (i < waypoints.length - 1 ? waypoints[i + 1] : waypoints[i])!;
    const t = new Vector3().subVectors(next, prev);
    t.y = 0;
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    t.normalize();
    perps.push(new Vector3(-t.z, 0, t.x));
  }
  const half = widthCells / 2;
  const depth = depthCells * ELEVATION_HEIGHT;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < waypoints.length; i += 1) {
    const c = waypoints[i]!;
    const p = perps[i]!;
    // outer-top, floor-outer, floor-inner, inner-top (mirrored so both banks slope in)
    const outerTop = new Vector3(c.x + p.x * half, c.y, c.z + p.z * half);
    const innerTop = new Vector3(c.x - p.x * half, c.y, c.z - p.z * half);
    // Floor is narrower than surface (batter): 60% of surface width.
    const floorOuter = new Vector3(c.x + p.x * half * 0.6, c.y - depth, c.z + p.z * half * 0.6);
    const floorInner = new Vector3(c.x - p.x * half * 0.6, c.y - depth, c.z - p.z * half * 0.6);
    positions.push(
      outerTop.x, outerTop.y, outerTop.z,
      floorOuter.x, floorOuter.y, floorOuter.z,
      floorInner.x, floorInner.y, floorInner.z,
      innerTop.x, innerTop.y, innerTop.z
    );
    for (let j = 0; j < 4; j += 1) {
      colors.push(color.r, color.g, color.b);
    }
  }

  const stride = 4;
  for (let i = 0; i + 1 < waypoints.length; i += 1) {
    const a = i * stride;
    const b = (i + 1) * stride;
    // Outer bank
    indices.push(a + 0, a + 1, b + 1);
    indices.push(a + 0, b + 1, b + 0);
    // Floor
    indices.push(a + 1, a + 2, b + 2);
    indices.push(a + 1, b + 2, b + 1);
    // Inner bank
    indices.push(a + 2, a + 3, b + 3);
    indices.push(a + 2, b + 3, b + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildWaterSurfaceGeometry(
  path: readonly { x: number; y: number }[],
  baseElevation: number,
  widthCells: number
): BufferGeometry {
  const waypoints = pathToVectors(path, baseElevation);
  const perps: Vector3[] = [];
  for (let i = 0; i < waypoints.length; i += 1) {
    const prev = (i > 0 ? waypoints[i - 1] : waypoints[i])!;
    const next = (i < waypoints.length - 1 ? waypoints[i + 1] : waypoints[i])!;
    const t = new Vector3().subVectors(next, prev);
    t.y = 0;
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    t.normalize();
    perps.push(new Vector3(-t.z, 0, t.x));
  }
  const half = widthCells / 2 * 0.9; // slightly inside the banks
  const positions: number[] = [];
  const indices: number[] = [];
  const dip = 0.03; // sit water slightly below ground
  for (let i = 0; i < waypoints.length; i += 1) {
    const c = waypoints[i]!;
    const p = perps[i]!;
    positions.push(
      c.x + p.x * half, c.y - dip, c.z + p.z * half,
      c.x - p.x * half, c.y - dip, c.z - p.z * half
    );
  }
  for (let i = 0; i + 1 < waypoints.length; i += 1) {
    const a = i * 2;
    const b = (i + 1) * 2;
    indices.push(a + 0, b + 0, b + 1);
    indices.push(a + 0, b + 1, a + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// --- Area feature (曲輪・水域) ----------------------------------------------

export function createAreaFeatureMesh(feature: AreaFeature): Mesh {
  // The trial only needs convex or near-convex baileys; ExtrudeGeometry gives
  // us a solid block with sloped or vertical sides at almost no cost.
  const shape = new Shape(
    feature.polygon.map((p) => new Vector2(p.x * CELL_SIZE, p.y * CELL_SIZE))
  );

  const isElevated = feature.elevation > 0;
  const extrudeDepth = isElevated ? feature.elevation * ELEVATION_HEIGHT : 0.02;

  const geometry = new ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    bevelEnabled: false,
    curveSegments: 4
  });
  // ExtrudeGeometry extrudes along +Z by default; rotate so the extrusion is
  // along world +Y and the shape lies on the XZ plane.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, extrudeDepth, 0);

  const color =
    feature.kind === "water"
      ? WATER_SURFACE
      : feature.kind === "courtyard"
        ? COURTYARD_TOP
        : BAILEY_TOP;

  const material = new MeshStandardMaterial({
    color,
    roughness: feature.kind === "water" ? 0.4 : 0.9,
    metalness: 0,
    transparent: feature.kind === "water",
    opacity: feature.kind === "water" ? 0.85 : 1,
    side: DoubleSide
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = feature.kind === "water" ? 1 : 0;
  return mesh;
}

function samplePathAtInterval(
  path: readonly { x: number; y: number }[],
  intervalCells: number
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let carry = 0;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let d = -carry;
    while (d < len) {
      if (d >= 0) {
        const t = d / len;
        out.push({ x: a.x + dx * t, y: a.y + dy * t });
      }
      d += intervalCells;
    }
    carry = len - (d - intervalCells);
  }
  const last = path[path.length - 1]!;
  const tail = out[out.length - 1];
  if (tail === undefined || Math.hypot(tail.x - last.x, tail.y - last.y) > 0.01) {
    out.push({ x: last.x, y: last.y });
  }
  return out;
}
