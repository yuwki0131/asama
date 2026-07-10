import { MAX_ELEVATION, type CellCoord, type SlopeDirection, type TerrainCellSnapshot } from "@asama/shared";
import { cellToWorld, screenToWorld, TILE_HEIGHT, TILE_WIDTH, type CameraState } from "./camera";

/**
 * Renderer-side elevation helpers (docs/10_development/elevation-contract.md).
 *
 * One elevation level lifts a cell's drawing 40 screen px upward. Elevation
 * NEVER participates in depth sorting — with the fixed isometric camera a
 * lifted cell only slides up-screen; painter's order stays cell-coordinate
 * based everywhere.
 */
export const ELEVATION_PIXELS_PER_LEVEL = 40;

/** The subset of `WorldSnapshot["map"]` the elevation helpers need. */
export interface ElevationMapLike {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly TerrainCellSnapshot[];
}

export function cellAt(map: ElevationMapLike, x: number, y: number): TerrainCellSnapshot | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return null;
  }
  return map.cells[y * map.width + x] ?? null;
}

/** Y offset (≤ 0) at which the cell's ground tile is drawn. Slope tiles are
 *  anchored at their LOW side, like the flat tile of the same elevation. */
export function tileOffsetY(cell: Pick<TerrainCellSnapshot, "elevation"> | null): number {
  // `|| 0` normalizes the -0 produced by negating a zero elevation.
  return cell === null ? 0 : -(cell.elevation * ELEVATION_PIXELS_PER_LEVEL) || 0;
}

/** Y offset of the ground tile for a cell coordinate (0 outside the map). */
export function tileOffsetYAt(map: ElevationMapLike | null, cell: CellCoord): number {
  if (map === null) {
    return 0;
  }
  return tileOffsetY(cellAt(map, cell.x, cell.y));
}

/**
 * Y offset (≤ 0) of the WALKING SURFACE of a cell: units standing on a slope
 * sit at the mid height -(elevation + 0.5) * 40 (elevation-contract.md §5).
 */
export function surfaceOffsetYAt(map: ElevationMapLike | null, cell: CellCoord): number {
  if (map === null) {
    return 0;
  }
  const terrain = cellAt(map, cell.x, cell.y);
  if (terrain === null) {
    return 0;
  }
  const level = terrain.elevation + (terrain.slope !== null ? 0.5 : 0);
  return -(level * ELEVATION_PIXELS_PER_LEVEL) || 0;
}

const OPPOSITE: Record<SlopeDirection, SlopeDirection> = { N: "S", E: "W", S: "N", W: "E" };

/**
 * Height of the cell surface at the edge facing `direction` (mirror of the
 * sim's `edgeHeight`): flat cells expose `elevation` on every edge, slope
 * cells expose `elevation + 1` uphill, `elevation` downhill and `null` on
 * their two side edges (those sides are cliffs).
 */
export function edgeSurfaceHeight(
  cell: Pick<TerrainCellSnapshot, "elevation" | "slope">,
  direction: SlopeDirection
): number | null {
  if (cell.slope === null) {
    return cell.elevation;
  }
  if (cell.slope === direction) {
    return cell.elevation + 1;
  }
  if (cell.slope === OPPOSITE[direction]) {
    return cell.elevation;
  }
  return null;
}

/** A vertical cliff strip on the S or E edge of a cell (owned by the HIGH
 *  cell — the fixed camera only ever sees the S and E faces). Heights are in
 *  elevation levels; `topA`/`topB` allow slanted tops for slope side walls.
 *  Vertex A is the diamond's W corner for the S edge and the S corner for the
 *  E edge; vertex B is the S corner / E corner respectively. */
export interface CliffFace {
  readonly edge: "s" | "e";
  /** Top surface level at the two ends of the edge (equal unless slanted). */
  readonly topA: number;
  readonly topB: number;
  /** Bottom level the face drops to (the neighbour's surface, 0 off-map). */
  readonly bottom: number;
  /** Sprite id per the contract naming; null for slanted slope side walls
   *  (those use `terrain.slope.<skin>.<dir>.side.<s|e>`). */
  readonly assetId: string;
}

export interface CellCliffInfo {
  readonly faces: readonly CliffFace[];
  /** Convex SE corner sprite id when both S and E faces exist, else null. */
  readonly cornerAssetId: string | null;
}

const EMPTY_CLIFF_INFO: CellCliffInfo = { faces: [], cornerAssetId: null };

/**
 * Cliff faces to draw for a cell: the S/E edges where this cell's surface is
 * higher than the neighbour's facing edge. Slope up/downhill edges match
 * their neighbours by scenario validation, so no face appears there; slope
 * side edges produce slanted side walls named per the contract.
 */
