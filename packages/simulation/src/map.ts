import { MAP_HEIGHT, MAP_WIDTH, type CellCoord, type MapDecoration, type TerrainType } from "@asama/shared";
import { cardinalDirections } from "./types";
import type { TerrainCellState, WorldState } from "./types";

export function createInitialMap(): WorldState["map"] {
  const baseCells: TerrainCellState[] = [];

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      baseCells.push(createTerrainCell({ x, y }));
    }
  }

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    cells: baseCells.map((cell) => ({
      ...cell,
      assetId: connectedTerrainAssetId(baseCells, MAP_WIDTH, MAP_HEIGHT, cell)
    })),
    decorations: scatterDecorations(baseCells)
  };
}

export function scatterDecorations(cells: readonly TerrainCellState[]): MapDecoration[] {
  const decorations: MapDecoration[] = [];
  const terrainAtCell = (x: number, y: number): TerrainType | null => {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) {
      return null;
    }
    return cells[y * MAP_WIDTH + x]?.terrain ?? null;
  };
  const hash = (x: number, y: number, salt: number): number => {
    let value = (x * 374761393 + y * 668265263 + salt * 2246822519) >>> 0;
    value = (value ^ (value >>> 13)) >>> 0;
    value = Math.imul(value, 1274126177) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
  };

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const terrain = terrainAtCell(x, y);
      if (terrain !== "grass") {
        continue;
      }
      const neighbors = [terrainAtCell(x + 1, y), terrainAtCell(x - 1, y), terrainAtCell(x, y + 1), terrainAtCell(x, y - 1)];
      const nearWater = neighbors.includes("water");
      const nearStone = neighbors.includes("stone");

      if (nearWater) {
        const r = hash(x, y, 1);
        if (r < 0.3) {
          decorations.push({ assetId: "deco.reeds.1", position: { x, y } });
        } else if (r < 0.38) {
          // Bamboo clusters along waterways
          decorations.push({ assetId: "deco.bamboo.1", position: { x, y } });
        }
        continue;
      }

      if (nearStone) {
        if (hash(x, y, 2) < 0.22) {
          decorations.push({ assetId: "deco.rock.1", position: { x, y } });
        }
        continue;
      }

      // Low-frequency patch noise: 8×8 blocks define forest-patch character
      const px = Math.floor(x / 8);
      const py = Math.floor(y / 8);
      const patchDensity = hash(px, py, 10);
      const inPatch = patchDensity < 0.35;

      if (inPatch) {
        // Species bias is fixed per patch so the grove reads as one type
        const patchSpecies = hash(px, py, 11);
        const roll = hash(x, y, 3);
        if (roll < 0.13) {
          const pick = hash(x, y, 4);
          let assetId: string;
          if (patchSpecies < 0.33) {
            // Pine grove (松林)
            assetId = pick < 0.75 ? "deco.tree.pine.1" : "deco.tree.pine.2";
          } else if (patchSpecies < 0.66) {
            // Cedar grove (杉林)
            assetId = pick < 0.8 ? "deco.tree.cedar.1" : pick < 0.95 ? "deco.tree.pine.1" : "deco.tree.broadleaf.1";
          } else {
            // Broadleaf grove (広葉樹林)
            assetId = pick < 0.7 ? "deco.tree.broadleaf.1" : pick < 0.9 ? "deco.tree.cedar.1" : "deco.tree.pine.1";
          }
          decorations.push({ assetId, position: { x, y } });
        } else if (roll < 0.15) {
          decorations.push({ assetId: "deco.bush.1", position: { x, y } });
        }
      } else {
        // Sparse scatter outside forest patches
        const roll = hash(x, y, 3);
        if (roll < 0.018) {
          const pick = hash(x, y, 4);
          const assetId = pick < 0.35 ? "deco.tree.pine.1" : pick < 0.6 ? "deco.tree.cedar.1" : "deco.tree.broadleaf.1";
          decorations.push({ assetId, position: { x, y } });
        } else if (roll < 0.032) {
          decorations.push({ assetId: "deco.bush.1", position: { x, y } });
        } else if (roll < 0.068) {
          decorations.push({ assetId: "deco.weeds.1", position: { x, y } });
        }
      }
    }
  }
  return decorations;
}

export function createTerrainCell(coord: CellCoord): TerrainCellState {
  // River-bank corner cells become diagonal shore "transition" cells: they
  // count as water (impassable, dark underlay, no bank on the water side)
  // but carry a dedicated diagonal-split tile asset so the staircase corners
  // of the rasterised river read as smooth 45° bends.
  const corner = riverTransitionCorner(coord);
  const innerCorner = corner === null ? riverInnerTransitionCorner(coord) : null;
  const terrain = corner !== null ? "water" : terrainAt(coord);
  const passable = terrain !== "water" && terrain !== "stone";
  const movementCost = terrain === "dirt" ? 3 : 1;

  return {
    coord,
    terrain,
    movementCost,
    passable,
    assetId:
      corner !== null
        ? riverTransitionAssetId(corner, coord)
        : innerCorner !== null
          ? riverInnerTransitionAssetId(innerCorner, coord)
          : terrainAssetId(terrain, coord),
    // Procedural base map is flat; scenarios raise cells afterwards via
    // applyScenarioElevation (elevation-contract.md).
    elevation: 0,
    slope: null,
    elevationSkin: "cliff"
  };
}

