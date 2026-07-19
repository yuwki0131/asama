import { MAX_ELEVATION } from "@asama/shared";
import type { CellCoord, TerrainCellSnapshot, WorldSnapshot } from "@asama/shared";
import type { LoadedAsset } from "./assets";
import { cellAt, edgeSurfaceHeight, slopeAssetSkin } from "./elevation";
import {
  bridgeCellAssetCandidates,
  buildingAssetCandidates,
  findBuildingAtCell,
  getSnapshotCell,
  isBridgeBuildingType,
  sameCell
} from "./gameRules";
import { terrainFallbackAssetId } from "./terrainLayer";

/** One label/value line of the focus-cell debug panel. */
export interface FocusCellDebugRow {
  readonly label: string;
  readonly value: string;
}

/**
 * Debug rows for the currently focused (hovered, else selected) cell: which
 * asset ids the renderer RESOLVED and ACTUALLY draws there, per layer.
 *
 * The resolution mirrors the real draw paths exactly:
 *   - flat ground   → terrain chunk, candidates [cell.assetId, fallback]
 *                     (terrainLayer.addTerrainSprite)
 *   - slope cells   → scene layer, terrain.slope[.2].<skin>.<dir>[.half]
 *                     (terrainLayer.addSlopeCellSprites)
 *   - cliff cells   → scene layer, face/corner sprites derived from map
 *                     geometry (terrainLayer.addCliffCellSprites)
 *   - buildings     → scene layer, buildingAssetCandidates /
 *                     bridgeCellAssetCandidates (sceneLayer.addBuildingSprite)
 *   - decorations   → scene layer, MapDecoration.assetId
 */
export function focusCellDebugRows(
  snapshot: WorldSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  cell: CellCoord
): readonly FocusCellDebugRow[] {
  const terrainCell = getSnapshotCell(snapshot, cell);
  if (terrainCell === null) {
    return [{ label: "cell", value: `${cell.x},${cell.y} (out of map)` }];
  }

  const rows: FocusCellDebugRow[] = [];
  rows.push({ label: "cell", value: `${cell.x},${cell.y}` });
  rows.push({
    label: "terrain",
    value:
      `${terrainCell.terrain} elev=${terrainCell.elevation} skin=${terrainCell.elevationSkin}` +
      (terrainCell.slope !== null
        ? ` slope=${terrainCell.slope}${terrainCell.slopeHalf !== undefined ? `/${terrainCell.slopeHalf}` : ""}`
        : "")
  });
  // 4-bit same-terrain connection mask, NESW order — the input of the sim's
  // connectedTerrainAssetId auto-tiling (terrain.*.connected.<mask>).
  rows.push({ label: "mask NESW", value: sameTerrainMask(snapshot, terrainCell) });
  rows.push({ label: "cell asset", value: terrainCell.assetId });

  // Ground tile as drawn (flat → terrain chunk; slope → scene layer ramp).
  if (terrainCell.slope !== null) {
    const slopeAssetId =
      terrainCell.slopeHalf === undefined
        ? `terrain.slope.${slopeAssetSkin(terrainCell.elevationSkin)}.${terrainCell.slope.toLowerCase()}`
        : `terrain.slope2.${slopeAssetSkin(terrainCell.elevationSkin)}.${terrainCell.slope.toLowerCase()}.${terrainCell.slopeHalf}`;
    const drawn =
      assets.get(slopeAssetId) !== undefined
        ? slopeAssetId
        : `${resolveDrawn([terrainCell.assetId, terrainFallbackAssetId(terrainCell)], assets)} +ramp-poly (${slopeAssetId} missing)`;
    rows.push({ label: "drawn/scene", value: drawn });
  } else {
    rows.push({
      label: "drawn/chunk",
      value: resolveDrawn([terrainCell.assetId, terrainFallbackAssetId(terrainCell)], assets)
    });
  }

  // Cliff cells additionally draw face/corner sprites in the scene layer.
  for (const faceAssetId of cliffFaceAssetIds(snapshot, terrainCell)) {
    rows.push({
      label: "cliff/scene",
      value: assets.get(faceAssetId) !== undefined ? faceAssetId : `${faceAssetId} → MISSING(fallback poly)`
    });
  }

  const building = findBuildingAtCell(cell, snapshot);
  if (building !== null) {
    rows.push({
      label: "building",
      value: `${building.type} @${building.position.x},${building.position.y} ${building.lifecycleState}` +
        (building.gateState !== null ? ` gate=${building.gateState}` : "")
    });
    rows.push({ label: "bldg asset", value: building.assetId });
    const candidates = isBridgeBuildingType(building.type)
      ? bridgeCellAssetCandidates(building, cell)
      : buildingAssetCandidates(building, snapshot.economy.season);
    rows.push({ label: "bldg drawn", value: resolveDrawn(candidates, assets) });
  }

  const decorations = snapshot.map.decorations.filter((decoration) => sameCell(decoration.position, cell));
  if (decorations.length > 0) {
    rows.push({ label: "deco/scene", value: decorations.map((decoration) => decoration.assetId).join(", ") });
  }

  return rows;
}

/** First candidate id that is actually loaded — i.e. the drawn texture —
 *  matching createSpriteFromCandidates; "MISSING(empty)" = empty texture. */
function resolveDrawn(candidates: readonly string[], assets: ReadonlyMap<string, LoadedAsset>): string {
  for (const assetId of candidates) {
    if (assets.get(assetId) !== undefined) {
      return assetId;
    }
  }
  return "MISSING(empty)";
}

/** Same-terrain neighbour mask in N,E,S,W order (sim cardinalDirections). */
function sameTerrainMask(snapshot: WorldSnapshot, cell: TerrainCellSnapshot): string {
  const directions = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ];
  return directions
    .map((direction) => {
      const neighbour = getSnapshotCell(snapshot, {
        x: cell.coord.x + direction.x,
        y: cell.coord.y + direction.y
      });
      return neighbour?.terrain === cell.terrain ? "1" : "0";
    })
    .join("");
}

/** Face/corner sprite ids a cliff cell renders — mirrors the geometry-derived
 *  face list of terrainLayer.addCliffCellSprites. */
function cliffFaceAssetIds(snapshot: WorldSnapshot, cell: TerrainCellSnapshot): readonly string[] {
  if (cell.cliffFace === undefined || cell.cliffHeight === undefined) {
    return [];
  }

  if (cell.cliffFace === "se") {
    const highCell = cellAt(snapshot.map, cell.coord.x - 1, cell.coord.y - 1);
    if (highCell === null) {
      return [];
    }
    const h = Math.min(cell.cliffHeight, MAX_ELEVATION);
    return [`terrain.${cell.elevationSkin}.corner.se.h${h}`];
  }

  const ids: string[] = [];
  for (const spec of [
    { dx: 0, dy: -1, edge: "s", facing: "S" as const },
    { dx: -1, dy: 0, edge: "e", facing: "E" as const }
  ]) {
    const high = cellAt(snapshot.map, cell.coord.x + spec.dx, cell.coord.y + spec.dy);
    if (high === null) {
      continue;
    }
    const top = edgeSurfaceHeight(high, spec.facing);
    if (top === null) {
      continue;
    }
    const drop = top - cell.elevation;
    if (drop < 1) {
      continue;
    }
    const h = Math.min(drop, MAX_ELEVATION);
    ids.push(`terrain.${high.elevationSkin}.face.${spec.edge}.h${h}`);
  }
  return ids;
}