export function cliffInfoFor(map: ElevationMapLike, cell: TerrainCellSnapshot): CellCliffInfo {
  if (cell.elevation === 0 && cell.slope === null) {
    return EMPTY_CLIFF_INFO;
  }

  const faces: CliffFace[] = [];
  const skin = cell.elevationSkin;
  let flatFaceHeights: { s?: number; e?: number } = {};

  for (const edge of ["s", "e"] as const) {
    const direction: SlopeDirection = edge === "s" ? "S" : "E";
    const neighbour = cellAt(map, cell.coord.x + (edge === "e" ? 1 : 0), cell.coord.y + (edge === "s" ? 1 : 0));
    const neighbourEdge = neighbour === null ? 0 : edgeSurfaceHeight(neighbour, OPPOSITE[direction]);
    // A neighbour's slope SIDE edge facing us is a cliff wall of unknown
    // profile; fall back to the neighbour's base elevation (the slope tile,
    // drawn later in painter's order, covers any overdraw).
    const bottom = neighbourEdge ?? neighbour?.elevation ?? 0;
    const top = edgeSurfaceHeight(cell, direction);

    if (top !== null) {
      // Flat (or slope axis) edge: plain face of height top - bottom.
      const drop = top - bottom;
      if (drop >= 1) {
        const h = Math.min(drop, MAX_ELEVATION);
        faces.push({ edge, topA: top, topB: top, bottom, assetId: `terrain.${skin}.face.${edge}.h${h}` });
        flatFaceHeights = { ...flatFaceHeights, [edge]: h };
      }
      continue;
    }

    // Slope side edge: slanted wall from `elevation` to `elevation + 1`.
    // The two lifted diamond corners are the ones on the uphill edge, so the
    // side wall's top is high at the corner shared with the uphill edge and
    // low at the corner shared with the downhill edge.
    const slope = cell.slope as SlopeDirection;
    const low = cell.elevation;
    const high = cell.elevation + 1;
    let topA: number;
    let topB: number;
    if (edge === "s") {
      // S edge: W corner (A) → S corner (B). Slope E lifts {S, E} corners;
      // slope W lifts {W, N}.
      topA = slope === "E" ? low : high;
      topB = slope === "E" ? high : low;
    } else {
      // E edge: S corner (A) → E corner (B). Slope N lifts {N, E} corners;
      // slope S lifts {W, S}.
      topA = slope === "N" ? low : high;
      topB = slope === "N" ? high : low;
    }
    if (Math.max(topA, topB) > bottom) {
      faces.push({
        edge,
        topA,
        topB,
        bottom: Math.min(bottom, low),
        assetId: `terrain.slope.${skin}.${slope.toLowerCase()}.side.${edge}`
      });
    }
  }

  const cornerAssetId =
    flatFaceHeights.s !== undefined && flatFaceHeights.e !== undefined
      ? `terrain.${skin}.corner.se.h${Math.min(flatFaceHeights.s, flatFaceHeights.e)}`
      : null;

  return faces.length === 0 ? EMPTY_CLIFF_INFO : { faces, cornerAssetId };
}

// Memoized "does this map have any elevated/slope cell" flag, keyed by the
// cells array identity (stable for the lifetime of a boot — the client caches
// map cells across snapshots).
const mapElevationFlags = new WeakMap<readonly TerrainCellSnapshot[], boolean>();

export function mapHasElevation(map: ElevationMapLike): boolean {
  const cached = mapElevationFlags.get(map.cells);
  if (cached !== undefined) {
    return cached;
  }
  const result = map.cells.some((cell) => cell.elevation > 0 || cell.slope !== null);
  mapElevationFlags.set(map.cells, result);
  return result;
}

/**
 * Elevation-aware screen → cell inverse. A cell drawn at elevation e is
 * lifted 40e px, so the inverse tries each level from the highest down: the
 * click point is projected onto the "lifted" grid of that level and accepted
 * when the cell found there really is drawn at that level (slope cells span
 * two levels and accept both). The first hit wins — exactly the tile whose
 * lifted diamond is painted on top at that point. Falls back to the flat
 * inverse (level 0 grid) when nothing matches, preserving legacy behaviour
 * for off-map clicks and cliff-wall pixels.
 */
export function pickCellAtScreenPoint(
  screenX: number,
  screenY: number,
  camera: CameraState,
  map: ElevationMapLike | null
): CellCoord {
  const world = screenToWorld(screenX, screenY, camera);
  const flat: CellCoord = {
    x: Math.round(world.y / TILE_HEIGHT + world.x / TILE_WIDTH),
    y: Math.round(world.y / TILE_HEIGHT - world.x / TILE_WIDTH)
  };
  if (map === null || !mapHasElevation(map)) {
    return flat;
  }

  for (let level = MAX_ELEVATION; level >= 0; level -= 1) {
    const liftedY = world.y + level * ELEVATION_PIXELS_PER_LEVEL;
    const x = Math.round(liftedY / TILE_HEIGHT + world.x / TILE_WIDTH);
    const y = Math.round(liftedY / TILE_HEIGHT - world.x / TILE_WIDTH);
    const candidate = cellAt(map, x, y);
    if (candidate === null) {
      continue;
    }
    // Skip cliff terrain cells: they are visual-only cliff face holders and
    // must not be returned as interactive pick targets.
    if (candidate.terrain === "cliff") {
      continue;
    }
    const matches =
      candidate.slope !== null
        ? candidate.elevation === level || candidate.elevation + 1 === level
        : candidate.elevation === level;
    if (matches) {
      // Diamond-in check: accept only when the screen point projects inside
      // the cell's lifted isometric diamond.  Points in the cliff face area
      // (below the lifted diamond) fall through to the next lower level.
      const cw = cellToWorld({ x, y });
      const dxw = world.x - cw.x;
      const dyw = world.y - (cw.y - level * ELEVATION_PIXELS_PER_LEVEL);
      const inDiamond = Math.abs(dxw / (TILE_WIDTH / 2)) + Math.abs(dyw / (TILE_HEIGHT / 2)) <= 1.1;
      if (inDiamond) {
        return { x, y };
      }
      // Click is in the cliff face region below this cell's lifted diamond;
      // continue searching at lower elevation levels.
    }
  }

  return flat;
}
