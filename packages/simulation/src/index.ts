import {
  MAP_HEIGHT,
  MAP_WIDTH,
  type BuildingId,
  type BuildingCategory,
  type BuildingLifecycleState,
  type BuildingSnapshot,
  type BuildingType,
  type CellCoord,
  type EntityId,
  type GateState,
  type OwnerId,
  type PlayerCommand,
  type TerrainCellSnapshot,
  type TerrainType,
  type UnitId,
  type UnitType,
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
  readonly owner: OwnerId;
  readonly type: UnitType;
  position: CellCoord;
  destination: CellCoord | null;
  path: CellCoord[];
  selected: boolean;
  hp: number;
  readonly maxHp: number;
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly attackCooldownTicks: number;
  attackCooldownRemaining: number;
  targetId: EntityId | null;
  attackTargetId: EntityId | null;
  readonly assetId: string;
  readonly ticksPerStep: number;
  movementProgress: number;
}

interface UnitDefinition {
  readonly type: UnitType;
  readonly maxHp: number;
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly attackCooldownTicks: number;
  readonly ticksPerStep: number;
  readonly assetId: string;
}

interface BuildingDefinition {
  readonly type: BuildingType;
  readonly category: BuildingCategory;
  readonly maxHp: number;
  readonly footprint: readonly CellCoord[];
  readonly passable: boolean;
  readonly movementCostModifier: number;
  readonly assetId: string;
  readonly gateState: GateState | null;
}

interface BuildingState {
  readonly id: BuildingId;
  readonly owner: OwnerId;
  readonly type: BuildingType;
  readonly category: BuildingCategory;
  readonly position: CellCoord;
  readonly footprint: readonly CellCoord[];
  hp: number;
  readonly maxHp: number;
  lifecycleState: BuildingLifecycleState;
  gateState: GateState | null;
  readonly passable: boolean;
  readonly movementCostModifier: number;
  readonly assetId: string;
}

interface AttackTarget {
  readonly id: EntityId;
  readonly owner: OwnerId;
  readonly position: CellCoord;
  hp: number;
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

interface SnapshotOptions {
  readonly includeMapCells?: boolean;
}

const ORTHOGONAL_DIRECTIONS: readonly CellCoord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];
const BLOCKED_MOVEMENT_COST = 9999;

const unitDefinitions: Record<UnitType, UnitDefinition> = {
  spear_ashigaru: {
    type: "spear_ashigaru",
    maxHp: 100,
    attackDamage: 14,
    attackRange: 1,
    attackCooldownTicks: Math.round(1.3 * 20),
    ticksPerStep: 6,
    assetId: "unit.ashigaru.idle.south"
  },
  sword_ashigaru: {
    type: "sword_ashigaru",
    maxHp: 110,
    attackDamage: 18,
    attackRange: 1,
    attackCooldownTicks: Math.round(1.1 * 20),
    ticksPerStep: 6,
    assetId: "unit.ashigaru.idle.east"
  },
  archer: {
    type: "archer",
    maxHp: 70,
    attackDamage: 12,
    attackRange: 8,
    attackCooldownTicks: Math.round(1.6 * 20),
    ticksPerStep: 7,
    assetId: "unit.ashigaru.idle.west"
  }
};

export function createInitialWorld(): WorldState {
  const world: WorldState = {
    currentTick: 0,
    nextBuildingId: 1,
    invalidMoveTarget: null,
    map: createInitialMap(),
    units: [
      createUnit("unit:ashigaru:1", "player", "spear_ashigaru", { x: 45, y: 68 }),
      createUnit("unit:ashigaru:2", "player", "sword_ashigaru", { x: 46, y: 68 }),
      createUnit("unit:enemy:1", "enemy", "spear_ashigaru", { x: 86, y: 66 }),
      createUnit("unit:enemy:2", "enemy", "archer", { x: 87, y: 66 })
    ],
    buildings: []
  };

  seedInitialBuildings(world);
  return world;
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
      unit.attackTargetId = null;
      assignedPath = true;
    }

    if (!assignedPath) {
      world.invalidMoveTarget = destination;
      return "No path to that cell";
    }

    world.invalidMoveTarget = null;
    return null;
  }

  if (command.type === "attackTarget") {
    const target = getAttackTarget(world, command.targetId);
    if (target === null) {
      return "No attack target";
    }

    let assignedTarget = false;
    for (const unit of world.units) {
      if (!command.unitIds.includes(unit.id) || !areEnemies(unit.owner, target.owner)) {
        continue;
      }

      unit.attackTargetId = target.id;
      unit.targetId = target.id;
      unit.destination = null;
      unit.path = [];
      unit.movementProgress = 0;
      assignedTarget = true;
    }

    if (!assignedTarget) {
      return "No unit can attack that target";
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
      owner: "player",
      type: command.buildingType,
      category: definition.category,
      position,
      footprint: absoluteFootprint(position, definition.footprint),
      hp: definition.maxHp,
      maxHp: definition.maxHp,
      lifecycleState: "intact",
      gateState: definition.gateState,
      passable: definition.passable,
      movementCostModifier: definition.movementCostModifier,
      assetId: definition.assetId
    });
    world.nextBuildingId += 1;
    world.invalidMoveTarget = null;
    clearUnitPathsThrough(world, absoluteFootprint(position, definition.footprint));
    return null;
  }

  if (command.type === "demolishBuilding") {
    const position = clampCell(command.position);
    const index = world.buildings.findIndex((building) => building.footprint.some((cell) => sameCell(cell, position)));
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

  updateCombat(world);
  world.currentTick += 1;
}

