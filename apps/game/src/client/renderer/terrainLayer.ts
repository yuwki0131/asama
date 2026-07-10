import { Container, Graphics } from "pixi.js";
import { MAX_ELEVATION } from "@asama/shared";
import type { ElevationSkin, TerrainCellSnapshot, WorldSnapshot } from "@asama/shared";
import { clearLayer, createSpriteFromCandidates, type LoadedAsset } from "./assets";
import { cellToWorld, type CameraState, TILE_HEIGHT, TILE_WIDTH } from "./camera";
import {
  cellAt,
  cliffInfoFor,
  ELEVATION_PIXELS_PER_LEVEL,
  slopeAssetSkin,
  tileOffsetY,
  type ElevationMapLike,
  type CliffFace
} from "./elevation";

// Underlay diamonds have exact tile footprint — no padding — to avoid
// sub-pixel overlap between the single global underlay Graphics and the
// chunk-local sprite layers.  The previous 0.5 px padding caused faint
// bright seam lines where chunk boundaries crossed water tiles.
const TERRAIN_UNDERLAY_PADDING = 0;
const TERRAIN_CHUNK_CELLS = 16;

// Fallback colors for cliff walls / slope ramps while the P4c tile assets are
// in production. Deliberately NOT the gold missing-asset color: cliffs read
// as dark rock, ishigaki as grey-brown stone. The E face is shaded darker
// than the S face so terraces keep a readable light direction.
const CLIFF_FALLBACK_COLORS: Record<ElevationSkin, { s: number; e: number; slope: number }> = {
  cliff: { s: 0x4f4a43, e: 0x3f3b36, slope: 0x77694c },
  ishigaki: { s: 0x7e7566, e: 0x685f52, slope: 0x8d8578 }
};

/** Sideways/downward bleed (px) of the opaque backdrop behind cliff face
 *  sprites; covers sub-pixel AA seams between adjacent faces, at SE corner
 *  junctions and against the low-side floor tile. */
const CLIFF_BACKDROP_BLEED = 2;

interface TerrainChunkBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function terrainKeyFor(snapshot: WorldSnapshot, assets: ReadonlyMap<string, LoadedAsset>): string {
  const firstCell = snapshot.map.cells[0]?.coord;
  const lastCell = snapshot.map.cells[snapshot.map.cells.length - 1]?.coord;
  // terrainRevision increments on player terrain modifications so the chunk
  // cache is rebuilt to reflect new elevation / slope data.
  const rev = snapshot.terrainRevision ?? 0;
  const cliffCount = snapshot.map.cells.filter(c => c.terrain === "cliff").length;
  return `${snapshot.map.width}:${snapshot.map.height}:${assets.size}:${snapshot.map.cells.length}:${firstCell?.x ?? 0},${firstCell?.y ?? 0}:${lastCell?.x ?? 0},${lastCell?.y ?? 0}:r${rev}:${cliffCount}`;
}

