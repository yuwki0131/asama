import {
  MAP_HEIGHT,
  MAP_WIDTH,
  type BuildingId,
  type BuildingSnapshot,
  type BuildingType,
  type CellCoord,
  type PlayerCommand,
  type TerrainCellSnapshot,
  type TerrainType,
  type UnitId,
  type WorldSnapshot
} from "@asama/shared";

interface TerrainCellState {
  readonly coord: CellCoord;
  readonly terrain: TerrainType;
  readonly movementCost: number;
  readonly passable: boolean;
  readonly assetId: string;
}

interface UnitState {
  readonly id: UnitId;
  position: CellCoord;
  destination: CellCoord | null;
  path: CellCoord[];
  selected: boolean;
  readonly assetId: string;
  readonly ticksPerStep: number;
  movementProgress: number;
}

interface BuildingDefinition {
  readonly type: BuildingType;
  readonly passable: boolean;
  readonly movementCostModifier: number;
  readonly assetId: string;
}

interface BuildingState {
  readonly id: BuildingId;
  readonly type: BuildingType;
  readonly position: CellCoord;
  readonly passable: boolean;
  readonly movementCostModifier: number;
  readonly assetId: string;
}

export interface WorldState {
  currentTick: number;
  nextBuildingId: number;
  invalidMoveTarget: CellCoord | null;
  map: {
    width: number;
    height: number;
    cells: TerrainCellState[];
  };
  units: UnitState[];
  buildings: BuildingState[];
}

const ORTHOGONAL_DIRECTIONS: readonly CellCoord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];
const BLOCKED_MOVEMENT_COST = 9999;

export function createInitialWorld(): WorldState {
  return {
    currentTick: 0,
    nextBuildingId: 1,
    invalidMoveTarget: null,
    map: createInitialMap(),
    units: [
      {
        id: "unit:ashigaru:1",
        position: { x: 64, y: 64 },
        destination: null,
        path: [],
        selected: false,
        assetId: "unit.ashigaru.idle.south",
        ticksPerStep: 6,
        movementProgress: 0
      },
      {
        id: "unit:ashigaru:2",
        position: { x: 66, y: 64 },
        destination: null,
        path: [],
        selected: false,
        assetId: "unit.ashigaru.idle.east",
        ticksPerStep: 6,
        movementProgress: 0
      }
    ],
    buildings: []
  };
}

export function applyCommand(world: WorldState, command: PlayerCommand): string | null {
  if (command.type === "selectUnits") {
    const selected = new Set(command.unitIds);
    for (const unit of world.units) {
      unit.selected = selected.has(unit.id);
    }
    return null;
  }

  if (command.type === "moveUnits") {
    const destination = clampCell(command.destination);
    if (!isPassable(world, destination)) {
      world.invalidMoveTarget = destination;
      return "That cell is not passable";
    }

    let assignedPath = false;
    for (const unit of world.units) {
      if (!command.unitIds.includes(unit.id)) {
        continue;
      }

      const path = findPath(world, unit.position, destination);
      if (path.length === 0 && !sameCell(unit.position, destination)) {
        unit.destination = null;
        unit.path = [];
        unit.movementProgress = 0;
        continue;
      }

      unit.destination = path.length > 0 ? destination : null;
      unit.path = path;
      unit.movementProgress = 0;
      assignedPath = true;
    }

    if (!assignedPath) {
      world.invalidMoveTarget = destination;
      return "No path to that cell";
    }

    world.invalidMoveTarget = null;
    return null;
  }

  if (command.type === "placeBuilding") {
    const position = clampCell(command.position);
    const definition = buildingDefinitions[command.buildingType];
    if (definition === undefined) {
      return "Unknown building type";
    }

    if (!canPlaceBuilding(world, position, definition)) {
      world.invalidMoveTarget = position;
      return "Cannot place building there";
    }

    world.buildings.push({
      id: `building:${world.nextBuildingId}`,
      type: command.buildingType,
      position,
      passable: definition.passable,
      movementCostModifier: definition.movementCostModifier,
      assetId: definition.assetId
    });
    world.nextBuildingId += 1;
    world.invalidMoveTarget = null;
    clearUnitPathsThrough(world, position);
    return null;
  }

  if (command.type === "demolishBuilding") {
    const position = clampCell(command.position);
    const index = world.buildings.findIndex((building) => sameCell(building.position, position));
    if (index === -1) {
      world.invalidMoveTarget = position;
      return "No building to demolish";
    }

    const [building] = world.buildings.splice(index, 1);
    if (building?.type === "honmaru") {
      world.buildings.splice(index, 0, building);
      world.invalidMoveTarget = position;
      return "Honmaru cannot be demolished";
    }

    world.invalidMoveTarget = null;
    return null;
  }

  return null;
}