export function snapshotWorld(world: WorldState, options: SnapshotOptions = {}): WorldSnapshot {
  const includeMapCells = options.includeMapCells ?? true;

  return {
    currentTick: world.currentTick,
    invalidMoveTarget: world.invalidMoveTarget,
    map: {
      width: world.map.width,
      height: world.map.height,
      cells: includeMapCells ? world.map.cells.map(snapshotCell) : []
    },
    units: world.units.map((unit) => ({
      id: unit.id,
      owner: unit.owner,
      type: unit.type,
      position: unit.position,
      destination: unit.destination,
      path: unit.path,
      selected: unit.selected,
      hp: unit.hp,
      maxHp: unit.maxHp,
      attackDamage: unit.attackDamage,
      attackRange: unit.attackRange,
      attackCooldownTicks: unit.attackCooldownTicks,
      attackCooldownRemaining: unit.attackCooldownRemaining,
      targetId: unit.targetId,
      assetId: unit.assetId
    })),
    buildings: world.buildings.map((building) => snapshotBuilding(world, building))
  };
}

const oneCellFootprint: readonly CellCoord[] = [{ x: 0, y: 0 }];
const twoCellXFootprint: readonly CellCoord[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 }
];
const threeCellXFootprint: readonly CellCoord[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 }
];

function rectangularFootprint(width: number, height: number): readonly CellCoord[] {
  const footprint: CellCoord[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      footprint.push({ x, y });
    }
  }
  return footprint;
}

const storehouseFootprint = rectangularFootprint(4, 4);
const marketFootprint = rectangularFootprint(6, 4);
const barracksFootprint = rectangularFootprint(6, 4);
const samuraiResidenceFootprint = rectangularFootprint(6, 6);
const townBlockFootprint = rectangularFootprint(8, 8);
const farmFootprint = rectangularFootprint(4, 4);
const tenshuFootprint = rectangularFootprint(8, 8);

const initialBuildingPlacements: readonly {
  readonly type: BuildingType;
  readonly position: CellCoord;
  readonly owner?: OwnerId;
}[] = [
  { type: "tenshu", position: { x: 54, y: 54 } },
  { type: "honmaru", position: { x: 62, y: 58 } },
  { type: "storehouse", position: { x: 47, y: 62 } },
  { type: "market", position: { x: 52, y: 66 } },
  { type: "barracks", position: { x: 60, y: 66 } },
  { type: "samurai_residence", position: { x: 68, y: 55 } },
  { type: "town_block", position: { x: 70, y: 64 } },
  { type: "farm", position: { x: 50, y: 72 } },
  { type: "farm", position: { x: 55, y: 72 } },
  { type: "road", position: { x: 61, y: 64 } },
  { type: "road", position: { x: 62, y: 64 } },
  { type: "road", position: { x: 63, y: 64 } },
  { type: "road", position: { x: 64, y: 65 } },
  { type: "road", position: { x: 65, y: 65 } },
  { type: "road", position: { x: 67, y: 65 } },
  { type: "fence", position: { x: 52, y: 50 } },
  { type: "fence", position: { x: 53, y: 50 } },
  { type: "fence", position: { x: 54, y: 50 } },
  { type: "fence", position: { x: 55, y: 50 } },
  { type: "wall", position: { x: 56, y: 50 } },
  { type: "wall", position: { x: 57, y: 50 } },
  { type: "wall", position: { x: 58, y: 50 } },
  { type: "wall", position: { x: 59, y: 50 } },
  { type: "gate", position: { x: 60, y: 50 } },
  { type: "gate_wide_2", position: { x: 60, y: 74 } },
  { type: "gate_wide_3", position: { x: 64, y: 74 } },
  { type: "dry_moat", position: { x: 80, y: 58 } },
  { type: "dry_moat", position: { x: 80, y: 59 } },
  { type: "dry_moat", position: { x: 80, y: 60 } },
  { type: "water_moat", position: { x: 82, y: 58 } },
  { type: "water_moat", position: { x: 82, y: 59 } },
  { type: "water_moat", position: { x: 82, y: 60 } },
  { type: "earth_bridge", position: { x: 61, y: 44 } },
  { type: "wood_bridge", position: { x: 62, y: 45 } },
  { type: "gate", position: { x: 84, y: 65 }, owner: "enemy" }
];

