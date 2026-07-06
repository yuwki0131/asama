import { Container, Graphics } from "pixi.js";
import type { TerrainCellSnapshot, WorldSnapshot } from "@asama/shared";
import { clearLayer, createSpriteFromCandidates, type LoadedAsset } from "./assets";
import { cellToWorld, type CameraState, TILE_HEIGHT, TILE_WIDTH } from "./camera";

// Underlay diamonds have exact tile footprint — no padding — to avoid
// sub-pixel overlap between the single global underlay Graphics and the
// chunk-local sprite layers.  The previous 0.5 px padding caused faint
// bright seam lines where chunk boundaries crossed water tiles.
const TERRAIN_UNDERLAY_PADDING = 0;
const TERRAIN_CHUNK_CELLS = 16;

interface TerrainChunkBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function terrainKeyFor(snapshot: WorldSnapshot, assets: ReadonlyMap<string, LoadedAsset>): string {
  const firstCell = snapshot.map.cells[0]?.coord;
  const lastCell = snapshot.map.cells[snapshot.map.cells.length - 1]?.coord;
  return `${snapshot.map.width}:${snapshot.map.height}:${assets.size}:${snapshot.map.cells.length}:${firstCell?.x ?? 0},${firstCell?.y ?? 0}:${lastCell?.x ?? 0},${lastCell?.y ?? 0}`;
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
    entry.bounds = {
      minX: Math.min(entry.bounds.minX, world.x - TILE_WIDTH),
      minY: Math.min(entry.bounds.minY, world.y - TILE_HEIGHT * 2),
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
      addTerrainSprite(container, cell, assets);
    }
    (container as Container & { __terrainBounds?: TerrainChunkBounds }).__terrainBounds = bounds;
    terrainLayer.addChild(container);
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

function addTerrainSprite(layer: Container, cell: TerrainCellSnapshot, assets: ReadonlyMap<string, LoadedAsset>): void {
  const point = cellToWorld(cell.coord);
  const sprite = createSpriteFromCandidates([cell.assetId, terrainFallbackAssetId(cell)], assets);
  sprite.position.copyFrom(point);
  layer.addChild(sprite);
}

function terrainFallbackAssetId(cell: TerrainCellSnapshot): string {
  if (cell.terrain === "grass" && (cell.coord.x * 17 + cell.coord.y * 31) % 7 === 0) {
    return "terrain.grass.variant.1";
  }

  if (cell.terrain === "dirt" && (cell.coord.x + cell.coord.y) % 3 === 0) {
    return "terrain.dirt.variant.1";
  }

  return `terrain.${cell.terrain}.base`;
}

function addTerrainUnderlay(graphics: Graphics, cell: TerrainCellSnapshot, nearWater: boolean): void {
  const point = cellToWorld(cell.coord);
  const halfWidth = TILE_WIDTH / 2 + TERRAIN_UNDERLAY_PADDING;
  const halfHeight = TILE_HEIGHT / 2 + TERRAIN_UNDERLAY_PADDING / 2;

  // The underlay shows through sub-pixel AA seams between adjacent tile
  // sprites. Its color must be inconspicuous for the tiles above it:
  // grass-green in the interior, but DARK for water cells and their
  // direct neighbours — a bright green underlay leaking along the
  // water/bank boundary reads as "green lines" across rivers, while a
  // dark leak there reads as a natural shadow.
  const color = nearWater ? 0x0d1e2a : 0x63753a;

  graphics
    .poly([
      point.x,
      point.y - halfHeight,
      point.x + halfWidth,
      point.y,
      point.x,
      point.y + halfHeight,
      point.x - halfWidth,
      point.y
    ])
    .fill({ color, alpha: 1 });
}
