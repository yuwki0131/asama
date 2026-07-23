// Elevation-aware ground mesh for the trial 3D renderer.
//
// The trial scenario has a small (≤32x32) fixed elevation layout, so we can
// afford one merged BufferGeometry rebuilt whenever `terrainRevision`
// changes on the WorldSnapshot. Each cell becomes a flat square quad at its
// elevation; cliff faces between neighboring cells are added as vertical
// side quads so the terraces read as solid blocks rather than floating rugs.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial
} from "three";
import type { TerrainCellSnapshot, WorldSnapshot } from "@asama/shared";
import { CELL_SIZE, ELEVATION_HEIGHT } from "./coord";

// Per-elevation top color: distinct hues so terraces read at a glance.
const ELEVATION_COLORS: readonly Color[] = [
  new Color(0x88a85e), // level 0: grass
  new Color(0xb4a878), // level 1: tan (raised bailey)
  new Color(0xc9bfa2), // level 2: light stone plateau
  new Color(0xd4c7a4), // level 3
  new Color(0xdac9a4), // level 4
  new Color(0xe0cea6), // level 5
];
const WATER_TOP = new Color(0x3a70a0);
const CLIFF_COLOR = new Color(0x7d6a54);
const CLIFF_SHADOW = new Color(0x5b4b3a);

function colorForElevation(level: number): Color {
  return ELEVATION_COLORS[Math.min(ELEVATION_COLORS.length - 1, Math.max(0, level))]!;
}

export interface TerrainMesh {
  readonly mesh: Mesh;
  dispose(): void;
  rebuild(snapshot: WorldSnapshot): void;
}

export function createTerrainMesh(): TerrainMesh {
  const geometry = new BufferGeometry();
  const material = new MeshStandardMaterial({
    vertexColors: true,
    side: DoubleSide,
    roughness: 0.95,
    metalness: 0
  });
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = false;
  mesh.castShadow = false;

  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
    rebuild(snapshot) {
      buildTerrainGeometry(geometry, snapshot);
    }
  };
}

function buildTerrainGeometry(geometry: BufferGeometry, snapshot: WorldSnapshot): void {
  const { width, height, cells } = snapshot.map;
  const cellIndex = new Map<number, TerrainCellSnapshot>();
  for (const cell of cells) {
    cellIndex.set(cell.coord.y * width + cell.coord.x, cell);
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = cellIndex.get(y * width + x);
      const elevation = cell?.elevation ?? 0;
      const isWater = cell?.terrain === "water";
      const worldY = (isWater ? -0.15 : elevation) * ELEVATION_HEIGHT;
      const color = isWater ? WATER_TOP : colorForElevation(elevation);

      // Top face: one square quad per cell.
      const x0 = x * CELL_SIZE;
      const x1 = (x + 1) * CELL_SIZE;
      const z0 = y * CELL_SIZE;
      const z1 = (y + 1) * CELL_SIZE;
      positions.push(
        x0, worldY, z0,
        x1, worldY, z0,
        x1, worldY, z1,
        x0, worldY, z1
      );
      for (let i = 0; i < 4; i += 1) {
        colors.push(color.r, color.g, color.b);
      }
      indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
      indices.push(vertexOffset, vertexOffset + 2, vertexOffset + 3);
      vertexOffset += 4;

      // Cliff faces to the east and south (comparing this cell against +x / +y
      // neighbors avoids double-drawing seams). The base sits at the lower
      // neighbor's elevation so terraces look solid.
      if (!isWater) {
        // East face (x = x1)
        const east = cellIndex.get(y * width + (x + 1));
        const eastY = east !== undefined && east.terrain !== "water"
          ? east.elevation
          : x + 1 >= width ? 0 : -1; // treat map edge same as flat outside
        if (eastY < elevation && eastY >= 0) {
          const yTop = worldY;
          const yBot = eastY * ELEVATION_HEIGHT;
          positions.push(
            x1, yBot, z0,
            x1, yTop, z0,
            x1, yTop, z1,
            x1, yBot, z1
          );
          // Top edge of the cliff face uses the higher cell's color, bottom
          // uses a darker shadow tone — reads as a proper terrace face.
          colors.push(CLIFF_SHADOW.r, CLIFF_SHADOW.g, CLIFF_SHADOW.b);
          colors.push(CLIFF_COLOR.r, CLIFF_COLOR.g, CLIFF_COLOR.b);
          colors.push(CLIFF_COLOR.r, CLIFF_COLOR.g, CLIFF_COLOR.b);
          colors.push(CLIFF_SHADOW.r, CLIFF_SHADOW.g, CLIFF_SHADOW.b);
          indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
          indices.push(vertexOffset, vertexOffset + 2, vertexOffset + 3);
          vertexOffset += 4;
        }

        // South face (z = z1)
        const south = cellIndex.get((y + 1) * width + x);
        const southY = south !== undefined && south.terrain !== "water"
          ? south.elevation
          : y + 1 >= height ? 0 : -1;
        if (southY < elevation && southY >= 0) {
          const yTop = worldY;
          const yBot = southY * ELEVATION_HEIGHT;
          positions.push(
            x0, yBot, z1,
            x0, yTop, z1,
            x1, yTop, z1,
            x1, yBot, z1
          );
          // Top edge of the cliff face uses the higher cell's color, bottom
          // uses a darker shadow tone — reads as a proper terrace face.
          colors.push(CLIFF_SHADOW.r, CLIFF_SHADOW.g, CLIFF_SHADOW.b);
          colors.push(CLIFF_COLOR.r, CLIFF_COLOR.g, CLIFF_COLOR.b);
          colors.push(CLIFF_COLOR.r, CLIFF_COLOR.g, CLIFF_COLOR.b);
          colors.push(CLIFF_SHADOW.r, CLIFF_SHADOW.g, CLIFF_SHADOW.b);
          indices.push(vertexOffset, vertexOffset + 2, vertexOffset + 1);
          indices.push(vertexOffset, vertexOffset + 3, vertexOffset + 2);
          vertexOffset += 4;
        }
      }
    }
  }

  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