const buildingDefinitions: Record<BuildingType, BuildingDefinition> = {
  fence: {
    type: "fence",
    category: "castle",
    maxHp: 120,
    footprint: oneCellFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.fence.wood",
    gateState: null
  },
  wall: {
    type: "wall",
    category: "castle",
    maxHp: 260,
    footprint: oneCellFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.wall.plaster",
    gateState: null
  },
  gate: {
    type: "gate",
    category: "castle",
    maxHp: 220,
    footprint: oneCellFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.gate.wood.closed",
    gateState: "closed"
  },
  gate_wide_2: {
    type: "gate_wide_2",
    category: "castle",
    maxHp: 320,
    footprint: twoCellXFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.gate.wood.closed.width2",
    gateState: "closed"
  },
  gate_wide_3: {
    type: "gate_wide_3",
    category: "castle",
    maxHp: 420,
    footprint: threeCellXFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.gate.wood.closed.width3",
    gateState: "closed"
  },
  dry_moat: {
    type: "dry_moat",
    category: "moat",
    maxHp: 9999,
    footprint: oneCellFootprint,
    passable: true,
    movementCostModifier: 5,
    assetId: "building.dry_moat",
    gateState: null
  },
  water_moat: {
    type: "water_moat",
    category: "moat",
    maxHp: 9999,
    footprint: oneCellFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.water_moat",
    gateState: null
  },
  storehouse: {
    type: "storehouse",
    category: "economy",
    maxHp: 180,
    footprint: storehouseFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.storehouse",
    gateState: null
  },
  market: {
    type: "market",
    category: "economy",
    maxHp: 160,
    footprint: marketFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.market",
    gateState: null
  },
  barracks: {
    type: "barracks",
    category: "military",
    maxHp: 220,
    footprint: barracksFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.barracks",
    gateState: null
  },
  samurai_residence: {
    type: "samurai_residence",
    category: "residential",
    maxHp: 190,
    footprint: samuraiResidenceFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.samurai_residence",
    gateState: null
  },
  town_block: {
    type: "town_block",
    category: "residential",
    maxHp: 150,
    footprint: townBlockFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.town_block",
    gateState: null
  },
  farm: {
    type: "farm",
    category: "economy",
    maxHp: 80,
    footprint: farmFootprint,
    passable: true,
    movementCostModifier: 2,
    assetId: "building.farm",
    gateState: null
  },
  road: {
    type: "road",
    category: "infrastructure",
    maxHp: 9999,
    footprint: oneCellFootprint,
    passable: true,
    movementCostModifier: 0,
    assetId: "building.road",
    gateState: null
  },
  earth_bridge: {
    type: "earth_bridge",
    category: "infrastructure",
    maxHp: 220,
    footprint: oneCellFootprint,
    passable: true,
    movementCostModifier: 0,
    assetId: "building.earth_bridge",
    gateState: null
  },
  wood_bridge: {
    type: "wood_bridge",
    category: "infrastructure",
    maxHp: 140,
    footprint: oneCellFootprint,
    passable: true,
    movementCostModifier: 1,
    assetId: "building.wood_bridge",
    gateState: null
  },
  honmaru: {
    type: "honmaru",
    category: "objective",
    maxHp: 9999,
    footprint: oneCellFootprint,
    passable: true,
    movementCostModifier: 1,
    assetId: "building.honmaru.marker",
    gateState: null
  },
  tenshu: {
    type: "tenshu",
    category: "objective",
    maxHp: 9999,
    footprint: tenshuFootprint,
    passable: false,
    movementCostModifier: BLOCKED_MOVEMENT_COST,
    assetId: "building.tenshu.test",
    gateState: null
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

function createUnit(id: UnitId, owner: OwnerId, type: UnitType, position: CellCoord): UnitState {
  const definition = unitDefinitions[type];
  return {
    id,
    owner,
    type,
    position,
    destination: null,
    path: [],
    selected: false,
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    attackDamage: definition.attackDamage,
    attackRange: definition.attackRange,
    attackCooldownTicks: definition.attackCooldownTicks,
    attackCooldownRemaining: 0,
    targetId: null,
    attackTargetId: null,
    assetId: definition.assetId,
    ticksPerStep: definition.ticksPerStep,
    movementProgress: 0
  };
}

function updateCombat(world: WorldState): void {
  for (const unit of world.units) {
    unit.targetId = null;
    if (unit.attackCooldownRemaining > 0) {
      unit.attackCooldownRemaining -= 1;
    }
  }

  updateAttackMovement(world);

  for (const unit of world.units) {
    if (unit.hp <= 0 || unit.attackCooldownRemaining > 0) {
      continue;
    }

    const target = unit.attackTargetId === null ? nearestEnemyInRange(world, unit) : attackTargetInRange(world, unit);
    if (target === null) {
      continue;
    }

    target.hp -= damageAgainst(unit);
    unit.targetId = target.id;
    unit.attackCooldownRemaining = unit.attackCooldownTicks;
  }

  removeDeadEntities(world);
}

function updateAttackMovement(world: WorldState): void {
  for (const unit of world.units) {
    if (unit.attackTargetId === null || unit.hp <= 0) {
      continue;
    }

    const target = getAttackTarget(world, unit.attackTargetId);
    if (target === null || !areEnemies(unit.owner, target.owner)) {
      unit.attackTargetId = null;
      unit.targetId = null;
      unit.path = [];
      unit.destination = null;
      unit.movementProgress = 0;
      continue;
    }

    unit.targetId = target.id;
    if (manhattan(unit.position, target.position) <= unit.attackRange) {
      unit.path = [];
      unit.destination = null;
      unit.movementProgress = 0;
      continue;
    }

    if (unit.path.length === 0) {
      const path = findPathToAttackRange(world, unit.position, target.position, unit.attackRange);
      unit.path = path;
      unit.destination = path.at(-1) ?? null;
      unit.movementProgress = 0;
    }
  }
}

function attackTargetInRange(world: WorldState, attacker: UnitState): AttackTarget | null {
  if (attacker.attackTargetId === null) {
    return null;
  }

  const target = getAttackTarget(world, attacker.attackTargetId);
  if (target === null || !areEnemies(attacker.owner, target.owner)) {
    attacker.attackTargetId = null;
    return null;
  }

  return manhattan(attacker.position, target.position) <= attacker.attackRange ? target : null;
}

function nearestEnemyInRange(world: WorldState, attacker: UnitState): AttackTarget | null {
  let nearest: AttackTarget | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of world.units) {
    if (candidate.hp <= 0 || !areEnemies(attacker.owner, candidate.owner)) {
      continue;
    }

    const distance = manhattan(attacker.position, candidate.position);
    if (distance <= attacker.attackRange && distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function getAttackTarget(world: WorldState, targetId: EntityId): AttackTarget | null {
  const unit = world.units.find((candidate) => candidate.id === targetId && candidate.hp > 0);
  if (unit !== undefined) {
    return unit;
  }

  const building = world.buildings.find(
    (candidate) => candidate.id === targetId && candidate.lifecycleState === "intact" && candidate.hp > 0
  );
  return building ?? null;
}

function areEnemies(a: OwnerId, b: OwnerId): boolean {
  return a !== b && a !== "neutral" && b !== "neutral";
}

function damageAgainst(attacker: UnitState): number {
  let multiplier = 1;

  return Math.max(1, Math.round(attacker.attackDamage * multiplier));
}

function removeDeadEntities(world: WorldState): void {
  const deadUnitIds = new Set(world.units.filter((unit) => unit.hp <= 0).map((unit) => unit.id));
  const deadBuildingIds = new Set(world.buildings.filter((building) => building.hp <= 0).map((building) => building.id));
  if (deadUnitIds.size === 0 && deadBuildingIds.size === 0) {
    return;
  }

  world.units = world.units.filter((unit) => unit.hp > 0);
  world.buildings = world.buildings.filter((building) => building.hp > 0);
  for (const unit of world.units) {
    if (unit.targetId !== null && (deadUnitIds.has(unit.targetId) || deadBuildingIds.has(unit.targetId))) {
      unit.targetId = null;
    }
    if (
      unit.attackTargetId !== null &&
      (deadUnitIds.has(unit.attackTargetId) || deadBuildingIds.has(unit.attackTargetId))
    ) {
      unit.attackTargetId = null;
      unit.destination = null;
      unit.path = [];
      unit.movementProgress = 0;
    }
  }
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

function findPathToAttackRange(world: WorldState, start: CellCoord, target: CellCoord, range: number): CellCoord[] {
  const candidates: CellCoord[] = [];
  for (let y = Math.max(0, target.y - range); y <= Math.min(MAP_HEIGHT - 1, target.y + range); y += 1) {
    for (let x = Math.max(0, target.x - range); x <= Math.min(MAP_WIDTH - 1, target.x + range); x += 1) {
      const candidate = { x, y };
      if (manhattan(candidate, target) <= range && isPassable(world, candidate)) {
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => {
    const distanceA = manhattan(start, a);
    const distanceB = manhattan(start, b);
    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }
    return cellKey(a).localeCompare(cellKey(b));
  });

  for (const candidate of candidates) {
    const path = findPath(world, start, candidate);
    if (path.length > 0 || sameCell(start, candidate)) {
      return path;
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
  if (!isInsideMap(coord)) {
    return false;
  }

  if (getUnitAt(world, coord) !== null) {
    return false;
  }

  const cell = getCell(world, coord);
  const building = getBuildingAt(world, coord);
  if (building !== null) {
    return building.passable && (cell.passable || isBridge(building.type));
  }

  return cell.passable;
}

function movementCostAt(world: WorldState, coord: CellCoord): number {
  const terrainCost = getCell(world, coord).movementCost;
  const building = getBuildingAt(world, coord);
  return terrainCost + (building?.movementCostModifier ?? 0);
}

function getUnitAt(world: WorldState, coord: CellCoord): UnitState | null {
  return world.units.find((unit) => unit.hp > 0 && sameCell(unit.position, coord)) ?? null;
}

function canPlaceBuilding(world: WorldState, position: CellCoord, definition: BuildingDefinition): boolean {
  const footprint = absoluteFootprint(position, definition.footprint);
  return footprint.every((cell) => canPlaceOnCell(world, cell, definition));
}

function seedInitialBuildings(world: WorldState): void {
  for (const placement of initialBuildingPlacements) {
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

function createBuildingState(
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
    assetId: definition.assetId
  };
}

function getBuildingAt(world: WorldState, coord: CellCoord): BuildingState | null {
  return (
    world.buildings.find(
      (building) => building.lifecycleState === "intact" && building.footprint.some((cell) => sameCell(cell, coord))
    ) ?? null
  );
}

function clearUnitPathsThrough(world: WorldState, footprint: readonly CellCoord[]): void {
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

function absoluteFootprint(position: CellCoord, footprint: readonly CellCoord[]): CellCoord[] {
  return footprint.map((offset) => ({
    x: position.x + offset.x,
    y: position.y + offset.y
  }));
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

function snapshotBuilding(world: WorldState, building: BuildingState): BuildingSnapshot {
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
    assetId: connectedBuildingAssetId(world, building)
  };
}

function connectedBuildingAssetId(world: WorldState, building: BuildingState): string {
  const family = connectedAssetFamily(building.type);
  if (family === null) {
    return building.assetId;
  }

  const mask = connectionMask(world, building);
  return `${family}.connected.${mask}`;
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

  return null;
}

function connectionMask(world: WorldState, building: BuildingState): string {
  const directions = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ];

  return directions
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

  return world.buildings.some(
    (neighbor) =>
      neighbor.lifecycleState === "intact" &&
      isGate(neighbor.type) &&
      neighbor.footprint.some((cell) =>
        sameCell(cell, {
          x: building.position.x + direction.x,
          y: building.position.y + direction.y
        })
      )
  );
}

function connectsTo(building: BuildingState, neighbor: BuildingState | null): boolean {
  if (neighbor === null || neighbor.lifecycleState !== "intact") {
    return false;
  }

  if (building.type === "fence") {
    return neighbor.type === "fence" || isGate(neighbor.type);
  }

  if (building.type === "wall") {
    return neighbor.type === "wall" || isGate(neighbor.type);
  }

  return building.type === neighbor.type && (building.type === "dry_moat" || building.type === "water_moat");
}

function isGate(type: BuildingType): boolean {
  return type === "gate" || type === "gate_wide_2" || type === "gate_wide_3";
}

function isBridge(type: BuildingType): boolean {
  return type === "earth_bridge" || type === "wood_bridge";
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
