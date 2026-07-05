import { Container, Graphics } from "pixi.js";
import type { TerrainCellSnapshot, WorldSnapshot } from "@asama/shared";
import { clearLayer, createSpriteFromCandidates, type LoadedAsset } from "./assets";
import { cellToWorld, type CameraState, TILE_HEIGHT, TILE_WIDTH } from "./camera";

const TERRAIN_UNDERLAY_PADDING = 0.5;
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
  const chunks = new Map<string, { container: Container; underlay: Graphics; bounds: TerrainChunkBounds }>();

  for (const cell of snapshot.map.cells) {
    const key = `${Math.floor(cell.coord.x / TERRAIN_CHUNK_CELLS)}:${Math.floor(cell.coord.y / TERRAIN_CHUNK_CELLS)}`;
    let chunk = chunks.get(key);
    if (chunk === undefined) {
      const container = new Container();
      const underlay = new Graphics();
      container.addChild(underlay);
      chunk = {
        container,
        underlay,
        bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
      };
      chunks.set(key, chunk);
      terrainLayer.addChild(container);
    }

    addTerrainUnderlay(chunk.underlay, cell);
    addTerrainSprite(chunk.container, cell, assets);

    const world = cellToWorld(cell.coord);
    chunk.bounds = {
      minX: Math.min(chunk.bounds.minX, world.x - TILE_WIDTH),
      minY: Math.min(chunk.bounds.minY, world.y - TILE_HEIGHT * 2),
      maxX: Math.max(chunk.bounds.maxX, world.x + TILE_WIDTH),
      maxY: Math.max(chunk.bounds.maxY, world.y + TILE_HEIGHT * 2)
    };
  }

  for (const chunk of chunks.values()) {
    (chunk.container as Container & { __terrainBounds?: TerrainChunkBounds }).__terrainBounds = chunk.bounds;
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

function addTerrainUnderlay(graphics: Graphics, cell: TerrainCellSnapshot): void {
  const point = cellToWorld(cell.coord);
  const halfWidth = TILE_WIDTH / 2 + TERRAIN_UNDERLAY_PADDING;
  const halfHeight = TILE_HEIGHT / 2 + TERRAIN_UNDERLAY_PADDING / 2;

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
    .fill({ color: 0x63753a, alpha: 1 });
}