export function buildTerrainChunks(
  terrainLayer: Container,
  snapshot: WorldSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  clearLayer(terrainLayer);

  // Phase 1 — collect cells per chunk.
  // Sprites must be rendered in isometric depth order (ascending x+y) so that
  // "closer" tiles paint over "farther" ones. We accumulate cells first, sort
  // within each chunk, then flush sprites in the correct order.
  const chunkMap = new Map<
    string,
    { cx: number; cy: number; cells: TerrainCellSnapshot[]; bounds: TerrainChunkBounds }
  >();

  for (const cell of snapshot.map.cells) {
    const cx = Math.floor(cell.coord.x / TERRAIN_CHUNK_CELLS);
    const cy = Math.floor(cell.coord.y / TERRAIN_CHUNK_CELLS);
    const key = `${cx}:${cy}`;
    let entry = chunkMap.get(key);
    if (entry === undefined) {
      entry = { cx, cy, cells: [], bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity } };
      chunkMap.set(key, entry);
    }
    entry.cells.push(cell);
    const world = cellToWorld(cell.coord);
    // Elevated cells draw their tile up to 40*elevation px higher; include
    // that lift in the culling bounds so hilltops don't vanish at the screen
    // edge.
    const lift = cell.elevation * ELEVATION_PIXELS_PER_LEVEL;
    entry.bounds = {
      minX: Math.min(entry.bounds.minX, world.x - TILE_WIDTH),
      minY: Math.min(entry.bounds.minY, world.y - TILE_HEIGHT * 2 - lift),
      maxX: Math.max(entry.bounds.maxX, world.x + TILE_WIDTH),
      maxY: Math.max(entry.bounds.maxY, world.y + TILE_HEIGHT * 2)
    };
  }

  // Phase 2 — build a single underlay Graphics that covers the whole map.
  // Using one Graphics per chunk caused visible seam lines at chunk boundaries:
  // each Graphics anti-aliases its own edges independently, and the 0.5 px
  // "padding" overlap between neighbouring chunks produced bright artifacts
  // where water tile bleed crossed a chunk boundary.  A single Graphics has no
  // inter-chunk edges and therefore no seam.
  const underlayGraphics = new Graphics();
  const waterCells = new Set<string>();
  for (const cell of snapshot.map.cells) {
    if (cell.terrain === "water") {
      waterCells.add(`${cell.coord.x}:${cell.coord.y}`);
    }
  }
  const touchesWater = (x: number, y: number): boolean =>
    waterCells.has(`${x}:${y}`) ||
    waterCells.has(`${x + 1}:${y}`) || waterCells.has(`${x - 1}:${y}`) ||
    waterCells.has(`${x}:${y + 1}`) || waterCells.has(`${x}:${y - 1}`);
  for (const { cells } of chunkMap.values()) {
    for (const cell of cells) {
      addTerrainUnderlay(underlayGraphics, cell, touchesWater(cell.coord.x, cell.coord.y));
    }
  }
  // The underlay sits below all sprite chunks and is never culled.
  terrainLayer.addChild(underlayGraphics);

  // Phase 3 — emit sprite chunks sorted by isometric depth (ascending cx+cy).
  // Chunks with a smaller cx+cy value are visually farther from the camera and
  // must be painted first.  Within each chunk, cells are also sorted by x+y
  // depth for the same reason.
  const sortedChunks = [...chunkMap.values()].sort(
    (a, b) => (a.cx + a.cy) - (b.cx + b.cy)
  );

  for (const { cells, bounds } of sortedChunks) {
    // Sort cells by isometric depth within the chunk.
    cells.sort((a, b) => (a.coord.x + a.coord.y) - (b.coord.x + b.coord.y));

    const container = new Container();
    for (const cell of cells) {
      // Every cell draws its ground tile here — including cliff cells, whose
      // floor (the low-side terrain, original assetId preserved by the sim's
      // insertCliffCells) must read as continuous lowland ground. The cliff
      // FACES themselves are depth-sorted into the retained scene layer
      // (sceneLayer.ts) so trees/buildings in front of a cliff paint over it.
      addTerrainSprite(container, cell, snapshot.map, assets);
    }
    (container as Container & { __terrainBounds?: TerrainChunkBounds }).__terrainBounds = bounds;
    terrainLayer.addChild(container);
  }

  // Phase 4 — upper cap lines: NW and NE edges of elevated cells whose
  // uphill neighbours are lower (or absent). In isometric view these edges
  // form the top rim of a terrace; without a visible line they blend into
  // the tile behind and the step is hard to read.
  //
  // Isometric neighbour mapping for a cell at (cx, cy):
  //   NW (screen upper-left)  = (cx-1, cy)   — world shifts (-32, -16)
  //   NE (screen upper-right) = (cx, cy-1)   — world shifts (+32, -16)
  //
  // Tile diamond vertices (TILE_WIDTH=64, TILE_HEIGHT=32) relative to the
  // cell's world center with elevation offset applied:
  //   Top/N corner = (screenX,        screenY - TILE_HEIGHT/2)
  //   Left/W corner = (screenX - TILE_WIDTH/2, screenY)
  //   Right/E corner = (screenX + TILE_WIDTH/2, screenY)
  const capGraphics = new Graphics();
  for (const cell of snapshot.map.cells) {
    if (cell.elevation <= 0) {
      continue;
    }
    const point = cellToWorld(cell.coord);
    const offsetY = tileOffsetY(cell);
    const screenX = point.x;
    const screenY = point.y + offsetY;

    // NW cap line: top → left diamond vertex.
    const nwNeighbour = cellAt(snapshot.map, cell.coord.x - 1, cell.coord.y);
    if ((nwNeighbour?.elevation ?? 0) < cell.elevation) {
      capGraphics
        .moveTo(screenX, screenY - TILE_HEIGHT / 2)
        .lineTo(screenX - TILE_WIDTH / 2, screenY)
        .stroke({ color: 0x6b5a42, width: 3, alpha: 0.7, cap: "round" });
    }

    // NE cap line: top → right diamond vertex.
    const neNeighbour = cellAt(snapshot.map, cell.coord.x, cell.coord.y - 1);
    if ((neNeighbour?.elevation ?? 0) < cell.elevation) {
      capGraphics
        .moveTo(screenX, screenY - TILE_HEIGHT / 2)
        .lineTo(screenX + TILE_WIDTH / 2, screenY)
        .stroke({ color: 0x6b5a42, width: 3, alpha: 0.7, cap: "round" });
    }
  }
  terrainLayer.addChild(capGraphics);
}

