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

  if (building.type === "wall") {
    return "building.wall.plaster";
  }

  if (building.type === "gate") {
    return "building.gate.wood.closed";
  }

  if (building.type === "gate_wide_2") {
    return "building.gate.wood.closed.width2";
  }

  if (building.type === "gate_wide_3") {
    return "building.gate.wood.closed.width3";
  }

  if (building.type === "gate_ne_sw") {
    return "building.gate.wood.closed";
  }

  if (building.type === "gate_wide_2_ne_sw") {
    return "building.gate.wood.closed.width2";
  }

  if (building.type === "gate_wide_3_ne_sw") {
    return "building.gate.wood.closed.width3";
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

function isNeSwGateType(buildingType: BuildingType): boolean {
  return (
    buildingType === "gate_ne_sw" ||
    buildingType === "gate_wide_2_ne_sw" ||
    buildingType === "gate_wide_3_ne_sw"
  );
}

function isGateType(buildingType: BuildingType): boolean {
  return (
    buildingType === "gate" ||
    buildingType === "gate_wide_2" ||
    buildingType === "gate_wide_3" ||
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
