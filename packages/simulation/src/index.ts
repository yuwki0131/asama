import {
  MAP_HEIGHT,
  MAP_WIDTH,
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

export interface WorldState {
  currentTick: number;
  invalidMoveTarget: CellCoord | null;
  map: {
    width: number;
    height: number;
    cells: TerrainCellState[];
  };
  units: UnitState[];
}

const ORTHOGONAL_DIRECTIONS: readonly CellCoord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

export function createInitialWorld(): WorldState {
  return {
    currentTick: 0,
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
    ]
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
    }))
  };
}

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

      const cell = getCell(world, neighbor);
      const tentativeG = current.g + cell.movementCost;
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
  return isInsideMap(coord) && getCell(world, coord).passable;
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

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

function manhattan(a: CellCoord, b: CellCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function cellKey(cell: CellCoord): string {
  return `${cell.x},${cell.y}`;
}
