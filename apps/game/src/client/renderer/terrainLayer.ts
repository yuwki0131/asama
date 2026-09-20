import { Container, Graphics, Matrix, Sprite, Texture } from "pixi.js";
import { MAX_ELEVATION } from "@asama/shared";
import type { ElevationSkin, TerrainCellSnapshot, WorldSnapshot } from "@asama/shared";
import { clearLayer, createSpriteFromCandidates, type LoadedAsset } from "./assets";
import { cellToWorld, type CameraState, TILE_HEIGHT, TILE_WIDTH } from "./camera";
import {
  cellAt,
  cliffInfoFor,
  edgeSurfaceHeight,
  ELEVATION_PIXELS_PER_LEVEL,
  slopeAssetSkin,
  slopeRise,
  tileOffsetY,
  type ElevationMapLike,
  type CliffFace
} from "./elevation";
import { PRE_GRADE_BACKGROUND_RGB } from "./toneGrade";

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

// Perimeter skirt: rings of pseudo-cells beyond the map rim that continue the
// nearest edge cell's terrain, overlaid with a background-colored gradient so
// the world dissolves at its borders instead of ending in a razor cut (V-02).
// Per-ring alpha stepping was tried first and read as terraced bands — the
// smooth fade must come from one gradient, not per-cell opacity.
const SKIRT_RING_CELLS = 12;

// V-11: the fade must reach full opacity BEFORE the skirt's outer edge and the
// overlay must extend BEYOND it. The outermost tile row's anti-aliased rim and
// the overlay's own AA edge otherwise coincide on one line, leaving a bright
// stitch against the void, and the not-yet-opaque last ring leaves a tonal
// step at the cut.
const SKIRT_FADE_OPAQUE_TAIL_CELLS = 2;
const SKIRT_FADE_OVERSCAN_CELLS = 2;
const SKIRT_FADE_TOTAL_CELLS = SKIRT_RING_CELLS + SKIRT_FADE_OVERSCAN_CELLS;

// The overlay lives inside the tone-graded world, the background does not —
// the fade must use the pre-grade color that grades onto the clear color.
const SKIRT_FADE_COLOR = PRE_GRADE_BACKGROUND_RGB;

/** Mirrors the sim's world-anchored macro field (map.ts connectedTerrainAssetId)
 *  so skirt tiles continue the interior macro pattern seamlessly across the rim. */
function macroAssetId(terrain: string, x: number, y: number): string {
  const bx = x >> 2;
  const by = y >> 2;
  let h = (bx * 374761393 + by * 668265263 + 1013904223) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  const mx = ((x % 4) + 4) % 4;
  const my = ((y % 4) + 4) % 4;
  return `terrain.${terrain}.macro.v${h % 2}.${mx}.${my}`;
}

// Smooth fade curve for the skirt gradients (offset → alpha, smoothstep-ish).
// Offsets are normalized to the fade span (rim → opaque tail start); the
// texture rescales them so alpha holds at 1 through the tail and overscan.
const SKIRT_FADE_STOPS: readonly [number, number][] = [
  [0, 0],
  [0.25, 0.16],
  [0.5, 0.5],
  [0.75, 0.84],
  [1, 1]
];

const SKIRT_FADE_SPAN_RATIO =
  (SKIRT_RING_CELLS - SKIRT_FADE_OPAQUE_TAIL_CELLS) / SKIRT_FADE_TOTAL_CELLS;

const SKIRT_FADE_TEXTURE_SIZE = 256;

/** Piecewise-linear alpha of the base fade curve at `offset` (0=rim, 1=outer
 *  overlay edge): the SKIRT_FADE_STOPS curve compressed into the fade span,
 *  holding at 1 through the opaque tail and overscan (V-11 contract). */
function skirtFadeBaseAlpha(offset: number): number {
  const t = offset / SKIRT_FADE_SPAN_RATIO;
  if (t >= 1) {
    return 1;
  }
  for (let i = 1; i < SKIRT_FADE_STOPS.length; i += 1) {
    const [o1, a1] = SKIRT_FADE_STOPS[i]!;
    const [o0, a0] = SKIRT_FADE_STOPS[i - 1]!;
    if (t <= o1) {
      return a0 + ((t - o0) / (o1 - o0)) * (a1 - a0);
    }
  }
  return 1;
}

