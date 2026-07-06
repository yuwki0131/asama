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
import { connectedTerrainAssetId, getCell } from "./map";

const LOT_BUILDING_TYPES = new Set<BuildingType>([
  "tenshu", "storehouse", "market", "barracks",
  "samurai_residence", "town_block", "farm", "yagura", "honmaru"
]);

export function isLotBuilding(type: BuildingType): boolean {
  return LOT_BUILDING_TYPES.has(type);
}

export function applyLotCourtyard(world: WorldState, footprint: readonly CellCoord[]): void {
  const footprintSet = new Set(footprint.map(c => `${c.x},${c.y}`));
  for (const coord of footprint) {
    const index = coord.y * world.map.width + coord.x;
    const cell = world.map.cells[index];
    if (cell === undefined) continue;
    world.map.cells[index] = { ...cell, assetId: dirtAssetIdForCell(world, coord, footprintSet) };
  }
}

export function restoreLotCourtyard(world: WorldState, footprint: readonly CellCoord[]): void {
  for (const coord of footprint) {
    const index = coord.y * world.map.width + coord.x;
    const cell = world.map.cells[index];
    if (cell === undefined) continue;
    world.map.cells[index] = {
      ...cell,
      assetId: connectedTerrainAssetId(world.map.cells, world.map.width, world.map.height, cell)
    };
  }
}

function dirtAssetIdForCell(world: WorldState, coord: CellCoord, footprintSet: Set<string>): string {
  const mask = cardinalDirections.map(d => {
    const nx = coord.x + d.x;
    const ny = coord.y + d.y;
    if (nx < 0 || ny < 0 || nx >= world.map.width || ny >= world.map.height) return "0";
    if (footprintSet.has(`${nx},${ny}`)) return "1";
    return world.map.cells[ny * world.map.width + nx]?.terrain === "dirt" ? "1" : "0";
  }).join("");

  if (mask === "1111") {
    const bx = coord.x >> 2;
    const by = coord.y >> 2;
    let h = (bx * 374761393 + by * 668265263 + 1013904223) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return `terrain.dirt.macro.v${h % 2}.${coord.x % 4}.${coord.y % 4}`;
  }

  return `terrain.dirt.connected.${mask}`;
}

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
  if (isBridge(definition.type)) {
    return canPlaceBridgeAt(world, position);
  }
  const footprint = absoluteFootprint(position, definition.footprint);
  return footprint.every((cell) => canPlaceOnCell(world, cell, definition));
}

function canPlaceBridgeAt(world: WorldState, position: CellCoord): boolean {
  if (!isInsideMap(position)) return false;
  if (getCell(world, position).terrain !== "water") return false;

  const orientation = bridgeOrientation(world, position);
  const footprint = bridgeSpan(world, position, orientation);
  if (footprint === null) return false;

  for (const cell of footprint) {
    if (getBuildingAt(world, cell) !== null) return false;
    if (world.units.some(u => sameCell(u.position, cell))) return false;
  }
  return true;
}

export function seedInitialBuildings(world: WorldState, scenario: ScenarioDefinition): void {
  // Pre-collect all bridge positions so auto-span does not extend into a cell
  // that is reserved for an adjacent bridge (e.g. two-wide moat crossings).
  const reservedBridgeCells = new Set<string>(
    scenario.initialBuildings
      .filter(p => isBridge(p.type))
      .map(p => `${p.position.x},${p.position.y}`)
  );

  for (const placement of scenario.initialBuildings) {
    const definition = buildingDefinitions[placement.type];
    if (definition === undefined) {
      throw new Error(`Unknown initial building type: ${placement.type}`);
    }

    if (isBridge(definition.type)) {
      // Auto-span: derive the full bridge footprint from the designated water/moat
      // cell using the same orientation logic as player placement, but stop at
      // cells reserved for adjacent bridges in this scenario.
      const footprint = seedBridgeFootprint(world, placement.position, reservedBridgeCells);
      for (const cell of footprint) {
        if (getBuildingAt(world, cell) !== null) {
          throw new Error(`Cannot place initial bridge ${placement.type} at ${placement.position.x},${placement.position.y}: cell ${cell.x},${cell.y} is occupied`);
        }
      }
      world.buildings.push({
        id: `building:${world.nextBuildingId}`,
        owner: placement.owner ?? "player",
        type: placement.type,
        category: definition.category,
        position: placement.position,
        footprint,
        hp: definition.maxHp,
        maxHp: definition.maxHp,
        lifecycleState: "intact",
        gateState: definition.gateState,
        passable: definition.passable,
        movementCostModifier: definition.movementCostModifier,
        assetId: definition.assetId,
        food: null,
        foodCapacity: null,
        ladderHp: null,
        fillProgress: 0
      });
    } else {
      if (!canPlaceBuilding(world, placement.position, definition)) {
        throw new Error(`Cannot place initial building ${placement.type} at ${placement.position.x},${placement.position.y}`);
      }
      const building = createBuildingState(world, placement.type, placement.position, definition, placement.owner ?? "player");
      world.buildings.push(building);
      if (isLotBuilding(building.type)) {
        applyLotCourtyard(world, building.footprint);
      }
    }
    world.nextBuildingId += 1;
  }
}

function seedBridgeFootprint(
  world: WorldState,
  position: CellCoord,
  reservedBridgeCells: Set<string>
): readonly CellCoord[] {
  const orientation = bridgeOrientation(world, position);
  const footprint = bridgeSpanForSeed(world, position, orientation, reservedBridgeCells);
  return footprint ?? [position];
}