/**
 * Southernmost allowed water reach (center + halfWidth) per column, as a
 * piecewise-linear "levee" line. Scenario content pins buildings to fixed
 * coordinates along the south bank (riverside-defense fences at y=43
 * x=28-44, walls at x=52 y>=44, water moats at x=58 y>=44), so the river --
 * including its impassable transition corners one row beyond the water --
 * must never reach them. Gentle ramp slopes keep bank steps <= 1 cell per
 * column so corners stay single transitions. The cap now spans the full map
 * width (x=0..127): the river runs edge to edge, sea-bound, instead of
 * petering out mid-map.
 */
function riverSouthCap(x: number): number {
  const points: ReadonlyArray<readonly [number, number]> = [
    [0, 44.9],
    [21, 44.9],
    [26, 41.9],
    [48, 41.9],
    [50, 42.9],
    [58, 42.9],
    [65, 44.9],
    [127, 44.9]
  ];
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, v0] = points[index]!;
    const [x1, v1] = points[index + 1]!;
    if (x >= x0 && x <= x1) {
      return v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
    }
  }
  return 44.9;
}

/**
 * Deterministic river course: a two-frequency meander (long swings + short
 * wiggles) with a slowly varying width, replacing the old single-sine course
 * that rasterised into a monotonous staircase.
 *
 * The x=59-64 "bridge reach" is pinned so the mvp-defense earth bridge at
 * (61,44) keeps a legal 3-row water span (rows 42-44 with plain-land
 * abutments), while (63,45) stays water so the wood bridge at (62,45)
 * resolves to y-orientation and degenerates to its seed cell exactly as it
 * did with the old course (its 4-row span is too long for an auto bridge).
 */
function riverCourse(x: number): { center: number; halfWidth: number } {
  if (x === 59) return { center: 42.5, halfWidth: 1.2 };
  if (x >= 60 && x <= 62) return { center: 43.0, halfWidth: 1.3 };
  if (x === 63) return { center: 44.0, halfWidth: 1.2 };
  if (x === 64) return { center: 43.5, halfWidth: 1.0 };
  const halfWidth = 1.55 + 0.5 * Math.sin(x / 13 + 0.8);
  let center = 41.0 + 3.1 * Math.sin(x / 10.5 + 0.9) + 1.9 * Math.sin(x / 5.1 + 2.6);
  center = Math.min(center, riverSouthCap(x) - halfWidth);
  center = Math.max(center, 33.5 + halfWidth);
  return { center, halfWidth };
}

function isRiverWater(x: number, y: number): boolean {
  // No west/east cut-off: the river spans the full map width and its course
  // function extends smoothly past the borders, so edge columns see an
  // off-map water continuation (no spurious bank corners at x=0 / x=127).
  const { center, halfWidth } = riverCourse(x);
  return Math.abs(y - center) <= halfWidth;
}

export type RiverTransitionCorner = "ne" | "es" | "sw" | "wn";

/**
 * A grass cell whose orthogonal neighbours include exactly one perpendicular
 * pair of river-water cells is an outer corner of the river staircase; it is
 * converted into a diagonal transition cell. Detection uses only the BASE
 * river function (never other transition cells), so conversions cannot chain
 * outward.
 */
export function riverTransitionCorner(coord: CellCoord): RiverTransitionCorner | null {
  if (terrainAt(coord) !== "grass") {
    return null;
  }
  const n = isRiverWater(coord.x, coord.y - 1);
  const e = isRiverWater(coord.x + 1, coord.y);
  const s = isRiverWater(coord.x, coord.y + 1);
  const w = isRiverWater(coord.x - 1, coord.y);
  if (n && e && !s && !w) return "ne";
  if (e && s && !w && !n) return "es";
  if (s && w && !n && !e) return "sw";
  if (w && n && !e && !s) return "wn";
  return null;
}

export function riverTransitionAssetId(corner: RiverTransitionCorner, coord: CellCoord): string {
  let h = (coord.x * 374761393 + coord.y * 668265263 + 52501) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  const pick = h % 3;
  const base = `terrain.water.transition.${corner}`;
  return pick === 0 ? base : `${base}.v${pick}`;
}

