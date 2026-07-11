import {
  MAP_HEIGHT,
  MAP_WIDTH,
  type BuildingCategory,
  type BuildingId,
  type BuildingLifecycleState,
  type BuildingType,
  type CellCoord,
  type CombatEventSnapshot,
  type ElevationSkin,
  type EngineerTaskKind,
  type EntityId,
  type GameOutcome,
  type GateState,
  type MapDecoration,
  type OwnerId,
  type ScenarioDefinition,
  type ScenarioWave,
  type Season,
  type SlopeDirection,
  type SlopeHalf,
  type TerrainType,
  type UnitId,
  type UnitType
} from "@asama/shared";

export interface TerrainCellState {
  readonly coord: CellCoord;
  readonly terrain: TerrainType;
  readonly movementCost: number;
  readonly passable: boolean;
  readonly assetId: string;
  /** Discrete height 0..MAX_ELEVATION (elevation-contract.md). */
  readonly elevation: number;
  /** Ramp toward this direction (+1 level); side edges are cliffs. */
  readonly slope: SlopeDirection | null;
  /** 2-cell gentle slope half (slope cells only); undefined = 1-cell slope. */
  readonly slopeHalf?: SlopeHalf;
  /** Skin for cliff faces / slope tiles around this cell. */
  readonly elevationSkin: ElevationSkin;
  /** cliff cells only: which face this cell renders ("s" | "e" | "se"). */
  readonly cliffFace?: "s" | "e" | "se";
  /** cliff cells only: elevation drop from the adjacent high cell. */
  readonly cliffHeight?: number;
}

export interface UnitState {
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
  /** Ticks to wait before retrying a failed path search (A* throttling). */
  pathRetryCooldown: number;
  /** Active engineer work order (ladder or moat fill). */
  task: { kind: EngineerTaskKind; target: CellCoord; progress: number } | null;
  /** Attack-move order: advance here, engaging enemies encountered on the way. */
  attackMoveDestination: CellCoord | null;
}

export interface UnitDefinition {
  readonly type: UnitType;
  readonly maxHp: number;
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly attackCooldownTicks: number;
  readonly ticksPerStep: number;
  readonly assetId: string;
}

export interface BuildingDefinition {
  readonly type: BuildingType;
  readonly category: BuildingCategory;
  readonly maxHp: number;
  readonly footprint: readonly CellCoord[];
  readonly passable: boolean;
  readonly movementCostModifier: number;
  readonly assetId: string;
  readonly gateState: GateState | null;
}

export interface BuildingState {
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
  passable: boolean;
  movementCostModifier: number;
  readonly assetId: string;
  food: number | null;
  readonly foodCapacity: number | null;
  /** Attached siege ladder; while present the wall is climbable. */
  ladderHp: number | null;
  /** Accumulated moat-fill work (engineer ticks). */
  fillProgress: number;
}

export interface AttackTarget {
  readonly id: EntityId;
  readonly owner: OwnerId;
  readonly position: CellCoord;
  hp: number;
}

export interface WorldState {
  currentTick: number;
  nextBuildingId: number;
  invalidMoveTarget: CellCoord | null;
  outcome: GameOutcome | null;
  nextWaveIndex: number;
  /** Incremented by each successful terrain-modification command so the
   *  renderer can detect when to rebuild terrain chunks. */
  terrainRevision: number;
  scenario: {
    waves: readonly ScenarioWave[];
    victory: ScenarioDefinition["victory"];
  };
  /** Deterministic RNG state (LCG); seeded at world creation. */
  rngState: number;
  food: FoodState;
  economy: EconomyState;
  supplyState: SupplyState;
  map: {
    width: number;
    height: number;
    cells: TerrainCellState[];
    decorations: MapDecoration[];
  };
  units: UnitState[];
  buildings: BuildingState[];
  /** Combat events accumulated since the last snapshot; snapshotWorld drains
   *  this buffer so each event reaches the snapshot consumer exactly once. */
  combatEvents: CombatEventSnapshot[];
}

export interface FoodState {
  /** Storehouse ids connected to the honmaru at the last connectivity check. */
  connectedStorehouseIds: BuildingId[];
  nextConnectivityCheckTick: number;
  nextConsumptionTick: number;
}

export interface SupplyState {
  /** Becomes true once at least one enemy supply_cart has existed (never resets). */
  hasHadCart: boolean;
  /** True while the retreat countdown is running. */
  retreatTimerActive: boolean;
  /** Ticks remaining on the retreat countdown (meaningful only when active). */
  retreatTimerRemaining: number;
}

export interface EconomyState {
  gold: number;
  weapons: number;
  population: number;
  recruitPool: number;
  /** Farms registered at the spring planting cut for this year's harvest. */
  plantedFarmIds: BuildingId[];
  lastProcessedMonth: number;
  lastProcessedSeason: number;
}

