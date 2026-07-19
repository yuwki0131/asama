import { buildingSpecs } from "@asama/content";
import type { BuildingSnapshot, BuildingType, CellCoord, Season, TerrainCellSnapshot, WorldSnapshot } from "@asama/shared";

const BUILDING_FOOTPRINTS: Record<BuildingType, readonly CellCoord[]> = Object.fromEntries(
  Object.values(buildingSpecs).map((spec) => [spec.type, rectangleFootprint(spec.footprint.width, spec.footprint.height)])
) as Record<BuildingType, readonly CellCoord[]>;

export function isInsideSnapshotMap(cell: CellCoord, snapshot: WorldSnapshot): boolean {
  return cell.x >= 0 && cell.x < snapshot.map.width && cell.y >= 0 && cell.y < snapshot.map.height;
}

export function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function getSnapshotCell(snapshot: WorldSnapshot | null, cell: CellCoord): TerrainCellSnapshot | null {
  if (snapshot === null || !isInsideSnapshotMap(cell, snapshot)) {
    return null;
  }

  return snapshot.map.cells[cell.y * snapshot.map.width + cell.x] ?? null;
}

export function findBuildingAtCell(cell: CellCoord, snapshot: WorldSnapshot | null): BuildingSnapshot | null {
  return snapshot?.buildings.find((building) => building.footprint.some((footprintCell) => sameCell(footprintCell, cell))) ?? null;
}

export function isSnapshotPassable(snapshot: WorldSnapshot | null, cell: CellCoord): boolean {
  const terrain = getSnapshotCell(snapshot, cell);
  if (terrain === null) {
    return false;
  }

  const building = findBuildingAtCell(cell, snapshot);
  if (building !== null) {
    return building.passable && (terrain.passable || building.type === "earth_bridge" || building.type === "wood_bridge");
  }

  return terrain.passable;
}

export function canPreviewPlaceBuildingCell(snapshot: WorldSnapshot, cell: CellCoord, buildTool: BuildingType): boolean {
  const terrain = getSnapshotCell(snapshot, cell);
  if (terrain === null || findBuildingAtCell(cell, snapshot) !== null) {
    return false;
  }

  const unitAtCell = snapshot.units.some((unit) => sameCell(unit.position, cell));
  if (unitAtCell) {
    return false;
  }

  return terrain.passable || isBridgeBuildTool(buildTool);
}

export function buildingPreviewFootprint(buildingType: BuildingType, position: CellCoord): readonly CellCoord[] {
  return BUILDING_FOOTPRINTS[buildingType].map((offset) => ({
    x: position.x + offset.x,
    y: position.y + offset.y
  }));
}

export function buildingAssetCandidates(building: BuildingSnapshot, season?: Season): readonly string[] {
  // Farms swap texture with the season (spring=flooded, summer=green,
  // autumn=golden, winter=bare soil). The seasonal id leads the candidate
  // list so a missing manifest entry still falls back to the season-less
  // building.farm asset.
  if (building.type === "farm" && season !== undefined) {
    return [
      `building.farm.${season}`,
      building.assetId,
      baseBuildingAssetId(building),
      finalBuildingFallbackAssetId(building)
    ];
  }
  return [building.assetId, baseBuildingAssetId(building), finalBuildingFallbackAssetId(building)];
}

export function isCenterAnchoredBuilding(buildingType: BuildingType): boolean {
  return (
    buildingType === "fence" ||
    buildingType === "wall" ||
    buildingType === "hazama_wall" ||
    isGateType(buildingType) ||
    buildingType === "dry_moat" ||
    buildingType === "water_moat" ||
    buildingType === "honmaru" ||
    buildingType === "farm" ||
    buildingType === "road" ||
    buildingType === "earth_bridge" ||
    buildingType === "wood_bridge"
  );
}

function baseBuildingAssetId(building: BuildingSnapshot): string {
  if (building.type === "fence") {
    return "building.fence.wood";
  }

  if (building.type === "wall" || building.type === "hazama_wall") {
    return "building.wall.plaster";
  }

  if (building.type === "gate_wide_2") {
    return "building.gate.wood.closed.width2";
  }

  if (building.type === "gate_wide_3") {
    return "building.gate.wood.closed.width3";
  }

  if (building.type === "gate_narrow_3") {
    return "building.gate.wood.closed.narrow3";
  }

  if (building.type === "gate_wide_2_ne_sw") {
    return "building.gate.wood.closed.width2";
  }

  if (building.type === "gate_wide_3_ne_sw") {
    return "building.gate.wood.closed.width3";
  }

  if (building.type === "gate_narrow_3_ne_sw") {
    return "building.gate.wood.closed.narrow3";
  }

  if (building.type === "dry_moat") {
    return "building.dry_moat";
  }

  if (building.type === "water_moat") {
    return "building.water_moat";
  }

  if (building.type === "storehouse") {
    return "building.storehouse";
  }

  if (building.type === "market") {
    return "building.market";
  }

  if (building.type === "barracks") {
    return "building.barracks";
  }

  if (building.type === "samurai_residence") {
    return "building.samurai_residence";
  }

  if (building.type === "town_block") {
    return "building.town_block";
  }

  if (building.type === "farm") {
    return "building.farm";
  }

  if (building.type === "road") {
    return "building.road";
  }

  if (building.type === "earth_bridge") {
    return "building.earth_bridge";
  }

  if (building.type === "wood_bridge") {
    return "building.wood_bridge";
  }

  if (building.type === "tenshu") {
    return "building.tenshu.test";
  }

  return "building.honmaru.marker";
}