/** Cheap 2-octave value noise in [0,1] for the fade mottling (deterministic). */
function skirtFadeNoise(x: number, y: number): number {
  const hash = (ix: number, iy: number): number => {
    let h = (ix * 374761393 + iy * 668265263 + 1442695040) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const sample = (fx: number, fy: number): number => {
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const a = hash(ix, iy) * (1 - tx) + hash(ix + 1, iy) * tx;
    const b = hash(ix, iy + 1) * (1 - tx) + hash(ix + 1, iy + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
  return 0.65 * sample(x / 52, y / 52) + 0.35 * sample(x / 19 + 57, y / 19 + 91);
}

/** Mottling weight at `offset`: zero at the rim (the fade must still start
 *  exactly on the map edge) and zero again before the opaque tail (EDGE-02:
 *  the outer band must stay ≥84% opaque with ≤14-luma jumps). */
function skirtFadeNoiseWeight(offset: number): number {
  const t = offset / SKIRT_FADE_SPAN_RATIO;
  if (t <= 0 || t >= 0.92) {
    return 0;
  }
  return 0.30 * Math.sin(Math.PI * Math.min(t / 0.92, 1)) ** 1.2;
}

/** Fade textures: base gradient in ring distance, modulated by soft value
 *  noise so the dissolve reads as patchy atmospheric distance instead of a
 *  ruler-straight burnt gradient (V-17: 台帳watch「フェード形状のオーガニック化」).
 *  Bands are full 2D textures so the mottle varies along the edge too. */
function makeSkirtFadeTexture(radial: boolean): Texture {
  const size = SKIRT_FADE_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context === null) {
    return Texture.WHITE;
  }
  const image = context.createImageData(size, size);
  const { r, g, b } = SKIRT_FADE_COLOR;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = radial ? Math.min(1, Math.hypot(x, y) / (size - 1)) : x / (size - 1);
      const noise = (skirtFadeNoise(radial ? x : x * 0.35, y) - 0.5) * 2;
      // Domain warp: the fade curve advances/retreats per along-edge position
      // so the dissolve onset is a wavy cloud line, not a ruler-straight
      // gradient. Zero at the rim (offset 0) and inert past the opaque span.
      const t = Math.min(1, offset / SKIRT_FADE_SPAN_RATIO);
      const warpEnvelope = Math.sin(Math.PI * t);
      const warped = Math.max(0, offset * (1 + noise * 0.28 * warpEnvelope));
      const base = skirtFadeBaseAlpha(warped);
      const weight = skirtFadeNoiseWeight(offset);
      const alpha = Math.max(0, Math.min(1, base + noise * weight));
      const index = (y * size + x) * 4;
      image.data[index] = r;
      image.data[index + 1] = g;
      image.data[index + 2] = b;
      image.data[index + 3] = Math.round(alpha * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return Texture.from(canvas);
}

/**
 * Background-colored fade over the skirt band: 4 edge parallelograms + 4
 * corner squares, each a sheared sprite of a canvas gradient texture
 * (pixi's FillGradient mangles diagonal linear gradients in clamp mode and
 * composites translucent radial stops over an opaque base, so the gradients
 * are baked into textures and sheared into iso space instead).
 *
 * The gradients run in CELL space (linear in ring distance): along the shared
 * edge/corner boundaries both fade at the same per-cell rate, so the pieces
 * join continuously, and a corner circle of radius M cells fully covers its
 * square's far tip.
 */
function buildSkirtFadeOverlay(width: number, height: number): Container {
  const m = SKIRT_FADE_TOTAL_CELLS;
  const gp = (fx: number, fy: number): { x: number; y: number } => ({
    x: (fx - fy) * (TILE_WIDTH / 2),
    y: (fx + fy) * (TILE_HEIGHT / 2)
  });
  const overlay = new Container();
  const linearTexture = makeSkirtFadeTexture(false);
  const radialTexture = makeSkirtFadeTexture(true);

  // U = texture x basis (fade/outward direction), V = texture y basis.
  const place = (
    texture: Texture,
    origin: { x: number; y: number },
    u: { x: number; y: number },
    v: { x: number; y: number }
  ): void => {
    const sprite = new Sprite(texture);
    const tw = texture.width;
    const th = texture.height;
    sprite.setFromMatrix(new Matrix(u.x / tw, u.y / tw, v.x / th, v.y / th, origin.x, origin.y));
    overlay.addChild(sprite);
  };
  const delta = (from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } => ({
    x: to.x - from.x,
    y: to.y - from.y
  });

  const x0 = -0.5;
  const x1 = width - 0.5;
  const y0 = -0.5;
  const y1 = height - 0.5;

  // Edge bands (map-side extent only; corners are covered by the squares).
  const bands: [[number, number], [number, number], [number, number]][] = [
    [[x0, y0], [x0, y0 - m], [x1, y0]], // N: origin, outward fy-, along fx+
    [[x0, y1], [x0, y1 + m], [x1, y1]], // S
    [[x0, y0], [x0 - m, y0], [x0, y1]], // W
    [[x1, y0], [x1 + m, y0], [x1, y1]] // E
  ];
  for (const [origin, outward, along] of bands) {
    const o = gp(...origin);
    place(linearTexture, o, delta(o, gp(...outward)), delta(o, gp(...along)));
  }

  const corners: [number, number, number, number][] = [
    [x0, y0, -1, -1],
    [x1, y0, 1, -1],
    [x0, y1, -1, 1],
    [x1, y1, 1, 1]
  ];
  for (const [cx, cy, dx, dy] of corners) {
    const o = gp(cx, cy);
    place(radialTexture, o, delta(o, gp(cx + dx * m, cy)), delta(o, gp(cx, cy + dy * m)));
  }
  return overlay;
}

function buildPerimeterSkirtCells(snapshot: WorldSnapshot): TerrainCellSnapshot[] {
  const { width, height, cells } = snapshot.map;
  const clamp = (v: number, max: number): number => Math.max(0, Math.min(max - 1, v));
  const skirt: TerrainCellSnapshot[] = [];
  for (let y = -SKIRT_RING_CELLS; y < height + SKIRT_RING_CELLS; y++) {
    for (let x = -SKIRT_RING_CELLS; x < width + SKIRT_RING_CELLS; x++) {
      const outside = x < 0 || x >= width || y < 0 || y >= height;
      if (!outside) {
        continue;
      }
      const source = cells[clamp(y, height) * width + clamp(x, width)];
      if (source === undefined) {
        continue;
      }
      const hasMacroSet = source.terrain === "grass" || source.terrain === "dirt" || source.terrain === "water";
      skirt.push({
        ...source,
        coord: { x, y },
        assetId: hasMacroSet ? macroAssetId(source.terrain, x, y) : source.assetId,
        slope: null
      });
    }
  }
  return skirt;
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
  assets: ReadonlyMap<string, LoadedAsset>,
  skirtFadeLayer?: Container
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

  // Skirt cells join the regular chunk pipeline (own chunks at negative /
  // beyond-map chunk coords) so they get depth sorting and culling for free.
  const skirtCells = buildPerimeterSkirtCells(snapshot);
  for (const cell of [...snapshot.map.cells, ...skirtCells]) {
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
  for (const cell of [...snapshot.map.cells, ...skirtCells]) {
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
  // The underlay sits below all sprite chunks and is never culled. The tag
  // lets QA tooling hide it to expose ground-coverage gaps (composite lint).
  (underlayGraphics as Graphics & { __isTerrainUnderlay?: boolean }).__isTerrainUnderlay = true;
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
      // FACES and the SLOPE tiles are depth-sorted into the retained scene
      // layer instead (sceneLayer.ts) so trees/buildings in front of a cliff
      // or ramp paint over it — and never the other way around.
      addTerrainSprite(container, cell, snapshot.map, assets);
    }
    (container as Container & { __terrainBounds?: TerrainChunkBounds }).__terrainBounds = bounds;
    terrainLayer.addChild(container);
  }

  // Phase 3.5 — skirt fade: background-colored gradient bands over the skirt
  // rings (transparent at the map rim → opaque at the skirt's outer edge).
  // Preferably drawn on the dedicated layer ABOVE the retained scene: tall
  // rim structures (塀・櫓) extend their sprites into the skirt band, and
  // with the daylight-mist void they read as dark streaks poking out of the
  // haze unless the fade covers them too (V-17 L2指摘).
  const overlay = buildSkirtFadeOverlay(snapshot.map.width, snapshot.map.height);
  if (skirtFadeLayer !== undefined) {
    clearLayer(skirtFadeLayer);
    skirtFadeLayer.addChild(overlay);
  } else {
    terrainLayer.addChild(overlay);
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
  // V-22: the back (N/W) rim of a terrace has no visible cliff face in iso,
  // so ANY decorated line alone reads as an overlay scratched onto flat
  // grass (L2: 主因は「面が無いこと」). Instead of a line, shade a soft
  // drop-off gradient on the LOWER ground behind the edge (stacked
  // translucent green-shadow strokes) plus a faint sunlit lip on the upper
  // plate — the value difference between the two sides is what sells the
  // step; the brow line itself stays subtle.
  const capGraphics = new Graphics();
  const capJitter = (x: number, y: number, salt: number): number => {
    let h = (x * 374761393 + y * 668265263 + salt * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return ((Math.imul(h, 1274126177) >>> 0) >>> 16) / 0x10000;
  };
  const capEdge = (
    x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, salt: number
  ): void => {
    const j = capJitter(cx, cy, salt);
    // Soft shade band on the lower ground (screen-up side): darkened grass,
    // widest and faintest furthest from the edge.
    const shadeSteps: readonly [number, number, number][] = [
      [-1.5, 3, 0.16], [-4, 3.5, 0.10], [-6.5, 3.5, 0.055]
    ];
    for (const [dy, width, alpha] of shadeSteps) {
      capGraphics
        .moveTo(x0, y0 + dy)
        .lineTo(x1, y1 + dy)
        .stroke({ color: 0x252b1d, width, alpha: alpha * (0.85 + 0.3 * j), cap: "round" });
    }
    // Faint earthen brow on the edge itself.
    capGraphics
      .moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ color: 0x4f4433, width: 1.5, alpha: 0.22 + 0.10 * j, cap: "round" });
    // Sunlit grass lip on the upper plate.
    capGraphics
      .moveTo(x0, y0 + 2)
      .lineTo(x1, y1 + 2)
      .stroke({ color: 0xa8ad74, width: 2.5, alpha: 0.10 + 0.06 * (1 - j), cap: "round" });
  };
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
      capEdge(screenX, screenY - TILE_HEIGHT / 2, screenX - TILE_WIDTH / 2, screenY, cell.coord.x, cell.coord.y, 3);
    }

    // NE cap line: top → right diamond vertex.
    const neNeighbour = cellAt(snapshot.map, cell.coord.x, cell.coord.y - 1);
    if ((neNeighbour?.elevation ?? 0) < cell.elevation) {
      capEdge(screenX, screenY - TILE_HEIGHT / 2, screenX + TILE_WIDTH / 2, screenY, cell.coord.x, cell.coord.y, 7);
    }
  }
  terrainLayer.addChild(capGraphics);
}

/**
 * Straight S/E faces owed by a cliff cell, derived from map geometry: one
 * face per higher straight neighbour (the N neighbour's S face and/or the W
 * neighbour's E face — the fixed camera only ever sees S/E faces).
 */
function cliffStraightFaces(
  cell: TerrainCellSnapshot,
  map: ElevationMapLike
): Array<{ face: CliffFace; skin: ElevationSkin; highPoint: { x: number; y: number }; anchorY: number }> {
  const faces: Array<{ face: CliffFace; skin: ElevationSkin; highPoint: { x: number; y: number }; anchorY: number }> = [];
  if (cell.cliffFace === undefined || cell.cliffHeight === undefined || cell.cliffFace === "se") {
    return faces;
  }
  const specs = [
    { dx: 0, dy: -1, edge: "s" as const, facing: "S" as const },
    { dx: -1, dy: 0, edge: "e" as const, facing: "E" as const }
  ];
  for (const spec of specs) {
    const high = cellAt(map, cell.coord.x + spec.dx, cell.coord.y + spec.dy);
    if (high === null) continue;
    // Height of the high cell's edge facing this cell; null on a slope's
    // side edge (the slope draws its own slanted side wall there).
    const top = edgeSurfaceHeight(high, spec.facing);
    if (top === null) continue;
    const drop = top - cell.elevation;
    if (drop < 1) continue;
    const h = Math.min(drop, MAX_ELEVATION);
    const skin = high.elevationSkin;
    const highPoint = cellToWorld(high.coord);
    faces.push({
      face: {
        edge: spec.edge,
        topA: top,
        topB: top,
        bottom: cell.elevation,
        assetId: `terrain.${skin}.face.${spec.edge}.h${h}`
      },
      skin,
      highPoint,
      anchorY: highPoint.y + tileOffsetY(high)
    });
  }
  return faces;
}

/**
 * Exact-geometry stone backdrops behind every cliff face and slanted slope
 * side wall, drawn into ONE graphics that the retained scene inserts BELOW
 * all its sprites (sceneLayer.ts syncStatic).
 *
 * Why: face/side-wall art deliberately recedes from its contract polygon —
 * ishigaki sori curves the silhouette inward at the top and corners, slope
 * side walls batter their top toward the ramp — and neighbouring sprites
 * normally cover each other's receded corners via their half-tile overlap.
 * At a concave junction of two DIFFERENT piece kinds (slope side wall meets
 * cliff face) both arts pull away from the shared corner vertical and a
 * wedge of bare underlay shows through (composite lint GAP finding).
 *
 * Painting the un-battered contract quads underneath the whole scene closes
 * every such wedge with wall-tone while never covering neighbouring art: all
 * sprites draw on top of the backdrop. (An earlier attempt that drew
 * backdrops at each cell's OWN depth inside the painter's sort landed on top
 * of the already-drawn neighbouring wall sprites and broke every connected
 * wall run — see the fallback note in addCliffCellSprites.)
 */
export function addElevationBackdrops(graphics: Graphics, cell: TerrainCellSnapshot, map: ElevationMapLike): void {
  for (const { face, skin, highPoint } of cliffStraightFaces(cell, map)) {
    drawFallbackFace(graphics, highPoint, skin, face);
  }
  if (cell.slope !== null) {
    const point = cellToWorld(cell.coord);
    for (const face of cliffInfoFor(map, cell).faces) {
      if (face.topA !== face.topB) {
        drawFallbackFace(graphics, point, cell.elevationSkin, face);
      }
    }
  }
}

/**
 * Draws a dedicated cliff terrain cell's face/corner sprites into `layer`.
 *
 * Called from the retained scene layer (sceneLayer.ts) where the cliff cell
 * participates in the isometric painter's sort with its OWN cell coordinate
 * as the depth key: buildings on the high side (smaller x+y) paint first so
 * the face covers their protruding bases, while trees on the low side
 * (larger x+y) paint after and correctly appear in front of the wall.
 *
 * Faces are derived from the MAP GEOMETRY, not from the single `cliffFace`
 * tag: a low cell in a concave corner of the boundary has BOTH a higher N
 * neighbour (its S face) and a higher W neighbour (its E face), but the sim
 * can only tag one direction per cell — trusting the tag left the second
 * face undrawn, exposing a bare-canvas hole at every inside turn of a
 * cliff/ishigaki line.
 */
export function addCliffCellSprites(
  layer: Container,
  cell: TerrainCellSnapshot,
  map: ElevationMapLike,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  if (cell.cliffFace === undefined || cell.cliffHeight === undefined) return;

  if (cell.cliffFace === "se") {
    // Convex SE corner: the adjacent S and E cliff cells draw the faces;
    // this cell only draws the corner sprite over their shared vertical seam.
    const highCell = cellAt(map, cell.coord.x - 1, cell.coord.y - 1);
    if (highCell === null) return;
    const h = Math.min(cell.cliffHeight, MAX_ELEVATION);
    const cornerAssetId = `terrain.${cell.elevationSkin}.corner.se.h${h}`;
    if (assets.get(cornerAssetId) !== undefined) {
      const sprite = createSpriteFromCandidates([cornerAssetId], assets);
      const highPoint = cellToWorld(highCell.coord);
      sprite.position.set(highPoint.x, highPoint.y + tileOffsetY(highCell));
      layer.addChild(sprite);
    }
    return;
  }

  const faces = cliffStraightFaces(cell, map);

  // Fallback polygons are drawn ONLY for faces whose sprite asset is missing.
  //
  // They must never paint behind an existing sprite as an opaque "backdrop":
  // face sprites are a full tile diamond wide (64 px) while the geometric
  // face quad is only half of one (32 px), so neighbouring wall sprites
  // deliberately overlap each other by half a tile. An always-on backdrop
  // painted at THIS cell's depth lands on top of the already-drawn
  // neighbouring sprite, and this cell's own sprite (whose silhouette curves
  // inward at the top) does not fully re-cover it — every tile of a
  // connected wall grew a bare grey triangle on its left, and the 2 px
  // bottom bleed drew grey slivers onto the low-side grass in front of the
  // wall. The sprites' generous overlap covers the seams the backdrop used
  // to hide; where a sprite is genuinely missing the opaque fallback quad
  // (with bleed) still stands in for it.
  const fallback = new Graphics();
  let hasFallback = false;
  for (const { face, skin, highPoint } of faces) {
    if (assets.get(face.assetId) === undefined) {
      drawFallbackFace(fallback, highPoint, skin, face, CLIFF_BACKDROP_BLEED);
      hasFallback = true;
    }
  }
  if (hasFallback) {
    layer.addChild(fallback);
  } else {
    fallback.destroy();
  }

  for (const { face, highPoint, anchorY } of faces) {
    if (assets.get(face.assetId) !== undefined) {
      const sprite = createSpriteFromCandidates([face.assetId], assets);
      sprite.position.set(highPoint.x, anchorY);
      layer.addChild(sprite);
    }
  }
}

/** Screen-space bounding box of a cliff-face / slope sprite, used by the
 *  retained scene to find lifted floors that a face behind them would
 *  otherwise paint over. */
export interface FeatureScreenRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Painter's-sort depth key (x+y) of the owning scene item. */
  depthKey: number;
  /** Elevation of the feature's foot. Floors AT this level touch the wall
   *  naturally (the sprite's bottom half-diamond is the intended ground
   *  contact) and must not be re-layered above it. */
  bottomElevation: number;
}