// Provisional economy balance (docs/02_game-rules/population-and-economy.md,
// seasons-and-harvest.md). Unresolved numbers stay parameterized here.
// Wood and stone have no sink yet (construction costs are unimplemented), so
// they are deferred; see docs/10_development/unresolved-issues.md.
export const ECONOMY_BALANCE = {
  seasonTicks: 225 * 20,
  monthTicks: 75 * 20,
  initialGold: 120,
  initialWeapons: 6,
  initialPopulation: 40,
  populationPerTownCell: 2,
  populationGrowthPerMonth: 6,
  farmGrowthBonusPerFarm: 0.15,
  /** MVP treats nengu and tax as one fixed burden rate. */
  taxRate: 0.3,
  taxCoefficient: 1.0,
  mobilizationRate: 0.15,
  recruitPoolRecoveryPerMonth: 3,
  farmHarvestYield: 160,
  recruitCosts: {
    spear_ashigaru: { gold: 20, weapons: 1 },
    sword_ashigaru: { gold: 28, weapons: 1 },
    archer: { gold: 32, weapons: 1 },
    engineer: { gold: 30, weapons: 0 },
    musketeer: { gold: 40, weapons: 2 },
    cavalry: { gold: 50, weapons: 1 }
    // supply_cart is enemy-only and cannot be recruited
  },
  market: {
    foodLot: 50,
    foodBuyPrice: 30,
    foodSellPrice: 15,
    weaponsLot: 5,
    weaponsBuyPrice: 40
  }
} as const;

export const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];

// Provisional balance values; unresolved numbers stay parameterized here
// (docs/10_development/unresolved-issues.md).
export const FOOD_BALANCE = {
  storehouseCapacity: 800,
  storehouseInitialFood: 600,
  foodPerUnitPerCycle: 2,
  consumptionCycleTicks: 30 * 20,
  connectivityMinTicks: 8 * 20,
  connectivityMaxTicks: 12 * 20
} as const;

export const ENEMY_AI = {
  decisionIntervalTicks: 40,
  aggroRange: 12
} as const;

// Provisional siege values (docs/03_combat/siege-system.md).
export const SIEGE_BALANCE = {
  ladderBuildTicks: 60,
  ladderHp: 60,
  ladderMoveCost: 4,
  moatFillTicks: 300,
  /** Interrupted moat work keeps its progress (spec-recommended default). */
  preserveProgressOnInterrupt: true,
  /** Ticks from supply-cart annihilation to enemy retreat (4800 = 4 min at 20 tps). */
  supplyRetreatTicks: 4800
} as const;

/** Building types the assault AI will breach when its route is blocked.
 * Moats and objective buildings are indestructible terrain-like markers and
 * must never be targeted. */
export const BREACHABLE_BUILDING_TYPES: readonly BuildingType[] = [
  "wall",
  "fence",
  "gate",
  "gate_wide_2",
  "gate_wide_3",
  "gate_ne_sw",
  "gate_wide_2_ne_sw",
  "gate_wide_3_ne_sw"
];

/** Compatibility export: the default scenario's waves (tests, tooling). */
export const WORLD_RNG_SEED = 0x6d2b79f5;

export interface SnapshotOptions {
  readonly includeMapCells?: boolean;
}

export const ORTHOGONAL_DIRECTIONS: readonly CellCoord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];
export const BLOCKED_MOVEMENT_COST = 9999;

/** Gold costs for player terrain-modification commands. */
export const TERRAIN_COSTS = {
  raiseTerrain: 50,
  lowerTerrain: 20,
  placeSlope: 30,
  /** Gentle 2-cell ramp (placeSlope with length 2). */
  placeSlopeGentle: 50,
  removeSlope: 10
} as const;

// Unit stats live in @asama/content; the simulation derives tick-based
// cooldowns from the content's seconds.

export function nextRandom(world: WorldState): number {
  // Deterministic LCG (Numerical Recipes constants); state lives in the
  // world so save/load reproduces the same sequence.
  world.rngState = (Math.imul(world.rngState, 1664525) + 1013904223) >>> 0;
  return world.rngState / 0x100000000;
}

export function intactBuildingsOfType(world: WorldState, type: BuildingType): BuildingState[] {
  return world.buildings.filter((building) => building.type === type && building.lifecycleState === "intact");
}

export function isInsideMap(coord: CellCoord): boolean {
  return coord.x >= 0 && coord.x < MAP_WIDTH && coord.y >= 0 && coord.y < MAP_HEIGHT;
}

export function clampCell(cell: CellCoord): CellCoord {
  return {
    x: Math.max(0, Math.min(MAP_WIDTH - 1, Math.round(cell.x))),
    y: Math.max(0, Math.min(MAP_HEIGHT - 1, Math.round(cell.y)))
  };
}

export const cardinalDirections: readonly CellCoord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
];

export function isGate(type: BuildingType): boolean {
  return (
    type === "gate" ||
    type === "gate_wide_2" ||
    type === "gate_wide_3" ||
    type === "gate_ne_sw" ||
    type === "gate_wide_2_ne_sw" ||
    type === "gate_wide_3_ne_sw"
  );
}

export function isNeSwGate(type: BuildingType): boolean {
  return type === "gate_ne_sw" || type === "gate_wide_2_ne_sw" || type === "gate_wide_3_ne_sw";
}

export function isBridge(type: BuildingType): boolean {
  return type === "earth_bridge" || type === "wood_bridge";
}

export function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattan(a: CellCoord, b: CellCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function cellKey(cell: CellCoord): string {
  return `${cell.x},${cell.y}`;
}
