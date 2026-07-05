import { buildingSpecs } from "@asama/content";
import type { BuildingSnapshot, BuildingType, CellCoord, OwnerId, ScenarioDefinition, TerrainCellSnapshot } from "@asama/shared";
import {
  BLOCKED_MOVEMENT_COST,
  FOOD_BALANCE,
  SIEGE_BALANCE,
  cardinalDirections,
  isBridge,
  isGate,
  isInsideMap,
  isNeSwGate,
  sameCell
} from "./types";
import type { BuildingDefinition, BuildingState, TerrainCellState, WorldState } from "./types";
import { getCell } from "./map";

function rectangularFootprint(width: number, height: number): readonly CellCoord[] {
  const footprint: CellCoord[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      footprint.push({ x, y });
    }
  }
  return footprint;
}

export const buildingDefinitions: Record<BuildingType, BuildingDefinition> = Object.fromEntries(
  Object.values(buildingSpecs).map((spec) => [
    spec.type,
    {
      type: spec.type,
      category: spec.category,
      maxHp: spec.maxHp,
      footprint: rectangularFootprint(spec.footprint.width, spec.footprint.height),
      passable: spec.passable,
      movementCostModifier: spec.movementCostModifier ?? (spec.passable ? 1 : BLOCKED_MOVEMENT_COST),
      assetId: spec.assetId,
      gateState: spec.gateState
    }
  ])
) as Record<BuildingType, BuildingDefinition>;

export function canPlaceBuilding(world: WorldState, position: CellCoord, definition: BuildingDefinition): boolean {
  const footprint = absoluteFootprint(position, definition.footprint);
  return footprint.every((cell) => canPlaceOnCell(world, cell, definition));
}

export function seedInitialBuildings(world: WorldState, scenario: ScenarioDefinition): void {
  for (const placement of scenario.initialBuildings) {
    const definition = buildingDefinitions[placement.type];
    if (definition === undefined) {
      throw new Error(`Unknown initial building type: ${placement.type}`);
    }

    if (!canPlaceBuilding(world, placement.position, definition)) {
      throw new Error(`Cannot place initial building ${placement.type} at ${placement.position.x},${placement.position.y}`);
    }

    world.buildings.push(createBuildingState(world, placement.type, placement.position, definition, placement.owner ?? "player"));
    world.nextBuildingId += 1;
  }
}

export function createBuildingState(
  world: WorldState,
  type: BuildingType,
  position: CellCoord,
  definition: BuildingDefinition,
  owner: OwnerId
): BuildingState {
  return {
    id: `building:${world.nextBuildingId}`,
    owner,
    type,
    category: definition.category,
    position,
    footprint: absoluteFootprint(position, definition.footprint),
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    lifecycleState: "intact",
    gateState: definition.gateState,
    passable: definition.passable,
    movementCostModifier: definition.movementCostModifier,
    assetId: definition.assetId,
    food: type === "storehouse" ? FOOD_BALANCE.storehouseInitialFood : null,
    foodCapacity: type === "storehouse" ? FOOD_BALANCE.storehouseCapacity : null,
    ladderHp: null,
    fillProgress: 0
  };
}

export function getBuildingAt(world: WorldState, coord: CellCoord): BuildingState | null {
  return (
    world.buildings.find(
      (building) => building.lifecycleState === "intact" && building.footprint.some((cell) => sameCell(cell, coord))
    ) ?? null
  );
}

export function clearUnitPathsThrough(world: WorldState, footprint: readonly CellCoord[]): void {
  for (const unit of world.units) {
    if (unit.path.some((step) => footprint.some((cell) => sameCell(step, cell)))) {
      unit.path = [];
      unit.destination = null;
      unit.movementProgress = 0;
    }
  }
}

function canPlaceOnCell(world: WorldState, cell: CellCoord, definition: BuildingDefinition): boolean {
  if (!isInsideMap(cell) || getBuildingAt(world, cell) !== null) {
    return false;
  }

  if (world.units.some((unit) => sameCell(unit.position, cell))) {
    return false;
  }

  const terrain = getCell(world, cell);
  if (!terrain.passable && definition.type !== "honmaru" && !isBridge(definition.type)) {
    return false;
  }

  return true;
}

export function absoluteFootprint(position: CellCoord, footprint: readonly CellCoord[]): CellCoord[] {
  return footprint.map((offset) => ({
    x: position.x + offset.x,
    y: position.y + offset.y
  }));
}

export function snapshotCell(cell: TerrainCellState): TerrainCellSnapshot {
  return {
    coord: cell.coord,
    terrain: cell.terrain,
    movementCost: cell.movementCost,
    passable: cell.passable,
    assetId: cell.assetId
  };
}

export function snapshotBuilding(world: WorldState, building: BuildingState): BuildingSnapshot {
  return {
    id: building.id,
    owner: building.owner,
    type: building.type,
    category: building.category,
    position: building.position,
    footprint: building.footprint,
    hp: building.hp,
    maxHp: building.maxHp,
    lifecycleState: building.lifecycleState,
    gateState: building.gateState,
    passable: building.passable,
    movementCostModifier: building.movementCostModifier,
    assetId: connectedBuildingAssetId(world, building),
    food: building.food,
    foodCapacity: building.foodCapacity,
    connectedToHonmaru: world.food.connectedStorehouseIds.includes(building.id),
    ladderHp: building.ladderHp,
    fillProgress: building.fillProgress
  };
}