/**
 * A river-water cell whose orthogonal neighbours include exactly one
 * perpendicular pair of non-water cells is an inner (concave) corner of the
 * river staircase: without a dedicated tile, its bank turns a hard 90°
 * against the neighbouring outer transition's diagonal (or against two
 * straight connected banks). It gets a wedge tile instead -- mostly water,
 * with a small grass/bank wedge chamfering the land corner at 45° so the
 * bank contour reads as a continuous 45° line together with the adjacent
 * outer transition diagonals.
 *
 * The corner suffix names the two LAND sides (mirroring the outer tiles,
 * which name their two WATER sides).
 *
 * When the land neighbour on the HORIZONTAL side of the pair (N/S) is
 * itself an outer transition corner, the cell is excluded: on the 45°
 * stretches of the course, consecutive outer diagonals already meet
 * end-to-end exactly at this cell's corner point and form a continuous
 * line, so a wedge here would protrude into open water and scallop it. The
 * check stays base-function-only (riverTransitionCorner itself derives from
 * the base course), so classification cannot chain outward. The vertical
 * (E/W) pair neighbour is regularly an outer transition -- the wedge is
 * shaped to continue that tile's diagonal (see build_water_transition_
 * inner_tile in the Blender library).
 */
export function riverInnerTransitionCorner(coord: CellCoord): RiverTransitionCorner | null {
  if (!isRiverWater(coord.x, coord.y)) {
    return null;
  }
  const n = !isRiverWater(coord.x, coord.y - 1);
  const e = !isRiverWater(coord.x + 1, coord.y);
  const s = !isRiverWater(coord.x, coord.y + 1);
  const w = !isRiverWater(coord.x - 1, coord.y);
  let corner: RiverTransitionCorner | null = null;
  if (n && e && !s && !w) corner = "ne";
  else if (e && s && !w && !n) corner = "es";
  else if (s && w && !n && !e) corner = "sw";
  else if (w && n && !e && !s) corner = "wn";
  if (corner === null) {
    return null;
  }
  const horizontalDy = corner === "ne" || corner === "wn" ? -1 : 1;
  if (riverTransitionCorner({ x: coord.x, y: coord.y + horizontalDy }) !== null) {
    return null;
  }
  return corner;
}

export function riverInnerTransitionAssetId(corner: RiverTransitionCorner, coord: CellCoord): string {
  let h = (coord.x * 374761393 + coord.y * 668265263 + 60103) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  const pick = h % 3;
  const base = `terrain.water.transition.inner.${corner}`;
  return pick === 0 ? base : `${base}.v${pick}`;
}

function terrainAt(coord: CellCoord): TerrainType {
  if (isRiverWater(coord.x, coord.y)) {
    return "water";
  }

  const ridgeDistance = Math.abs(coord.x - 84 - Math.round(Math.cos(coord.y / 11) * 5));
  if (ridgeDistance <= 1 && coord.y > 20 && coord.y < 104) {
    return "stone";
  }

  // Dirt appears as coherent zones only; the old regular per-cell sprinkle
  // read as polka dots on the painterly terrain.
  if (coord.x > 46 && coord.x < 72 && coord.y > 72 && coord.y < 86) {
    return "dirt";
  }

  return "grass";
}

function terrainAssetId(terrain: TerrainType, coord: CellCoord): string {
  if (terrain === "grass" && (coord.x * 17 + coord.y * 31) % 7 === 0) {
    return "terrain.grass.variant.1";
  }

  if (terrain === "dirt" && (coord.x + coord.y) % 3 === 0) {
    return "terrain.dirt.variant.1";
  }

  return `terrain.${terrain}.base`;
}

export function connectedTerrainAssetId(
  cells: readonly TerrainCellState[],
  width: number,
  height: number,
  cell: TerrainCellState
): string {
  // River transition corners keep their dedicated diagonal tile: the NESW
  // mask cannot express "half water along the diagonal".
  if (cell.terrain === "water" && cell.assetId.startsWith("terrain.water.transition.")) {
    return cell.assetId;
  }

  const mask = cardinalDirections
    .map((direction) => {
      const x = cell.coord.x + direction.x;
      const y = cell.coord.y + direction.y;
      if (x < 0 || y < 0 || x >= width || y >= height) {
        return "0";
      }

      return cells[y * width + x]?.terrain === cell.terrain ? "1" : "0";
    })
    .join("");

  // Interior tiles use the world-anchored macro field (continuous noise
  // across tiles) so large surfaces stop reading as a 64px lattice. Stone
  // keeps the connected sprites (no macro set rendered for it).
  if (mask === "1111" && cell.terrain !== "stone") {
    const bx = cell.coord.x >> 2;
    const by = cell.coord.y >> 2;
    let h = (bx * 374761393 + by * 668265263 + 1013904223) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    const variant = h % 2;
    return `terrain.${cell.terrain}.macro.v${variant}.${cell.coord.x % 4}.${cell.coord.y % 4}`;
  }

  // Water shores get wavy-bank variants so straight runs don't repeat the
  // same wave every 64px.
  if (cell.terrain === "water") {
    let h = (cell.coord.x * 374761393 + cell.coord.y * 668265263 + 40503) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    const pick = h % 3;
    return pick === 0 ? `terrain.water.connected.${mask}` : `terrain.water.connected.${mask}.v${pick}`;
  }

  return `terrain.${cell.terrain}.connected.${mask}`;
}

export function getCell(world: WorldState, coord: CellCoord): TerrainCellState {
  return world.map.cells[coord.y * world.map.width + coord.x] ?? createTerrainCell(coord);
}