// Like bridgeSpan but stops the endpoint scan when it reaches a cell reserved
// for another bridge in the same scenario (prevents adjacent bridge conflicts).
function bridgeSpanForSeed(
  world: WorldState,
  position: CellCoord,
  orientation: "x" | "y",
  reservedBridgeCells: Set<string>
): CellCoord[] | null {
  const isX = orientation === "x";
  const dimSize = isX ? world.map.width : world.map.height;

  let negIdx = (isX ? position.x : position.y) - 1;
  while (negIdx >= 0) {
    const cell: CellCoord = isX ? { x: negIdx, y: position.y } : { x: position.x, y: negIdx };
    if (getCell(world, cell).terrain !== "water") {
      if (reservedBridgeCells.has(`${cell.x},${cell.y}`)) return null;
      break;
    }
    negIdx--;
  }
  if (negIdx < 0) return null;

  let posIdx = (isX ? position.x : position.y) + 1;
  while (posIdx < dimSize) {
    const cell: CellCoord = isX ? { x: posIdx, y: position.y } : { x: position.x, y: posIdx };
    if (getCell(world, cell).terrain !== "water") {
      if (reservedBridgeCells.has(`${cell.x},${cell.y}`)) return null;
      break;
    }
    posIdx++;
  }
  if (posIdx >= dimSize) return null;

  const length = posIdx - negIdx + 1;
  if (length < 3 || length > 5) return null;

  const negCell: CellCoord = isX ? { x: negIdx, y: position.y } : { x: position.x, y: negIdx };
  const posCell: CellCoord = isX ? { x: posIdx, y: position.y } : { x: position.x, y: posIdx };
  if (!getCell(world, negCell).passable || !getCell(world, posCell).passable) return null;

  const footprint: CellCoord[] = [];
  for (let i = negIdx; i <= posIdx; i++) {
    footprint.push(isX ? { x: i, y: position.y } : { x: position.x, y: i });
  }
  return footprint;
}

export function bridgeAbsoluteFootprint(world: WorldState, position: CellCoord): CellCoord[] {
  const orientation = bridgeOrientation(world, position);
  return bridgeSpan(world, position, orientation) ?? [position];
}

export function createBuildingState(
  world: WorldState,
  type: BuildingType,
  position: CellCoord,
  definition: BuildingDefinition,
  owner: OwnerId
): BuildingState {
  const footprint = absoluteFootprint(position, definition.footprint);
  // Gates always start open; players close them intentionally for defense.
  const gateOpen = isGate(type);
  return {
    id: `building:${world.nextBuildingId}`,
    owner,
    type,
    category: definition.category,
    position,
    footprint,
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    lifecycleState: "intact",
    gateState: gateOpen ? "open" : definition.gateState,
    passable: gateOpen ? true : definition.passable,
    movementCostModifier: gateOpen ? 2 : definition.movementCostModifier,
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

  if (isBridge(building.type)) {
    return bridgeOrientedAssetId(world, building);
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

function bridgeOrientation(world: WorldState, position: CellCoord): "x" | "y" {
  const east = { x: position.x + 1, y: position.y };
  const west = { x: position.x - 1, y: position.y };
  return [east, west].some(coord => isWaterNeighbor(world, coord)) ? "y" : "x";
}

// Expand from the clicked water cell in both directions along the bridge axis
// until landing on non-water (passable land). Returns the full footprint
// (land + water + land) or null if the span is < 3 or > 5 cells.
function bridgeSpan(world: WorldState, position: CellCoord, orientation: "x" | "y"): CellCoord[] | null {
  const isX = orientation === "x";
  const dimSize = isX ? world.map.width : world.map.height;

  let negIdx = (isX ? position.x : position.y) - 1;
  while (negIdx >= 0) {
    const cell: CellCoord = isX ? { x: negIdx, y: position.y } : { x: position.x, y: negIdx };
    if (getCell(world, cell).terrain !== "water") break;
    negIdx--;
  }
  if (negIdx < 0) return null;

  let posIdx = (isX ? position.x : position.y) + 1;
  while (posIdx < dimSize) {
    const cell: CellCoord = isX ? { x: posIdx, y: position.y } : { x: position.x, y: posIdx };
    if (getCell(world, cell).terrain !== "water") break;
    posIdx++;
  }
  if (posIdx >= dimSize) return null;

  const length = posIdx - negIdx + 1;
  if (length < 3 || length > 5) return null;

  const negCell: CellCoord = isX ? { x: negIdx, y: position.y } : { x: position.x, y: negIdx };
  const posCell: CellCoord = isX ? { x: posIdx, y: position.y } : { x: position.x, y: posIdx };
  if (!getCell(world, negCell).passable || !getCell(world, posCell).passable) return null;

  const footprint: CellCoord[] = [];
  for (let i = negIdx; i <= posIdx; i++) {
    footprint.push(isX ? { x: i, y: position.y } : { x: position.x, y: i });
  }
  return footprint;
}

function bridgeOrientedAssetId(world: WorldState, building: BuildingState): string {
  // For legacy single-cell scenario bridges, fall back to "3" so the asset ID
  // remains well-formed; player-placed bridges use actual footprint length (3–5).
  const n = Math.max(3, building.footprint.length);
  return `${building.assetId}.${bridgeOrientation(world, building.position)}${n}`;
}

function isWaterNeighbor(world: WorldState, coord: CellCoord): boolean {
  if (coord.x < 0 || coord.y < 0 || coord.x >= world.map.width || coord.y >= world.map.height) {
    return false;
  }
  if (getCell(world, coord).terrain === "water") return true;
  const neighbor = getBuildingAt(world, coord);
  return neighbor !== null && neighbor.lifecycleState === "intact" &&
    (neighbor.type === "water_moat" || neighbor.type === "dry_moat");
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