/**
 * Draws a dedicated cliff terrain cell's face/corner sprites into `layer`.
 *
 * Called from the retained scene layer (sceneLayer.ts) where the cliff cell
 * participates in the isometric painter's sort with its OWN cell coordinate
 * as the depth key: buildings on the high side (smaller x+y) paint first so
 * the face covers their protruding bases, while trees on the low side
 * (larger x+y) paint after and correctly appear in front of the wall.
 */
export function addCliffCellSprites(
  layer: Container,
  cell: TerrainCellSnapshot,
  map: ElevationMapLike,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  if (cell.cliffFace === undefined || cell.cliffHeight === undefined) return;

  const skin = cell.elevationSkin;
  const h = Math.min(cell.cliffHeight, MAX_ELEVATION);

  // Determine the high cell position based on cliffFace direction.
  let highX: number;
  let highY: number;
  if (cell.cliffFace === "s") {
    highX = cell.coord.x;
    highY = cell.coord.y - 1;
  } else if (cell.cliffFace === "e") {
    highX = cell.coord.x - 1;
    highY = cell.coord.y;
  } else {
    // "se" corner: high cell is diagonally up-left.
    highX = cell.coord.x - 1;
    highY = cell.coord.y - 1;
  }

  const highCell = cellAt(map, highX, highY);
  if (highCell === null) return;

  const highPoint = cellToWorld({ x: highX, y: highY });
  const anchorY = highPoint.y + tileOffsetY(highCell);
  const topElev = highCell.elevation;
  const bottomElev = cell.elevation;

  if (cell.cliffFace === "se") {
    // SE corner: individual S and E cliff cells draw the faces;
    // this cell only draws the convex corner sprite.
    const cornerAssetId = `terrain.${skin}.corner.se.h${h}`;
    const cornerAsset = assets.get(cornerAssetId);
    if (cornerAsset !== undefined) {
      const sprite = createSpriteFromCandidates([cornerAssetId], assets);
      sprite.position.set(highPoint.x, anchorY);
      layer.addChild(sprite);
    }
    return;
  }

  // "s" or "e" face.
  const edge = cell.cliffFace;
  const face: CliffFace = {
    edge,
    topA: topElev,
    topB: topElev,
    bottom: bottomElev,
    assetId: `terrain.${skin}.face.${edge}.h${h}`
  };

  // Always draw the fallback polygon first as an opaque stone-coloured
  // backdrop: cliff sprites have transparent anti-aliased edge pixels that
  // would otherwise show the dark underlay / canvas as gaps along the cliff
  // bottom and at the seams between neighbouring faces. The backdrop bleeds
  // a couple of px sideways and downward (same trick as the river bank
  // strips) so sub-pixel AA seams between adjacent cliff cells, at the SE
  // corner junction and against the low-side floor tile stay covered.
  const backdrop = new Graphics();
  drawFallbackFace(backdrop, highPoint, skin, face, CLIFF_BACKDROP_BLEED);
  layer.addChild(backdrop);

  const asset = assets.get(face.assetId);
  if (asset !== undefined) {
    const sprite = createSpriteFromCandidates([face.assetId], assets);
    sprite.position.set(highPoint.x, anchorY);
    layer.addChild(sprite);
  }
}

