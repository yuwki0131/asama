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
  const terrain = terrainAt(coord);
  const passable = terrain !== "water" && terrain !== "stone";
  const movementCost = terrain === "dirt" ? 3 : 1;

  return {
    coord,
    terrain,
    movementCost,
    passable,
    assetId: terrainAssetId(terrain, coord)
  };
}

function terrainAt(coord: CellCoord): TerrainType {
  const riverDistance = Math.abs(coord.y - 41 - Math.round(Math.sin(coord.x / 9) * 4));
  if (riverDistance <= 1 && coord.x > 12 && coord.x < MAP_WIDTH - 10) {
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