/** Mirrors the face derivation of `addCliffCellSprites` but only reports the
 *  sprite rects (64 px wide, 32+40h tall, anchored 16 px above the high
 *  cell's tile center). */
export function cliffFeatureScreenRects(
  cell: TerrainCellSnapshot,
  map: ElevationMapLike
): FeatureScreenRect[] {
  if (cell.cliffFace === undefined || cell.cliffHeight === undefined) return [];
  const depthKey = cell.coord.x + cell.coord.y;
  const rects: FeatureScreenRect[] = [];

  const pushRect = (high: TerrainCellSnapshot, h: number): void => {
    const highPoint = cellToWorld(high.coord);
    const top = highPoint.y + tileOffsetY(high) - TILE_HEIGHT / 2;
    rects.push({
      minX: highPoint.x - TILE_WIDTH / 2,
      maxX: highPoint.x + TILE_WIDTH / 2,
      minY: top,
      maxY: top + TILE_HEIGHT + h * ELEVATION_PIXELS_PER_LEVEL,
      depthKey,
      bottomElevation: cell.elevation
    });
  };

  if (cell.cliffFace === "se") {
    const highCell = cellAt(map, cell.coord.x - 1, cell.coord.y - 1);
    if (highCell !== null) {
      pushRect(highCell, Math.min(cell.cliffHeight, MAX_ELEVATION));
    }
    return rects;
  }
  for (const spec of [
    { dx: 0, dy: -1, facing: "S" as const },
    { dx: -1, dy: 0, facing: "E" as const }
  ]) {
    const high = cellAt(map, cell.coord.x + spec.dx, cell.coord.y + spec.dy);
    if (high === null) continue;
    const top = edgeSurfaceHeight(high, spec.facing);
    if (top === null) continue;
    const drop = top - cell.elevation;
    if (drop < 1) continue;
    pushRect(high, Math.min(drop, MAX_ELEVATION));
  }
  return rects;
}