export function updateTerrainChunkVisibility(
  terrainLayer: Container,
  camera: CameraState,
  width: number,
  height: number
): void {
  for (const child of terrainLayer.children) {
    const bounds = (child as Container & { __terrainBounds?: TerrainChunkBounds }).__terrainBounds;
    // The global underlay Graphics has no bounds tag — always keep it visible.
    if (bounds === undefined) {
      continue;
    }
    const left = bounds.minX * camera.zoom + camera.x;
    const right = bounds.maxX * camera.zoom + camera.x;
    const top = bounds.minY * camera.zoom + camera.y;
    const bottom = bounds.maxY * camera.zoom + camera.y;
    child.visible = right >= 0 && left <= width && bottom >= 0 && top <= height;
  }
}

function addTerrainSprite(
  layer: Container,
  cell: TerrainCellSnapshot,
  map: ElevationMapLike,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const point = cellToWorld(cell.coord);
  const offsetY = tileOffsetY(cell);

  if (cell.slope !== null) {
    addSlopeTile(layer, cell, map, assets);
    return;
  }

  const sprite = createSpriteFromCandidates([cell.assetId, terrainFallbackAssetId(cell)], assets);
  sprite.position.set(point.x, point.y + offsetY);
  layer.addChild(sprite);
}

/**
 * Slope cells draw the contract's `terrain.slope.<skin>.<dir>` tile anchored
 * like a flat tile of the LOW side. Until the P4c assets land, the fallback
 * draws the base terrain tile plus an opaque ramp polygon: the tile diamond
 * with the two uphill corners lifted one level.
 *
 * The slope's two SIDE edges are cliff walls with a slanted top
 * (`terrain.slope.<skin>.<dir>.side.<s|e>`); they are not covered by the
 * dedicated cliff cells (no elevation drop at the base level) so they are
 * drawn here, from the slope cell itself.
 */