export function connectedBuildingAssetId(world: WorldState, building: BuildingState): string {
  if (isGate(building.type)) {
    return connectedGateAssetId(world, building);
  }

  const family = connectedAssetFamily(building.type);
  if (family === null) {
    return building.assetId;
  }

  const mask = connectionMask(world, building);

  // Moat interiors carry world-phased / seed-varied textures so straight
  // runs read as one continuous excavation instead of a repeating tile.
  if (building.type === "dry_moat" || building.type === "water_moat") {
    if (mask === "0101") {
      const phase = ((building.position.x % 4) + 4) % 4;
      return phase === 0 ? `${family}.connected.${mask}` : `${family}.connected.${mask}.p${phase}`;
    }
    if (mask === "1010") {
      const phase = ((building.position.y % 4) + 4) % 4;
      return phase === 0 ? `${family}.connected.${mask}` : `${family}.connected.${mask}.p${phase}`;
    }
    let h = (building.position.x * 374761393 + building.position.y * 668265263 + 77003) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return h % 2 === 0 ? `${family}.connected.${mask}` : `${family}.connected.${mask}.v1`;
  }

  return `${family}.connected.${mask}`;
}

function connectedGateAssetId(world: WorldState, gate: BuildingState): string {
  const orientation = isNeSwGate(gate.type) ? "ne_sw" : "nw_se";
  const width = gate.footprint.length;
  const state = gate.gateState ?? "closed";
  return `building.gate.wood.${state}.${orientation}.width${width}.connected.${gateConnectionMask(world, gate)}`;
}

function gateConnectionMask(world: WorldState, gate: BuildingState): string {
  const endpointCells = gateEndpointNeighborCells(gate);
  return cardinalDirections
    .map((_, index) => {
      const endpoint = endpointCells[index];
      return endpoint != null && getBuildingAt(world, endpoint)?.type === "wall" ? "1" : "0";
    })
    .join("");
}

function connectedAssetFamily(type: BuildingType): string | null {
  if (type === "fence") {
    return "building.fence.wood";
  }

  if (type === "wall") {
    return "building.wall.plaster";
  }

  if (type === "dry_moat") {
    return "building.dry_moat";
  }

  if (type === "water_moat") {
    return "building.water_moat";
  }

  if (type === "road") {
    return "building.road";
  }

  return null;
}

function connectionMask(world: WorldState, building: BuildingState): string {
  return cardinalDirections
    .map((direction) =>
      connectsTo(building, getBuildingAt(world, { x: building.position.x + direction.x, y: building.position.y + direction.y }))
        ? "1"
        : connectsToAdjacentGateFootprint(world, building, direction)
        ? "1"
        : "0"
    )
    .join("");
}

function connectsToAdjacentGateFootprint(world: WorldState, building: BuildingState, direction: CellCoord): boolean {
  if (building.type !== "fence" && building.type !== "wall") {
    return false;
  }

  const target = {
    x: building.position.x + direction.x,
    y: building.position.y + direction.y
  };
  return world.buildings.some((neighbor) => {
    if (neighbor.lifecycleState !== "intact" || !isGate(neighbor.type)) {
      return false;
    }

    return gateEndpointNeighborCells(neighbor).some(
      (endpoint) => endpoint !== null && sameCell(endpoint, building.position) && neighbor.footprint.some((cell) => sameCell(cell, target))
    );
  });
}

function gateEndpointNeighborCells(gate: BuildingState): readonly (CellCoord | null)[] {
  if (isNeSwGate(gate.type)) {
    const minY = Math.min(...gate.footprint.map((cell) => cell.y));
    const maxY = Math.max(...gate.footprint.map((cell) => cell.y));
    return [
      { x: gate.position.x, y: minY - 1 },
      null,
      { x: gate.position.x, y: maxY + 1 },
      null
    ];
  }

  const minX = Math.min(...gate.footprint.map((cell) => cell.x));
  const maxX = Math.max(...gate.footprint.map((cell) => cell.x));
  return [
    null,
    { x: maxX + 1, y: gate.position.y },
    null,
    { x: minX - 1, y: gate.position.y }
  ];
}

function connectsTo(building: BuildingState, neighbor: BuildingState | null): boolean {
  if (neighbor === null || neighbor.lifecycleState !== "intact") {
    return false;
  }

  if (building.type === "fence") {
    return neighbor.type === "fence";
  }

  if (building.type === "wall") {
    return neighbor.type === "wall";
  }

  return (
    building.type === neighbor.type &&
    (building.type === "dry_moat" || building.type === "water_moat" || building.type === "road")
  );
}

export function attachLadder(wall: BuildingState): void {
  wall.ladderHp = SIEGE_BALANCE.ladderHp;
  wall.passable = true;
  wall.movementCostModifier = SIEGE_BALANCE.ladderMoveCost;
}

export function detachLadder(wall: BuildingState): void {
  wall.ladderHp = null;
  wall.passable = false;
  wall.movementCostModifier = BLOCKED_MOVEMENT_COST;
}