/** Screen rect of a slope cell's ramp sprite (rises one level above its
 *  low-side anchor). */
export function slopeFeatureScreenRect(cell: TerrainCellSnapshot): FeatureScreenRect {
  const point = cellToWorld(cell.coord);
  const anchorY = point.y + tileOffsetY(cell);
  return {
    minX: point.x - TILE_WIDTH / 2,
    maxX: point.x + TILE_WIDTH / 2,
    minY: anchorY - TILE_HEIGHT / 2 - ELEVATION_PIXELS_PER_LEVEL,
    maxY: anchorY + TILE_HEIGHT / 2,
    depthKey: cell.coord.x + cell.coord.y,
    bottomElevation: cell.elevation
  };
}

/**
 * Re-draws a lifted floor tile inside the retained scene.
 *
 * Ground tiles normally live in the always-below terrain layer, but a floor
 * lifted by elevation slides UP the screen into the body of cliff-face /
 * slope sprites belonging to cells BEHIND it — and, drawn in a lower layer,
 * it loses to them no matter what ("a far tile paints over a near one").
 * The scene layer duplicates exactly those floors as depth-sorted items so
 * the near floor wins; the terrain-layer copy simply stays underneath.
 * Cap lines (see the terrain layer's Phase 4) are re-drawn too, or the rim
 * marking would stay buried under the face sprite.
 */