function addSlopeTile(
  layer: Container,
  cell: TerrainCellSnapshot,
  map: ElevationMapLike,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const point = cellToWorld(cell.coord);
  const offsetY = tileOffsetY(cell);
  const slope = cell.slope;
  if (slope === null) {
    return;
  }

  // Slanted side walls first — they hang below/behind the ramp surface.
  addSlopeSideWalls(layer, cell, map, assets);

  const slopeAssetId = `terrain.slope.${slopeAssetSkin(cell.elevationSkin)}.${slope.toLowerCase()}`;
  const asset = assets.get(slopeAssetId);
  if (asset !== undefined) {
    const sprite = createSpriteFromCandidates([slopeAssetId], assets);
    sprite.position.set(point.x, point.y + offsetY);
    layer.addChild(sprite);
    return;
  }

  // Fallback: base terrain under the ramp (fills the low-side sliver), then
  // the ramp polygon.
  const base = createSpriteFromCandidates([cell.assetId, terrainFallbackAssetId(cell)], assets);
  base.position.set(point.x, point.y + offsetY);
  layer.addChild(base);

  const lifted = liftedCorners(slope);
  const lift = -ELEVATION_PIXELS_PER_LEVEL;
  const corners = {
    n: { x: point.x, y: point.y - TILE_HEIGHT / 2 + offsetY + (lifted.has("n") ? lift : 0) },
    e: { x: point.x + TILE_WIDTH / 2, y: point.y + offsetY + (lifted.has("e") ? lift : 0) },
    s: { x: point.x, y: point.y + TILE_HEIGHT / 2 + offsetY + (lifted.has("s") ? lift : 0) },
    w: { x: point.x - TILE_WIDTH / 2, y: point.y + offsetY + (lifted.has("w") ? lift : 0) }
  };
  const ramp = new Graphics();
  ramp
    .poly([corners.n.x, corners.n.y, corners.e.x, corners.e.y, corners.s.x, corners.s.y, corners.w.x, corners.w.y])
    .fill({ color: CLIFF_FALLBACK_COLORS[cell.elevationSkin].slope, alpha: 1 })
    .stroke({ color: 0x2c2721, alpha: 0.5, width: 1 });
  layer.addChild(ramp);
}

/**
 * Slanted side walls of a slope cell (the S/E edges whose surface height is
 * undefined — `cliffInfoFor` returns them with topA !== topB). Flat drops on
 * the slope's up/downhill axis are owned by dedicated cliff cells instead
 * and are filtered out here to avoid double drawing.
 */
function addSlopeSideWalls(
  layer: Container,
  cell: TerrainCellSnapshot,
  map: ElevationMapLike,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const point = cellToWorld(cell.coord);
  const anchorY = point.y + tileOffsetY(cell);
  const sideFaces = cliffInfoFor(map, cell).faces.filter((face) => face.topA !== face.topB);

  for (const face of sideFaces) {
    const asset = assets.get(face.assetId);
    if (asset !== undefined) {
      const sprite = createSpriteFromCandidates([face.assetId], assets);
      sprite.position.set(point.x, anchorY);
      layer.addChild(sprite);
      continue;
    }
    const fallback = new Graphics();
    drawFallbackFace(fallback, point, cell.elevationSkin, face);
    layer.addChild(fallback);
  }
}

/** Diamond corners lifted one extra level on a slope tile: the two corners of
 *  the uphill edge (N edge = n+e corners, E edge = s+e, S = w+s, W = w+n). */
function liftedCorners(slope: "N" | "E" | "S" | "W"): Set<"n" | "e" | "s" | "w"> {
  switch (slope) {
    case "N":
      return new Set(["n", "e"]);
    case "E":
      return new Set(["s", "e"]);
    case "S":
      return new Set(["w", "s"]);
    case "W":
      return new Set(["w", "n"]);
  }
}

/** Quad from the face's top edge (at the lifted tile edge) straight down to
 *  the neighbour's surface level. Vertex A/B order matches CliffFace.
 *  `bleed` extends the quad along the edge direction (both ends) and below
 *  its bottom edge, tucking backdrop polygons under the neighbouring faces
 *  and the low-side floor tile so AA seams never expose the dark underlay. */