function finalBuildingFallbackAssetId(building: BuildingSnapshot): string {
  if (building.type === "dry_moat") {
    return "terrain.dirt.base";
  }

  if (building.type === "water_moat") {
    return "terrain.water.base";
  }

  if (building.type === "honmaru") {
    return "overlay.cell.selected";
  }

  return "overlay.cell.blocked";
}

function isBridgeBuildTool(buildTool: BuildingType): boolean {
  return buildTool === "earth_bridge" || buildTool === "wood_bridge";
}

export function isBridgeBuildingType(buildingType: BuildingType): boolean {
  return buildingType === "earth_bridge" || buildingType === "wood_bridge";
}

export type BridgeAxis = "x" | "y";

/**
 * Deck axis of a bridge. The simulation encodes it in the oriented snapshot
 * asset id ("building.earth_bridge.y5"); the footprint shape is the fallback
 * so the renderer stays correct even for plain base ids.
 */
export function bridgeAxis(building: BuildingSnapshot): BridgeAxis {
  const oriented = /\.([xy])\d+$/.exec(building.assetId);
  if (oriented !== null) {
    return oriented[1] as BridgeAxis;
  }
  const footprint = building.footprint;
  if (footprint.length >= 2) {
    return footprint[0]!.x === footprint[1]!.x ? "y" : "x";
  }
  return "x";
}

/**
 * Per-cell asset candidates for a bridge footprint cell (segment-based
 * auto-tiling): the min-coordinate cell along the deck axis is the "start"
 * approach, the max-coordinate cell the "end" approach, everything between
 * a seamless "mid" water crossing. Single-cell bridges use the isolated
 * one-tile asset with abutments on both ends.
 */
export function bridgeCellAssetCandidates(building: BuildingSnapshot, cell: CellCoord): readonly string[] {
  const base = building.type === "earth_bridge" ? "building.earth_bridge" : "building.wood_bridge";
  const axis = bridgeAxis(building);
  const single = axis === "y" ? `${base}.y` : base;
  const footprint = building.footprint;
  if (footprint.length <= 1) {
    return [single, finalBuildingFallbackAssetId(building)];
  }

  const along = (coord: CellCoord): number => (axis === "x" ? coord.x : coord.y);
  let min = along(footprint[0]!);
  let max = min;
  for (const footprintCell of footprint) {
    const value = along(footprintCell);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const value = along(cell);
  const segment = value === min ? "start" : value === max ? "end" : "mid";
  return [`${base}.${axis}.${segment}`, single, finalBuildingFallbackAssetId(building)];
}

/**
 * Screen-px lift of the bridge deck surface above the cell's ground plane,
 * used to draw units standing on the deck instead of sunk into it. Derived
 * from the Blender deck geometry: wood taiko-bashi deck top = WOOD_DECK_Z1 +
 * sori lift at the cell centre (crown 0.225 / ramp 0.176 world z), converted
 * at 40px per elevation LEVEL (5√6/12 world z) ≈ 39.2 px/z. The dobashi deck
 * is a flat causeway at road height (~1px).
 */
export function bridgeDeckLiftAt(building: BuildingSnapshot, cell: CellCoord): number {
  if (building.type === "earth_bridge") {
    return 1;
  }
  const footprint = building.footprint;
  if (footprint.length <= 1) {
    return 9;
  }
  const axis = bridgeAxis(building);
  const along = (coord: CellCoord): number => (axis === "x" ? coord.x : coord.y);
  let min = along(footprint[0]!);
  let max = min;
  for (const footprintCell of footprint) {
    const value = along(footprintCell);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const value = along(cell);
  return value === min || value === max ? 7 : 9;
}

/**
 * Per-cell asset candidates for a honmaru footprint cell. The honmaru lot is
 * rendered as ordinary ground tiles (one sprite per cell) instead of one
 * scaled marker; the connected mask (N,E,S,W bit = neighbour cell is inside
 * the footprint) selects boundary tiles with a stone curb on the outer edges.
 * The single-cell marker asset stays as the fallback (it covers exactly one
 * cell diamond).
 */
export function honmaruCellAssetCandidates(building: BuildingSnapshot, cell: CellCoord): readonly string[] {
  const inside = (x: number, y: number): boolean =>
    building.footprint.some((footprintCell) => footprintCell.x === x && footprintCell.y === y);
  const mask = [
    inside(cell.x, cell.y - 1),
    inside(cell.x + 1, cell.y),
    inside(cell.x, cell.y + 1),
    inside(cell.x - 1, cell.y)
  ]
    .map((bit) => (bit ? "1" : "0"))
    .join("");
  return [`building.honmaru.tile.connected.${mask}`, "building.honmaru.marker", finalBuildingFallbackAssetId(building)];
}

function isNeSwGateType(buildingType: BuildingType): boolean {
  return (
    buildingType === "gate_wide_2_ne_sw" ||
    buildingType === "gate_wide_3_ne_sw" ||
    buildingType === "gate_narrow_3_ne_sw"
  );
}

function isGateType(buildingType: BuildingType): boolean {
  return (
    buildingType === "gate_wide_2" ||
    buildingType === "gate_wide_3" ||
    buildingType === "gate_narrow_3" ||
    isNeSwGateType(buildingType)
  );
}

function rectangleFootprint(width: number, height: number): readonly CellCoord[] {
  const footprint: CellCoord[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      footprint.push({ x, y });
    }
  }
  return footprint;
}