export function addElevatedFloorSprites(
  layer: Container,
  cell: TerrainCellSnapshot,
  map: ElevationMapLike,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const point = cellToWorld(cell.coord);
  const screenY = point.y + tileOffsetY(cell);
  const sprite = createSpriteFromCandidates([cell.assetId, terrainFallbackAssetId(cell)], assets);
  sprite.position.set(point.x, screenY);
  layer.addChild(sprite);

  const caps = new Graphics();
  let hasCaps = false;
  const nwNeighbour = cellAt(map, cell.coord.x - 1, cell.coord.y);
  if ((nwNeighbour?.elevation ?? 0) < cell.elevation) {
    caps
      .moveTo(point.x, screenY - TILE_HEIGHT / 2)
      .lineTo(point.x - TILE_WIDTH / 2, screenY)
      .stroke({ color: 0x6b5a42, width: 3, alpha: 0.7, cap: "round" });
    hasCaps = true;
  }
  const neNeighbour = cellAt(map, cell.coord.x, cell.coord.y - 1);
  if ((neNeighbour?.elevation ?? 0) < cell.elevation) {
    caps
      .moveTo(point.x, screenY - TILE_HEIGHT / 2)
      .lineTo(point.x + TILE_WIDTH / 2, screenY)
      .stroke({ color: 0x6b5a42, width: 3, alpha: 0.7, cap: "round" });
    hasCaps = true;
  }
  if (hasCaps) {
    layer.addChild(caps);
  } else {
    caps.destroy();
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
    // Slope tiles rise 40 px above their low side and must take part in the
    // scene's painter's sort (a slope in FRONT of a cliff face has to paint
    // over it); they are drawn from the retained scene layer instead
    // (sceneLayer.ts → addSlopeCellSprites). The shared underlay diamond
    // still backs the cell here.
    return;
  }

  const sprite = createSpriteFromCandidates([cell.assetId, terrainFallbackAssetId(cell)], assets);
  sprite.position.set(point.x, point.y + offsetY);
  layer.addChild(sprite);
}