export function updateWorld(world: WorldState): void {
  for (const unit of world.units) {
    if (unit.path.length === 0) {
      unit.destination = null;
      unit.movementProgress = 0;
      continue;
    }

    unit.movementProgress += 1;
    if (unit.movementProgress < unit.ticksPerStep) {
      continue;
    }

    unit.movementProgress = 0;
    const next = unit.path.shift();
    if (next !== undefined) {
      unit.position = next;
    }

    if (unit.path.length === 0) {
      unit.destination = null;
    }
  }

  world.currentTick += 1;
}

export function snapshotWorld(world: WorldState): WorldSnapshot {
  return {
    currentTick: world.currentTick,
    invalidMoveTarget: world.invalidMoveTarget,
    map: {
      width: world.map.width,
      height: world.map.height,
      cells: world.map.cells.map(snapshotCell)
    },
    units: world.units.map((unit) => ({
      id: unit.id,
      position: unit.position,
      destination: unit.destination,
      path: unit.path,
      selected: unit.selected,
      assetId: unit.assetId
    })),
    buildings: world.buildings.map(snapshotBuilding)
  };
}

const buildingDefinitions: Record<BuildingType, BuildingDefinition> = {
  fence: {
    type: "fence",
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.fence.wood"
  },
  wall: {
    type: "wall",
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.wall.plaster"
  },
  gate: {
    type: "gate",
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.gate.wood.closed"
  },
  dry_moat: {
    type: "dry_moat",
    passable: true,
    movementCostModifier: 5,
    assetId: "building.dry_moat"
  },
  water_moat: {
    type: "water_moat",
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.water_moat"
  },
  storehouse: {
    type: "storehouse",
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.storehouse"
  },
  honmaru: {
    type: "honmaru",
    passable: true,
    movementCostModifier: 1,
    assetId: "building.honmaru.marker"
  }
};

function createInitialMap(): WorldState["map"] {
  const cells: TerrainCellState[] = [];

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      cells.push(createTerrainCell({ x, y }));
    }
  }

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    cells
  };
}