function drawFallbackFace(
  graphics: Graphics,
  point: { x: number; y: number },
  skin: ElevationSkin,
  face: CliffFace,
  bleed = 0
): void {
  const px = ELEVATION_PIXELS_PER_LEVEL;
  // Diamond edge vertices at ground (elevation 0) height.
  let vertexA =
    face.edge === "s"
      ? { x: point.x - TILE_WIDTH / 2, y: point.y } // W corner
      : { x: point.x, y: point.y + TILE_HEIGHT / 2 }; // S corner
  let vertexB =
    face.edge === "s"
      ? { x: point.x, y: point.y + TILE_HEIGHT / 2 } // S corner
      : { x: point.x + TILE_WIDTH / 2, y: point.y }; // E corner

  let bottomExtra = 0;
  if (bleed > 0) {
    const dx = vertexB.x - vertexA.x;
    const dy = vertexB.y - vertexA.y;
    const length = Math.hypot(dx, dy);
    const fx = (dx / length) * bleed;
    const fy = (dy / length) * bleed;
    vertexA = { x: vertexA.x - fx, y: vertexA.y - fy };
    vertexB = { x: vertexB.x + fx, y: vertexB.y + fy };
    bottomExtra = bleed;
  }

  const color = CLIFF_FALLBACK_COLORS[skin][face.edge];
  graphics
    .poly([
      vertexA.x, vertexA.y - face.topA * px,
      vertexB.x, vertexB.y - face.topB * px,
      vertexB.x, vertexB.y - face.bottom * px + bottomExtra,
      vertexA.x, vertexA.y - face.bottom * px + bottomExtra
    ])
    .fill({ color, alpha: 1 });

  // Horizontal joint lines every level so tall walls read as stacked stone
  // rather than a flat smear (skip slanted slope-side walls).
  if (face.topA === face.topB) {
    for (let level = face.bottom + 1; level < face.topA; level += 1) {
      graphics
        .moveTo(vertexA.x, vertexA.y - level * px)
        .lineTo(vertexB.x, vertexB.y - level * px)
        .stroke({ color: 0x241f1a, alpha: 0.35, width: 1 });
    }
  }
}

function terrainFallbackAssetId(cell: TerrainCellSnapshot): string {
  if (cell.terrain === "grass" && (cell.coord.x * 17 + cell.coord.y * 31) % 7 === 0) {
    return "terrain.grass.variant.1";
  }

  if (cell.terrain === "dirt" && (cell.coord.x + cell.coord.y) % 3 === 0) {
    return "terrain.dirt.variant.1";
  }

  // Cliff cells keep their original floor assetId (sim insertCliffCells);
  // when that id is unavailable (legacy saves carry the retired
  // "terrain.cliff.placeholder") fall back to plain grass — there is no
  // terrain.cliff.base tile.
  if (cell.terrain === "cliff") {
    return "terrain.grass.base";
  }

  return `terrain.${cell.terrain}.base`;
}

function addTerrainUnderlay(graphics: Graphics, cell: TerrainCellSnapshot, nearWater: boolean): void {
  const point = cellToWorld(cell.coord);
  const offsetY = tileOffsetY(cell);
  const halfWidth = TILE_WIDTH / 2 + TERRAIN_UNDERLAY_PADDING;
  const halfHeight = TILE_HEIGHT / 2 + TERRAIN_UNDERLAY_PADDING / 2;

  // The underlay shows through sub-pixel AA seams between adjacent tile
  // sprites. Its color must be inconspicuous for the tiles above it:
  // grass-green in the interior, but DARK for water cells and their
  // direct neighbours — a bright green underlay leaking along the
  // water/bank boundary reads as "green lines" across rivers, while a
  // dark leak there reads as a natural shadow.
  // Elevated cells lift their underlay diamond with the tile so it keeps
  // backing that tile's AA edges (the whole underlay layer paints below
  // every sprite chunk, so the lift cannot cover anything).
  // Elevated cells that don't border water get a slightly darker green so
  // the tile's AA edge bleeds into a natural shadow rather than bright grass.
  const color = nearWater ? 0x0d1e2a : cell.elevation > 0 ? 0x4a5a28 : 0x63753a;

  graphics
    .poly([
      point.x,
      point.y - halfHeight + offsetY,
      point.x + halfWidth,
      point.y + offsetY,
      point.x,
      point.y + halfHeight + offsetY,
      point.x - halfWidth,
      point.y + offsetY
    ])
    .fill({ color, alpha: 1 });
}