/**
 * Slope cells draw the contract's `terrain.slope.<skin>.<dir>` tile anchored
 * like a flat tile of the LOW side. When the tile asset is missing, the
 * fallback draws the base terrain tile plus an opaque ramp polygon: the tile
 * diamond with the two uphill corners lifted one level.
 *
 * The slope's two SIDE edges are cliff walls with a slanted top
 * (`terrain.slope.<skin>.<dir>.side.<s|e>`); they are not covered by the
 * dedicated cliff cells (no elevation drop at the base level) so they are
 * drawn here, from the slope cell itself.
 *
 * Called from the retained scene layer (sceneLayer.ts), NOT from the terrain
 * chunks: the ramp rises 40 px above its low side, so — exactly like the
 * cliff faces — it must participate in the isometric painter's sort with its
 * own cell coordinate as the depth key. Drawn in the always-below terrain
 * layer, a slope was overpainted by every cliff face in the scene layer,
 * including walls BEHIND it (smaller x+y), which swallowed the stairs/ramp.
 */
export function addSlopeCellSprites(
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

  // Back-edge fill first (behind everything of this cell), then the slanted
  // side walls — both hang below/behind the ramp surface.
  addSlopeBackFill(layer, cell, map);
  addSlopeSideWalls(layer, cell, map, assets);

  // Gentle 2-cell slope halves use dedicated half tiles
  // (terrain.slope2.<skin>.<dir>.<lower|upper>); 1-cell slopes keep the
  // legacy terrain.slope.<skin>.<dir> tile.
  const slopeAssetId =
    cell.slopeHalf === undefined
      ? `terrain.slope.${slopeAssetSkin(cell.elevationSkin)}.${slope.toLowerCase()}`
      : `terrain.slope2.${slopeAssetSkin(cell.elevationSkin)}.${slope.toLowerCase()}.${cell.slopeHalf}`;
  const asset = assets.get(slopeAssetId);
  if (asset !== undefined) {
    // Width>1 slopes tile this sprite per column; a per-column pair of curb
    // rails read as parallel fenced flights (V-16). Interior columns use the
    // curbless mid variant and edge columns keep only their outer curb
    // (cvn/cvp), so the flight reads as ONE wide stairway. Base sprite stays
    // the fallback for missing variants.
    const variantIds: string[] = [];
    if (cell.slopeHalf === undefined && slopeAssetSkin(cell.elevationSkin) === "ishigaki") {
      const alongX = slope === "N" || slope === "S";
      const sameRamp = (dx: number, dy: number): boolean => {
        const neighbour = cellAt(map, cell.coord.x + dx, cell.coord.y + dy);
        return (
          neighbour !== null &&
          neighbour.slope === cell.slope &&
          neighbour.elevation === cell.elevation &&
          neighbour.slopeHalf === cell.slopeHalf
        );
      };
      const neg = alongX ? sameRamp(-1, 0) : sameRamp(0, -1);
      const pos = alongX ? sameRamp(1, 0) : sameRamp(0, 1);
      if (neg && pos) {
        variantIds.push(`${slopeAssetId}.mid`);
      } else if (neg) {
        variantIds.push(`${slopeAssetId}.cvp`);
      } else if (pos) {
        variantIds.push(`${slopeAssetId}.cvn`);
      }
    }
    const sprite = createSpriteFromCandidates([...variantIds, slopeAssetId], assets);
    sprite.position.set(point.x, point.y + offsetY);
    layer.addChild(sprite);
    return;
  }

  // Fallback: base terrain under the ramp (fills the low-side sliver), then
  // the ramp polygon (downhill corners at the downhill rise, uphill corners
  // at the uphill rise — half levels for gentle 2-cell slope halves).
  const base = createSpriteFromCandidates([cell.assetId, terrainFallbackAssetId(cell)], assets);
  base.position.set(point.x, point.y + offsetY);
  layer.addChild(base);

  const lifted = liftedCorners(slope);
  const rise = slopeRise(cell);
  const downLift = -rise.down * ELEVATION_PIXELS_PER_LEVEL;
  const upLift = -rise.up * ELEVATION_PIXELS_PER_LEVEL;
  const cornerLift = (corner: "n" | "e" | "s" | "w"): number => (lifted.has(corner) ? upLift : downLift);
  const corners = {
    n: { x: point.x, y: point.y - TILE_HEIGHT / 2 + offsetY + cornerLift("n") },
    e: { x: point.x + TILE_WIDTH / 2, y: point.y + offsetY + cornerLift("e") },
    s: { x: point.x, y: point.y + TILE_HEIGHT / 2 + offsetY + cornerLift("s") },
    w: { x: point.x - TILE_WIDTH / 2, y: point.y + offsetY + cornerLift("w") }
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

  // Receded/battered art and missing sprites alike are backed by the
  // scene-wide contract-quad backdrop layer (addElevationBackdrops), so only
  // the sprites themselves are drawn here.
  for (const face of sideFaces) {
    const asset = assets.get(face.assetId);
    if (asset !== undefined) {
      const sprite = createSpriteFromCandidates([face.assetId], assets);
      sprite.position.set(point.x, anchorY);
      layer.addChild(sprite);
    }
  }
}

/**
 * Fills the screen-space gap on a slope's BACK side edge (the NW or NE
 * diamond edge adjacent to the uphill edge). Lifting the uphill corners
 * detaches that edge from the back neighbour's tile, exposing a dark
 * triangle of bare canvas/underlay between the ramp and the neighbour
 * (previously a "deep blue hole" beside every ramp). The fill drops from
 * the slanted lifted edge down to the back neighbour's surface level.
 */
function addSlopeBackFill(layer: Container, cell: TerrainCellSnapshot, map: ElevationMapLike): void {
  const slope = cell.slope;
  if (slope === null) {
    return;
  }

  const point = cellToWorld(cell.coord);
  const elev = cell.elevation;
  const px = ELEVATION_PIXELS_PER_LEVEL;
  const ground = {
    n: { x: point.x, y: point.y - TILE_HEIGHT / 2 },
    e: { x: point.x + TILE_WIDTH / 2, y: point.y },
    s: { x: point.x, y: point.y + TILE_HEIGHT / 2 },
    w: { x: point.x - TILE_WIDTH / 2, y: point.y }
  };

  // Back edge adjacent to the uphill edge, per slope direction:
  //   N: NW edge (neighbour W = (x-1,y)), corners n(high) → w(low)
  //   E: NE edge (neighbour N = (x,y-1)), corners e(high) → n(low)
  //   S: NW edge (neighbour W),           corners w(high) → n(low)
  //   W: NE edge (neighbour N),           corners n(high) → e(low)
  const spec =
    slope === "N" ? { dx: -1, dy: 0, facing: "E" as const, high: ground.n, low: ground.w, shade: "s" as const }
    : slope === "E" ? { dx: 0, dy: -1, facing: "S" as const, high: ground.e, low: ground.n, shade: "e" as const }
    : slope === "S" ? { dx: -1, dy: 0, facing: "E" as const, high: ground.w, low: ground.n, shade: "s" as const }
    : /* W */         { dx: 0, dy: -1, facing: "S" as const, high: ground.n, low: ground.e, shade: "e" as const };

  const rise = slopeRise(cell);
  const lowLevel = elev + rise.down;
  const highLevel = elev + rise.up;
  const neighbour = cellAt(map, cell.coord.x + spec.dx, cell.coord.y + spec.dy);
  const neighbourSurface =
    neighbour === null ? 0 : edgeSurfaceHeight(neighbour, spec.facing) ?? neighbour.elevation;
  if (neighbourSurface >= highLevel) {
    return; // back neighbour covers the lifted edge — nothing exposed
  }
  const bottom = Math.min(neighbourSurface, lowLevel);

  const fill = new Graphics();
  fill
    .poly([
      spec.low.x, spec.low.y - lowLevel * px,
      spec.high.x, spec.high.y - highLevel * px,
      spec.high.x, spec.high.y - bottom * px,
      spec.low.x, spec.low.y - bottom * px
    ])
    .fill({ color: CLIFF_FALLBACK_COLORS[cell.elevationSkin][spec.shade], alpha: 1 });
  layer.addChild(fill);
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

export function terrainFallbackAssetId(cell: TerrainCellSnapshot): string {
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