function createTerrainCell(coord: CellCoord): TerrainCellState {
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
  const riverDistance = Math.abs(coord.y - 42 - Math.round(Math.sin(coord.x / 9) * 4));
  if (riverDistance <= 1 && coord.x > 12 && coord.x < MAP_WIDTH - 10) {
    return "water";
  }

  const ridgeDistance = Math.abs(coord.x - 84 - Math.round(Math.cos(coord.y / 11) * 5));
  if (ridgeDistance <= 1 && coord.y > 20 && coord.y < 104) {
    return "stone";
  }

  if ((coord.x + coord.y * 3) % 11 === 0 || (coord.x > 46 && coord.x < 72 && coord.y > 72 && coord.y < 86)) {
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

function findPath(world: WorldState, start: CellCoord, goal: CellCoord): CellCoord[] {
  if (sameCell(start, goal)) {
    return [];
  }

  const open = new Map<string, PathNode>();
  const closed = new Set<string>();
  const nodes = new Map<string, PathNode>();
  const startKey = cellKey(start);
  const startNode = {
    coord: start,
    g: 0,
    f: manhattan(start, goal),
    parentKey: null
  };
  open.set(startKey, startNode);
  nodes.set(startKey, startNode);

  while (open.size > 0) {
    const current = lowestCostNode(open);
    const currentKey = cellKey(current.coord);
    open.delete(currentKey);

    if (sameCell(current.coord, goal)) {
      return reconstructPath(currentKey, nodes);
    }

    closed.add(currentKey);

    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const neighbor = { x: current.coord.x + direction.x, y: current.coord.y + direction.y };
      const neighborKey = cellKey(neighbor);
      if (!isInsideMap(neighbor) || closed.has(neighborKey) || !isPassable(world, neighbor)) {
        continue;
      }

      const tentativeG = current.g + movementCostAt(world, neighbor);
      const known = open.get(neighborKey);
      if (known !== undefined && tentativeG >= known.g) {
        continue;
      }

      const nextNode = {
        coord: neighbor,
        g: tentativeG,
        f: tentativeG + manhattan(neighbor, goal),
        parentKey: currentKey
      };
      open.set(neighborKey, nextNode);
      nodes.set(neighborKey, nextNode);
    }
  }

  return [];
}

interface PathNode {
  readonly coord: CellCoord;
  readonly g: number;
  readonly f: number;
  readonly parentKey: string | null;
}

function lowestCostNode(nodes: Map<string, PathNode>): PathNode {
  let best: PathNode | null = null;
  for (const node of nodes.values()) {
    if (best === null || node.f < best.f || (node.f === best.f && cellKey(node.coord) < cellKey(best.coord))) {
      best = node;
    }
  }

  if (best === null) {
    throw new Error("Cannot select a path node from an empty open set");
  }

  return best;
}

function reconstructPath(goalKey: string, nodes: Map<string, PathNode>): CellCoord[] {
  const path: CellCoord[] = [];
  let current = nodes.get(goalKey);

  while (current !== undefined && current.parentKey !== null) {
    path.push(current.coord);
    current = nodes.get(current.parentKey);
  }

  return path.reverse();
}

function getCell(world: WorldState, coord: CellCoord): TerrainCellState {
  return world.map.cells[coord.y * world.map.width + coord.x] ?? createTerrainCell(coord);
}

function isPassable(world: WorldState, coord: CellCoord): boolean {
  if (!isInsideMap(coord) || !getCell(world, coord).passable) {
    return false;
  }

  const building = getBuildingAt(world, coord);
  return building?.passable ?? true;
}

function movementCostAt(world: WorldState, coord: CellCoord): number {
  const terrainCost = getCell(world, coord).movementCost;
  const building = getBuildingAt(world, coord);
  return terrainCost + (building?.movementCostModifier ?? 0);
}

function canPlaceBuilding(world: WorldState, position: CellCoord, definition: BuildingDefinition): boolean {
  if (!isInsideMap(position) || getBuildingAt(world, position) !== null) {
    return false;
  }

  if (world.units.some((unit) => sameCell(unit.position, position))) {
    return false;
  }

  const terrain = getCell(world, position);
  if (!terrain.passable && definition.type !== "honmaru") {
    return false;
  }

  return true;
}

function getBuildingAt(world: WorldState, coord: CellCoord): BuildingState | null {
  return world.buildings.find((building) => sameCell(building.position, coord)) ?? null;
}

function clearUnitPathsThrough(world: WorldState, position: CellCoord): void {
  for (const unit of world.units) {
    if (unit.path.some((step) => sameCell(step, position))) {
      unit.path = [];
      unit.destination = null;
      unit.movementProgress = 0;
    }
  }
}

function isInsideMap(coord: CellCoord): boolean {
  return coord.x >= 0 && coord.x < MAP_WIDTH && coord.y >= 0 && coord.y < MAP_HEIGHT;
}

function clampCell(cell: CellCoord): CellCoord {
  return {
    x: Math.max(0, Math.min(MAP_WIDTH - 1, Math.round(cell.x))),
    y: Math.max(0, Math.min(MAP_HEIGHT - 1, Math.round(cell.y)))
  };
}

function snapshotCell(cell: TerrainCellState): TerrainCellSnapshot {
  return {
    coord: cell.coord,
    terrain: cell.terrain,
    movementCost: cell.movementCost,
    passable: cell.passable,
    assetId: cell.assetId
  };
}

function snapshotBuilding(building: BuildingState): BuildingSnapshot {
  return {
    id: building.id,
    type: building.type,
    position: building.position,
    passable: building.passable,
    movementCostModifier: building.movementCostModifier,
    assetId: building.assetId
  };
}

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

function manhattan(a: CellCoord, b: CellCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function cellKey(cell: CellCoord): string {
  return `${cell.x},${cell.y}`;
}
