import {
  MAP_HEIGHT,
  MAP_WIDTH,
  SIM_TICKS_PER_SECOND,
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
  type EconomySnapshot,
  type EngineerTaskKind,
  type FoodSnapshot,
  type GameOutcome,
  type MarketTrade,
  type Season,
  type SerializedWorld,
  type UnitId,
  type UnitType,
  type WorldSnapshot
} from "@asama/shared";
import { buildingSpecs, mvpDefenseScenario, unitSpecs } from "@asama/content";
import type { ScenarioDefinition, ScenarioWave } from "@asama/shared";

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
  /** Ticks to wait before retrying a failed path search (A* throttling). */
  pathRetryCooldown: number;
  /** Active engineer work order (ladder or moat fill). */
  task: { kind: EngineerTaskKind; target: CellCoord; progress: number } | null;
  /** Attack-move order: advance here, engaging enemies encountered on the way. */
  attackMoveDestination: CellCoord | null;
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
  outcome: GameOutcome | null;
  nextWaveIndex: number;
  scenario: {
    waves: readonly ScenarioWave[];
    victory: ScenarioDefinition["victory"];
  };
  /** Deterministic RNG state (LCG); seeded at world creation. */
  rngState: number;
  food: FoodState;
  economy: EconomyState;
  map: {
    width: number;
    height: number;
    cells: TerrainCellState[];
  };
  units: UnitState[];
  buildings: BuildingState[];
}

interface FoodState {
  /** Storehouse ids connected to the honmaru at the last connectivity check. */
  connectedStorehouseIds: BuildingId[];
  nextConnectivityCheckTick: number;
  nextConsumptionTick: number;
}

interface EconomyState {
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
    engineer: { gold: 30, weapons: 0 }
  } as Record<UnitType, { readonly gold: number; readonly weapons: number }>,
  market: {
    foodLot: 50,
    foodBuyPrice: 30,
    foodSellPrice: 15,
    weaponsLot: 5,
    weaponsBuyPrice: 40
  }
} as const;

const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];

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

const ENEMY_AI = {
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
  preserveProgressOnInterrupt: true
} as const;

/** Building types the assault AI will breach when its route is blocked.
 * Moats and objective buildings are indestructible terrain-like markers and
 * must never be targeted. */
const BREACHABLE_BUILDING_TYPES: readonly BuildingType[] = [
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
export const ENEMY_WAVES: readonly ScenarioWave[] = mvpDefenseScenario.waves;

const WORLD_RNG_SEED = 0x6d2b79f5;

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

// Unit stats live in @asama/content; the simulation derives tick-based
// cooldowns from the content's seconds.
const unitDefinitions: Record<UnitType, UnitDefinition> = Object.fromEntries(
  Object.values(unitSpecs).map((spec) => [
    spec.type,
    {
      type: spec.type,
      maxHp: spec.maxHp,
      attackDamage: spec.attackDamage,
      attackRange: spec.attackRange,
      attackCooldownTicks: Math.round(spec.attackCooldownSeconds * SIM_TICKS_PER_SECOND),
      ticksPerStep: spec.ticksPerStep,
      assetId: spec.assetId
    }
  ])
) as Record<UnitType, UnitDefinition>;

export function createInitialWorld(scenario: ScenarioDefinition = mvpDefenseScenario): WorldState {
  const world: WorldState = {
    currentTick: 0,
    nextBuildingId: 1,
    invalidMoveTarget: null,
    outcome: null,
    nextWaveIndex: 0,
    scenario: {
      waves: scenario.waves,
      victory: scenario.victory
    },
    rngState: WORLD_RNG_SEED,
    food: {
      connectedStorehouseIds: [],
      nextConnectivityCheckTick: 0,
      nextConsumptionTick: FOOD_BALANCE.consumptionCycleTicks
    },
    economy: {
      gold: ECONOMY_BALANCE.initialGold,
      weapons: ECONOMY_BALANCE.initialWeapons,
      population: ECONOMY_BALANCE.initialPopulation,
      recruitPool: Math.floor(ECONOMY_BALANCE.initialPopulation * ECONOMY_BALANCE.mobilizationRate),
      plantedFarmIds: [],
      lastProcessedMonth: 0,
      lastProcessedSeason: 0
    },
    map: createInitialMap(),
    units: [],
    buildings: []
  };

  seedInitialBuildings(world, scenario);
  // Units spawn after buildings so building placement validation does not
  // reject cells the garrison stands on. A defender standing on the honmaru
  // cell blocks capture (victory-and-defeat.md); the others screen it.
  for (const [index, spawn] of scenario.initialUnits.entries()) {
    world.units.push(createUnit(`unit:init:${index}`, spawn.owner, spawn.type, spawn.position));
  }
  // The world starts at the beginning of spring; farms present now are
  // planted for the first year's harvest.
  world.economy.plantedFarmIds = intactBuildingsOfType(world, "farm").map((farm) => farm.id);
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

    // Group move: each unit receives its own formation slot around the
    // destination so the group arrives arranged instead of stacking.
    const movers = world.units.filter((unit) => command.unitIds.includes(unit.id));
    movers.sort((a, b) => manhattan(a.position, destination) - manhattan(b.position, destination));
    const slots = formationSlots(world, destination, movers.length);

    let assignedPath = false;
    let slotIndex = 0;
    for (const unit of movers) {
      let assigned = false;
      while (slotIndex < slots.length) {
        const slot = slots[slotIndex];
        slotIndex += 1;
        if (slot === undefined) {
          break;
        }
        const path = findPath(world, unit.position, slot);
        if (path.length === 0) {
          continue;
        }
        unit.destination = slot;
        unit.path = path;
        unit.movementProgress = 0;
        unit.attackTargetId = null;
        unit.attackMoveDestination = null;
        assigned = true;
        assignedPath = true;
        break;
      }
      if (!assigned) {
        unit.destination = null;
        unit.path = [];
        unit.movementProgress = 0;
      }
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
      assetId: definition.assetId,
      // Player-built storehouses start empty; stock arrives via harvest or
      // supply carts, not construction.
      food: command.buildingType === "storehouse" ? 0 : null,
      foodCapacity: command.buildingType === "storehouse" ? FOOD_BALANCE.storehouseCapacity : null,
      ladderHp: null,
      fillProgress: 0
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

  if (command.type === "recruitUnit") {
    return applyRecruitCommand(world, command.unitType);
  }

  if (command.type === "toggleGate") {
    const position = clampCell(command.position);
    const gate = world.buildings.find(
      (building) =>
        building.owner === "player" &&
        building.lifecycleState === "intact" &&
        building.gateState !== null &&
        building.footprint.some((cell) => sameCell(cell, position))
    );
    if (gate === undefined) {
      return "No gate there";
    }
    // Note: food connectivity intentionally does not recompute immediately
    // after a gate toggle (food-and-supply.md); the periodic check picks the
    // change up on its own schedule.
    if (gate.gateState === "closed") {
      gate.gateState = "open";
      gate.passable = true;
      gate.movementCostModifier = 2;
    } else {
      gate.gateState = "closed";
      gate.passable = false;
      gate.movementCostModifier = BLOCKED_MOVEMENT_COST;
    }
    clearUnitPathsThrough(world, gate.footprint);
    return null;
  }

  if (command.type === "marketTrade") {
    return applyMarketTrade(world, command.trade);
  }

  if (command.type === "attackMoveUnits") {
    const destination = clampCell(command.destination);
    const rejection = applyCommand(world, {
      type: "moveUnits",
      unitIds: command.unitIds,
      destination,
      issuedAtTick: command.issuedAtTick,
      clientSequence: command.clientSequence
    });
    if (rejection !== null) {
      return rejection;
    }
    for (const unit of world.units) {
      if (command.unitIds.includes(unit.id) && unit.path.length > 0) {
        unit.attackMoveDestination = destination;
      }
    }
    return null;
  }

  if (command.type === "stopUnits") {
    for (const unit of world.units) {
      if (!command.unitIds.includes(unit.id)) {
        continue;
      }
      unit.path = [];
      unit.destination = null;
      unit.movementProgress = 0;
      unit.attackTargetId = null;
      unit.attackMoveDestination = null;
      unit.task = null;
    }
    return null;
  }

  if (command.type === "engineerTask") {
    return applyEngineerTaskCommand(world, command.unitIds, command.task, clampCell(command.position));
  }

  return null;
}

export function updateWorld(world: WorldState): void {
  if (world.outcome !== null) {
    return;
  }

  updateEnemyAi(world);

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
  updateAttackMoveBehavior(world);
  updateEngineerTasks(world);
  updateFoodSupply(world);
  updateEconomy(world);
  checkOutcome(world);
  world.currentTick += 1;
}

// --- Economy (docs/02_game-rules/population-and-economy.md,
// docs/02_game-rules/seasons-and-harvest.md) --------------------------------

function updateEconomy(world: WorldState): void {
  const economy = world.economy;

  const month = Math.floor(world.currentTick / ECONOMY_BALANCE.monthTicks);
  if (month > economy.lastProcessedMonth) {
    economy.lastProcessedMonth = month;
    processMonthlyEconomy(world);
  }

  const season = Math.floor(world.currentTick / ECONOMY_BALANCE.seasonTicks);
  if (season > economy.lastProcessedSeason) {
    // Process each crossed boundary in order so fast-forwarding (load, high
    // speed) never skips a planting or a harvest.
    for (let index = economy.lastProcessedSeason + 1; index <= season; index += 1) {
      processSeasonStart(world, index);
    }
    economy.lastProcessedSeason = season;
  }
}

function processMonthlyEconomy(world: WorldState): void {
  const economy = world.economy;

  // Tax: 税収 = 人口 × 負担率 × 基礎税収係数.
  economy.gold += Math.floor(economy.population * ECONOMY_BALANCE.taxRate * ECONOMY_BALANCE.taxCoefficient);

  // Population growth: room in town blocks, farm base, approval.
  const capacity = populationCapacity(world);
  const room = capacity > 0 ? Math.max(0, 1 - economy.population / capacity) : 0;
  const farmBonus = 1 + intactBuildingsOfType(world, "farm").length * ECONOMY_BALANCE.farmGrowthBonusPerFarm;
  const growth = Math.floor(ECONOMY_BALANCE.populationGrowthPerMonth * room * farmBonus * currentApproval());
  economy.population = Math.min(capacity > 0 ? capacity : economy.population, economy.population + growth);

  // Recruit pool recovers monthly, capped by mobilizable population.
  economy.recruitPool = Math.min(
    maxRecruitPool(world),
    economy.recruitPool + ECONOMY_BALANCE.recruitPoolRecoveryPerMonth
  );
}

function processSeasonStart(world: WorldState, seasonIndex: number): void {
  const season = SEASONS[seasonIndex % SEASONS.length];
  if (season === "spring") {
    // Planting cut: farms existing now are harvested this year.
    world.economy.plantedFarmIds = intactBuildingsOfType(world, "farm").map((farm) => farm.id);
  }
  if (season === "winter") {
    // Entering winter means autumn just ended: harvest in bulk.
    harvestFarms(world);
  }
}

function harvestFarms(world: WorldState): void {
  const planted = new Set(world.economy.plantedFarmIds);
  const farms = intactBuildingsOfType(world, "farm").filter((farm) => planted.has(farm.id));
  if (farms.length === 0) {
    return;
  }
  let harvest = farms.length * ECONOMY_BALANCE.farmHarvestYield;

  // Store into reachable storehouses nearest the honmaru first (spec order
  // for the regular harvest); surplus beyond total capacity is lost.
  const honmaru = intactBuildingsOfType(world, "honmaru")[0];
  const reachableIds = new Set(computeConnectedStorehouseIds(world));
  const targets = intactBuildingsOfType(world, "storehouse").filter((storehouse) => reachableIds.has(storehouse.id));
  if (honmaru !== undefined) {
    targets.sort((a, b) => manhattan(honmaru.position, a.position) - manhattan(honmaru.position, b.position));
  }
  for (const storehouse of targets) {
    if (harvest <= 0) {
      break;
    }
    const space = (storehouse.foodCapacity ?? 0) - (storehouse.food ?? 0);
    const stored = Math.min(space, harvest);
    storehouse.food = (storehouse.food ?? 0) + stored;
    harvest -= stored;
  }
}

function populationCapacity(world: WorldState): number {
  let cells = 0;
  for (const townBlock of intactBuildingsOfType(world, "town_block")) {
    if (isTownBlockActive(world, townBlock)) {
      cells += townBlock.footprint.length;
    }
  }
  return cells * ECONOMY_BALANCE.populationPerTownCell;
}

/** Town blocks need a road adjacent to their footprint to be effective. */
function isTownBlockActive(world: WorldState, townBlock: BuildingState): boolean {
  for (const cell of townBlock.footprint) {
    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const neighbor = getBuildingAt(world, { x: cell.x + direction.x, y: cell.y + direction.y });
      if (neighbor !== null && neighbor.type === "road") {
        return true;
      }
    }
  }
  return false;
}

function currentApproval(): number {
  // MVP: approval derives directly from the fixed burden rate.
  return Math.max(0, Math.min(1, 1 - ECONOMY_BALANCE.taxRate * 0.8));
}

function maxRecruitPool(world: WorldState): number {
  return Math.floor(world.economy.population * ECONOMY_BALANCE.mobilizationRate);
}

function applyRecruitCommand(world: WorldState, unitType: UnitType): string | null {
  const definition = unitDefinitions[unitType];
  if (definition === undefined) {
    return "Unknown unit type";
  }
  const barracks = world.buildings.find(
    (building) => building.type === "barracks" && building.owner === "player" && building.lifecycleState === "intact"
  );
  if (barracks === undefined) {
    return "No barracks";
  }
  const cost = ECONOMY_BALANCE.recruitCosts[unitType];
  if (world.economy.gold < cost.gold) {
    return "Not enough gold";
  }
  if (world.economy.weapons < cost.weapons) {
    return "Not enough weapons";
  }
  if (world.economy.recruitPool < 1) {
    return "No recruits available";
  }
  const spawn = findSpawnCell(world, { x: barracks.position.x - 1, y: barracks.position.y - 1 });
  if (spawn === null) {
    return "No space to muster";
  }

  world.economy.gold -= cost.gold;
  world.economy.weapons -= cost.weapons;
  world.economy.recruitPool -= 1;
  world.units.push(createUnit(`unit:recruit:${world.currentTick}:${world.units.length}`, "player", unitType, spawn));
  return null;
}

function applyMarketTrade(world: WorldState, trade: MarketTrade): string | null {
  const market = world.buildings.find(
    (building) => building.type === "market" && building.owner === "player" && building.lifecycleState === "intact"
  );
  if (market === undefined) {
    return "No market";
  }
  if (!isBuildingReachableFromHonmaru(world, market)) {
    return "Market is not connected to the honmaru";
  }
  const prices = ECONOMY_BALANCE.market;

  if (trade === "buyWeapons") {
    if (world.economy.gold < prices.weaponsBuyPrice) {
      return "Not enough gold";
    }
    world.economy.gold -= prices.weaponsBuyPrice;
    world.economy.weapons += prices.weaponsLot;
    return null;
  }

  const connectedIds = new Set(computeConnectedStorehouseIds(world));
  const storehouses = intactBuildingsOfType(world, "storehouse").filter((storehouse) => connectedIds.has(storehouse.id));

  if (trade === "buyFood") {
    if (world.economy.gold < prices.foodBuyPrice) {
      return "Not enough gold";
    }
    let remaining = prices.foodLot;
    for (const storehouse of storehouses) {
      if (remaining <= 0) {
        break;
      }
      const space = (storehouse.foodCapacity ?? 0) - (storehouse.food ?? 0);
      const stored = Math.min(space, remaining);
      storehouse.food = (storehouse.food ?? 0) + stored;
      remaining -= stored;
    }
    if (remaining === prices.foodLot) {
      return "No storehouse space";
    }
    world.economy.gold -= prices.foodBuyPrice;
    return null;
  }

  // sellFood
  let toSell = prices.foodLot;
  const available = storehouses.reduce((sum, storehouse) => sum + (storehouse.food ?? 0), 0);
  if (available < toSell) {
    return "Not enough food to sell";
  }
  for (const storehouse of storehouses) {
    if (toSell <= 0) {
      break;
    }
    const sold = Math.min(storehouse.food ?? 0, toSell);
    storehouse.food = (storehouse.food ?? 0) - sold;
    toSell -= sold;
  }
  world.economy.gold += prices.foodSellPrice;
  return null;
}

/** Reuses the storehouse-style reachability: a building is reachable when a
 * passable path from the honmaru reaches any cell adjacent to it. */
function isBuildingReachableFromHonmaru(world: WorldState, building: BuildingState): boolean {
  const honmaru = intactBuildingsOfType(world, "honmaru")[0];
  if (honmaru === undefined) {
    return false;
  }
  const targetCells = new Set<string>();
  for (const cell of building.footprint) {
    for (const direction of ORTHOGONAL_DIRECTIONS) {
      targetCells.add(cellKey({ x: cell.x + direction.x, y: cell.y + direction.y }));
    }
  }

  const visited = new Set<string>();
  const queue: CellCoord[] = [];
  for (const cell of honmaru.footprint) {
    queue.push(cell);
    visited.add(cellKey(cell));
  }
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    if (targetCells.has(cellKey(current))) {
      return true;
    }
    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = cellKey(next);
      if (visited.has(key) || !isInsideMap(next) || !isPassable(world, next)) {
        continue;
      }
      visited.add(key);
      queue.push(next);
    }
  }
  return false;
}

function nextRandom(world: WorldState): number {
  // Deterministic LCG (Numerical Recipes constants); state lives in the
  // world so save/load reproduces the same sequence.
  world.rngState = (Math.imul(world.rngState, 1664525) + 1013904223) >>> 0;
  return world.rngState / 0x100000000;
}

function intactBuildingsOfType(world: WorldState, type: BuildingType): BuildingState[] {
  return world.buildings.filter((building) => building.type === type && building.lifecycleState === "intact");
}

// --- Food supply (docs/02_game-rules/food-and-supply.md) -------------------

function updateFoodSupply(world: WorldState): void {
  if (world.currentTick >= world.food.nextConnectivityCheckTick) {
    world.food.connectedStorehouseIds = computeConnectedStorehouseIds(world);
    const range = FOOD_BALANCE.connectivityMaxTicks - FOOD_BALANCE.connectivityMinTicks;
    world.food.nextConnectivityCheckTick =
      world.currentTick + FOOD_BALANCE.connectivityMinTicks + Math.floor(nextRandom(world) * range);
  }

  if (world.currentTick < world.food.nextConsumptionTick) {
    return;
  }
  world.food.nextConsumptionTick = world.currentTick + FOOD_BALANCE.consumptionCycleTicks;

  const required = requiredFoodPerCycle(world);
  if (required === 0) {
    return;
  }

  // Consume farthest storehouse first (spec: 本丸から遠い蔵から順に消費).
  const honmaru = intactBuildingsOfType(world, "honmaru")[0];
  const connected = connectedStorehouses(world);
  if (honmaru !== undefined) {
    connected.sort((a, b) => manhattan(honmaru.position, b.position) - manhattan(honmaru.position, a.position));
  }

  let remaining = required;
  for (const storehouse of connected) {
    if (remaining === 0) {
      break;
    }
    const paid = Math.min(storehouse.food ?? 0, remaining);
    storehouse.food = (storehouse.food ?? 0) - paid;
    remaining -= paid;
  }

  if (remaining > 0) {
    // Could not pay the cycle's requirement from connected storehouses:
    // the castle surrenders (兵糧切れ).
    world.outcome = { winner: "enemy", reason: "starvation", tick: world.currentTick };
  }
}

function requiredFoodPerCycle(world: WorldState): number {
  const defenders = world.units.filter((unit) => unit.owner === "player" && unit.hp > 0).length;
  return defenders * FOOD_BALANCE.foodPerUnitPerCycle;
}

function connectedStorehouses(world: WorldState): BuildingState[] {
  const connectedIds = new Set(world.food.connectedStorehouseIds);
  return intactBuildingsOfType(world, "storehouse").filter((storehouse) => connectedIds.has(storehouse.id));
}

/**
 * Storehouses reachable from the honmaru over passable cells. The path may
 * end on any cell orthogonally adjacent to the storehouse footprint; roads
 * are not required and enemy unit positions are ignored (spec).
 */
function computeConnectedStorehouseIds(world: WorldState): BuildingId[] {
  const honmaru = intactBuildingsOfType(world, "honmaru")[0];
  if (honmaru === undefined) {
    return [];
  }

  const storehouses = intactBuildingsOfType(world, "storehouse");
  if (storehouses.length === 0) {
    return [];
  }

  const adjacency = new Map<string, BuildingId>();
  for (const storehouse of storehouses) {
    for (const cell of storehouse.footprint) {
      for (const direction of ORTHOGONAL_DIRECTIONS) {
        adjacency.set(cellKey({ x: cell.x + direction.x, y: cell.y + direction.y }), storehouse.id);
      }
    }
  }

  const connected = new Set<BuildingId>();
  const visited = new Set<string>();
  const queue: CellCoord[] = [];
  for (const cell of honmaru.footprint) {
    queue.push(cell);
    visited.add(cellKey(cell));
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }

    const storehouseId = adjacency.get(cellKey(current));
    if (storehouseId !== undefined) {
      connected.add(storehouseId);
      if (connected.size === storehouses.length) {
        break;
      }
    }

    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = cellKey(next);
      if (visited.has(key) || !isInsideMap(next) || !isPassable(world, next)) {
        continue;
      }
      visited.add(key);
      queue.push(next);
    }
  }

  return [...connected];
}

// --- Victory / defeat (docs/02_game-rules/victory-and-defeat.md) -----------

function checkOutcome(world: WorldState): void {
  if (world.outcome !== null) {
    return;
  }

  // Honmaru fall: at one simulation cut, enemy combat units occupy the
  // honmaru footprint while no defender combat unit is inside.
  const honmaru = intactBuildingsOfType(world, "honmaru")[0];
  if (honmaru !== undefined) {
    const cells = new Set(honmaru.footprint.map(cellKey));
    let enemiesInside = 0;
    let defendersInside = 0;
    for (const unit of world.units) {
      if (unit.hp <= 0 || !cells.has(cellKey(unit.position))) {
        continue;
      }
      if (unit.owner === "enemy") {
        enemiesInside += 1;
      } else if (unit.owner === "player") {
        defendersInside += 1;
      }
    }
    if (enemiesInside > 0 && defendersInside === 0) {
      world.outcome = { winner: "enemy", reason: "honmaru_fallen", tick: world.currentTick };
      return;
    }
  }

  // Defender victory by endurance: hold the honmaru until the scenario's
  // deadline (victory-and-defeat.md: 規定時間まで本丸を保持).
  const holdTicks = world.scenario.victory.holdTicks;
  if (holdTicks !== null && world.currentTick >= holdTicks) {
    world.outcome = { winner: "player", reason: "time_held", tick: world.currentTick };
    return;
  }

  // Defender victory: attacking force annihilated after every attack wave
  // has spawned; wiping the vanguard before reinforcements arrive is not a
  // win yet.
  if (
    world.currentTick > 0 &&
    world.nextWaveIndex >= world.scenario.waves.length &&
    !world.units.some((unit) => unit.owner === "enemy" && unit.hp > 0)
  ) {
    world.outcome = { winner: "player", reason: "enemy_annihilated", tick: world.currentTick };
  }
}

// --- Enemy AI: frontal assault profile (docs/07_scenarios/ai-profiles.md) --

function updateEnemyAi(world: WorldState): void {
  spawnAttackWaves(world);

  if (world.currentTick % ENEMY_AI.decisionIntervalTicks !== 0) {
    return;
  }

  const honmaru = intactBuildingsOfType(world, "honmaru")[0];
  for (const unit of world.units) {
    if (unit.owner !== "enemy" || unit.hp <= 0) {
      continue;
    }

    // Defenders in aggro range always take priority, even while the unit is
    // marching or breaching a wall. An existing unit target is kept so the
    // AI does not flip-flop between defenders every decision tick.
    if (!hasUnitAttackTarget(world, unit)) {
      const nearestDefender = nearestDefenderInAggro(world, unit);
      if (nearestDefender !== null) {
        unit.attackTargetId = nearestDefender.id;
        unit.path = [];
        unit.destination = null;
        unit.movementProgress = 0;
        continue;
      }
    }

    if (unit.attackTargetId !== null || unit.path.length > 0 || unit.task !== null) {
      continue;
    }

    if (honmaru === undefined) {
      continue;
    }

    if (unit.pathRetryCooldown > 0) {
      unit.pathRetryCooldown -= ENEMY_AI.decisionIntervalTicks;
      continue;
    }

    // March on the honmaru. The keep cell itself may be blocked by its
    // garrison (occupied cells are impassable), so falling short by one
    // cell still counts as a successful approach.
    const direct = findPath(world, unit.position, honmaru.position);
    const path = direct.length > 0 ? direct : findPathToAttackRange(world, unit.position, honmaru.position, 1);
    if (path.length > 0) {
      unit.destination = path.at(-1) ?? null;
      unit.path = path;
      unit.movementProgress = 0;
      continue;
    }
    unit.pathRetryCooldown = PATH_RETRY_COOLDOWN_TICKS;

    // Route blocked: breach the nearest defender fortification. Engineers
    // ladder walls and fill moats; combat units hack at the obstacle.
    if (unit.type === "engineer" && unit.task === null) {
      const wall = nearestBuildingOfTypes(world, unit, ["wall"]);
      if (wall !== null && wall.ladderHp === null) {
        unit.task = { kind: "ladder", target: wall.position, progress: 0 };
        continue;
      }
      const moat = nearestBuildingOfTypes(world, unit, ["dry_moat", "water_moat"]);
      if (moat !== null) {
        unit.task = { kind: "fillMoat", target: moat.position, progress: 0 };
        continue;
      }
    }
    const obstacle = nearestPlayerFortification(world, unit);
    if (obstacle !== null) {
      unit.attackTargetId = obstacle.id;
    }
  }
}

function nearestBuildingOfTypes(world: WorldState, unit: UnitState, types: readonly BuildingType[]): BuildingState | null {
  let nearest: BuildingState | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const building of world.buildings) {
    if (building.owner !== "player" || building.lifecycleState !== "intact" || !types.includes(building.type)) {
      continue;
    }
    const distance = manhattan(unit.position, building.position);
    if (distance < nearestDistance) {
      nearest = building;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function hasUnitAttackTarget(world: WorldState, unit: UnitState): boolean {
  if (unit.attackTargetId === null) {
    return false;
  }
  return world.units.some((candidate) => candidate.id === unit.attackTargetId && candidate.hp > 0);
}

function nearestDefenderInAggro(world: WorldState, unit: UnitState): UnitState | null {
  let nearest: UnitState | null = null;
  let nearestDistance = ENEMY_AI.aggroRange + 1;
  for (const candidate of world.units) {
    if (candidate.owner !== "player" || candidate.hp <= 0) {
      continue;
    }
    const distance = manhattan(unit.position, candidate.position);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function nearestPlayerFortification(world: WorldState, unit: UnitState): BuildingState | null {
  let nearest: BuildingState | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const building of world.buildings) {
    if (
      building.owner !== "player" ||
      building.lifecycleState !== "intact" ||
      !BREACHABLE_BUILDING_TYPES.includes(building.type)
    ) {
      continue;
    }
    const distance = manhattan(unit.position, building.position);
    if (distance < nearestDistance) {
      nearest = building;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function spawnAttackWaves(world: WorldState): void {
  while (world.nextWaveIndex < world.scenario.waves.length) {
    const wave = world.scenario.waves[world.nextWaveIndex];
    if (wave === undefined || world.currentTick < wave.tick) {
      return;
    }
    for (const [index, spawn] of wave.spawns.entries()) {
      const position = findSpawnCell(world, spawn.position);
      if (position === null) {
        continue;
      }
      world.units.push(createUnit(`unit:enemy:wave${world.nextWaveIndex}:${index}`, "enemy", spawn.type, position));
    }
    world.nextWaveIndex += 1;
  }
}

/**
 * Collects up to `count` passable cells around a destination in BFS order.
 * The destination itself comes first, so slots form a packed cluster and a
 * multi-unit move arrives as a formation.
 */
function formationSlots(world: WorldState, destination: CellCoord, count: number): CellCoord[] {
  const slots: CellCoord[] = [];
  const visited = new Set<string>([cellKey(destination)]);
  const queue: CellCoord[] = [destination];
  let explored = 0;
  const explorationLimit = Math.max(count * 12, 200);

  while (queue.length > 0 && slots.length < count && explored < explorationLimit) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    explored += 1;
    if (isPassable(world, current)) {
      slots.push(current);
    }
    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = cellKey(next);
      if (visited.has(key) || !isInsideMap(next)) {
        continue;
      }
      visited.add(key);
      queue.push(next);
    }
  }
  return slots;
}

function findSpawnCell(world: WorldState, preferred: CellCoord): CellCoord | null {
  if (isPassable(world, preferred)) {
    return preferred;
  }
  for (let radius = 1; radius <= 4; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const candidate = { x: preferred.x + dx, y: preferred.y + dy };
        if (isPassable(world, candidate)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

/** Attack-move: units advancing under an attack-move order engage enemies
 * that come into aggro range and resume the advance once they fall. */
function updateAttackMoveBehavior(world: WorldState): void {
  if (world.currentTick % 10 !== 0) {
    return;
  }
  for (const unit of world.units) {
    if (unit.attackMoveDestination === null || unit.hp <= 0) {
      continue;
    }

    if (unit.attackTargetId === null) {
      let nearest: UnitState | null = null;
      let nearestDistance = ENEMY_AI.aggroRange + 1;
      for (const candidate of world.units) {
        if (candidate.hp <= 0 || !areEnemies(unit.owner, candidate.owner)) {
          continue;
        }
        const distance = manhattan(unit.position, candidate.position);
        if (distance < nearestDistance) {
          nearest = candidate;
          nearestDistance = distance;
        }
      }
      if (nearest !== null) {
        unit.attackTargetId = nearest.id;
        unit.path = [];
        unit.destination = null;
        unit.movementProgress = 0;
        continue;
      }
    }

    // No engagement: make sure the advance continues.
    if (unit.attackTargetId === null && unit.path.length === 0) {
      if (sameCell(unit.position, unit.attackMoveDestination) || manhattan(unit.position, unit.attackMoveDestination) <= 1) {
        unit.attackMoveDestination = null;
        continue;
      }
      if (unit.pathRetryCooldown > 0) {
        unit.pathRetryCooldown -= 10;
        continue;
      }
      const path = findPath(world, unit.position, unit.attackMoveDestination);
      if (path.length === 0) {
        const near = findPathToAttackRange(world, unit.position, unit.attackMoveDestination, 1);
        if (near.length === 0) {
          unit.pathRetryCooldown = PATH_RETRY_COOLDOWN_TICKS;
          unit.attackMoveDestination = null;
          continue;
        }
        unit.path = near;
        unit.destination = near.at(-1) ?? null;
        unit.movementProgress = 0;
        continue;
      }
      unit.path = path;
      unit.destination = unit.attackMoveDestination;
      unit.movementProgress = 0;
    }
  }
}

// --- Engineers: ladders and moat filling (docs/03_combat/siege-system.md) --

function applyEngineerTaskCommand(
  world: WorldState,
  unitIds: readonly UnitId[],
  kind: EngineerTaskKind,
  position: CellCoord
): string | null {
  const engineers = world.units.filter(
    (unit) => unitIds.includes(unit.id) && unit.type === "engineer" && unit.hp > 0
  );
  if (engineers.length === 0) {
    return "No engineers selected";
  }

  const target = engineerTaskTarget(world, kind, position);
  if (target === null) {
    return kind === "ladder" ? "Ladders attach to intact walls" : "Select a moat cell to fill";
  }

  for (const engineer of engineers) {
    engineer.task = { kind, target: position, progress: 0 };
    engineer.attackTargetId = null;
    engineer.path = [];
    engineer.destination = null;
    engineer.movementProgress = 0;
    engineer.pathRetryCooldown = 0;
  }
  world.invalidMoveTarget = null;
  return null;
}

function engineerTaskTarget(world: WorldState, kind: EngineerTaskKind, position: CellCoord): BuildingState | null {
  const building = getBuildingAt(world, position);
  if (building === null || building.lifecycleState !== "intact") {
    return null;
  }
  if (kind === "ladder") {
    return building.type === "wall" && building.ladderHp === null ? building : null;
  }
  return building.type === "dry_moat" || building.type === "water_moat" ? building : null;
}

function updateEngineerTasks(world: WorldState): void {
  for (const unit of world.units) {
    if (unit.task === null || unit.hp <= 0 || unit.type !== "engineer") {
      if (unit.task !== null && unit.type !== "engineer") {
        unit.task = null;
      }
      continue;
    }

    const target = engineerWorkTarget(world, unit.task.kind, unit.task.target);
    if (target === null) {
      // Target destroyed, filled, or already laddered: order complete/void.
      unit.task = null;
      continue;
    }

    if (manhattan(unit.position, unit.task.target) > 1) {
      if (unit.path.length === 0) {
        if (unit.pathRetryCooldown > 0) {
          unit.pathRetryCooldown -= 1;
          continue;
        }
        const path = findPathToAttackRange(world, unit.position, unit.task.target, 1);
        if (path.length === 0) {
          unit.pathRetryCooldown = PATH_RETRY_COOLDOWN_TICKS;
          continue;
        }
        unit.path = path;
        unit.destination = path.at(-1) ?? null;
        unit.movementProgress = 0;
      }
      continue;
    }

    // Adjacent: work.
    unit.path = [];
    unit.destination = null;
    if (unit.task.kind === "ladder") {
      unit.task.progress += 1;
      if (unit.task.progress >= SIEGE_BALANCE.ladderBuildTicks) {
        attachLadder(target);
        unit.task = null;
      }
      continue;
    }

    // Moat fill: progress lives on the moat so several engineers stack and
    // interruption preserves work (preserveProgressOnInterrupt).
    target.fillProgress += 1;
    if (target.fillProgress >= SIEGE_BALANCE.moatFillTicks) {
      world.buildings = world.buildings.filter((building) => building.id !== target.id);
      for (const worker of world.units) {
        if (worker.task !== null && sameCell(worker.task.target, unit.task.target)) {
          worker.task = null;
        }
      }
    }
  }
}

function engineerWorkTarget(world: WorldState, kind: EngineerTaskKind, position: CellCoord): BuildingState | null {
  const building = getBuildingAt(world, position);
  if (building === null || building.lifecycleState !== "intact") {
    return null;
  }
  if (kind === "ladder") {
    return building.type === "wall" && building.ladderHp === null ? building : null;
  }
  return building.type === "dry_moat" || building.type === "water_moat" ? building : null;
}

function attachLadder(wall: BuildingState): void {
  wall.ladderHp = SIEGE_BALANCE.ladderHp;
  wall.passable = true;
  wall.movementCostModifier = SIEGE_BALANCE.ladderMoveCost;
}

function detachLadder(wall: BuildingState): void {
  wall.ladderHp = null;
  wall.passable = false;
  wall.movementCostModifier = BLOCKED_MOVEMENT_COST;
}

// --- Save / load ------------------------------------------------------------

const SAVE_VERSION = 1;

export function serializeWorld(world: WorldState): SerializedWorld {
  return { version: SAVE_VERSION, world: JSON.parse(JSON.stringify(world)) };
}

export function deserializeWorld(serialized: SerializedWorld): WorldState {
  if (serialized.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version: ${serialized.version}`);
  }
  const world = serialized.world as WorldState;
  if (
    typeof world !== "object" ||
    world === null ||
    !Array.isArray(world.units) ||
    !Array.isArray(world.buildings) ||
    typeof world.currentTick !== "number" ||
    world.map?.cells === undefined
  ) {
    throw new Error("Malformed save payload");
  }
  for (const unit of world.units) {
    unit.pathRetryCooldown ??= 0;
    unit.task ??= null;
    unit.attackMoveDestination ??= null;
  }
  for (const building of world.buildings) {
    building.ladderHp ??= null;
    building.fillProgress ??= 0;
  }
  world.nextWaveIndex ??= 0;
  world.scenario ??= { waves: mvpDefenseScenario.waves, victory: mvpDefenseScenario.victory };
  world.economy ??= {
    gold: ECONOMY_BALANCE.initialGold,
    weapons: ECONOMY_BALANCE.initialWeapons,
    population: ECONOMY_BALANCE.initialPopulation,
    recruitPool: Math.floor(ECONOMY_BALANCE.initialPopulation * ECONOMY_BALANCE.mobilizationRate),
    plantedFarmIds: [],
    lastProcessedMonth: Math.floor(world.currentTick / ECONOMY_BALANCE.monthTicks),
    lastProcessedSeason: Math.floor(world.currentTick / ECONOMY_BALANCE.seasonTicks)
  };
  return world;
}

export function snapshotWorld(world: WorldState, options: SnapshotOptions = {}): WorldSnapshot {
  const includeMapCells = options.includeMapCells ?? true;

  return {
    currentTick: world.currentTick,
    invalidMoveTarget: world.invalidMoveTarget,
    outcome: world.outcome,
    food: snapshotFood(world),
    economy: snapshotEconomy(world),
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
      assetId: unit.assetId,
      task: unit.task
    })),
    buildings: world.buildings.map((building) => snapshotBuilding(world, building))
  };
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


// Building definitions live in @asama/content as rectangle footprints; the
// simulation expands them to cell lists and applies the blocked-movement
// sentinel to impassable buildings.
const buildingDefinitions: Record<BuildingType, BuildingDefinition> = Object.fromEntries(
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

function createInitialMap(): WorldState["map"] {
  const baseCells: TerrainCellState[] = [];

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      baseCells.push(createTerrainCell({ x, y }));
    }
  }

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    cells: baseCells.map((cell) => ({
      ...cell,
      assetId: connectedTerrainAssetId(baseCells, MAP_WIDTH, MAP_HEIGHT, cell)
    }))
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

function connectedTerrainAssetId(
  cells: readonly TerrainCellState[],
  width: number,
  height: number,
  cell: TerrainCellState
): string {
  const mask = cardinalDirections
    .map((direction) => {
      const x = cell.coord.x + direction.x;
      const y = cell.coord.y + direction.y;
      if (x < 0 || y < 0 || x >= width || y >= height) {
        return "0";
      }

      return cells[y * width + x]?.terrain === cell.terrain ? "1" : "0";
    })
    .join("");

  return `terrain.${cell.terrain}.connected.${mask}`;
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
    movementProgress: 0,
    pathRetryCooldown: 0,
    task: null,
    attackMoveDestination: null
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

    const damage = damageAgainst(unit);
    const laddered = target as Partial<BuildingState>;
    if (laddered.ladderHp !== undefined && laddered.ladderHp !== null && unit.attackRange === 1) {
      // Melee strikes tear down the attached ladder before the wall itself
      // takes damage (siege-system.md: 梯子破壊).
      laddered.ladderHp -= damage;
      if (laddered.ladderHp <= 0) {
        detachLadder(target as BuildingState);
      }
    } else {
      target.hp -= damage;
    }
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
      // A failed search would otherwise repeat every tick and each miss
      // explores the whole map; unreachable targets must back off.
      if (unit.pathRetryCooldown > 0) {
        unit.pathRetryCooldown -= 1;
        continue;
      }
      const path = findPathToAttackRange(world, unit.position, target.position, unit.attackRange);
      if (path.length === 0) {
        unit.pathRetryCooldown = PATH_RETRY_COOLDOWN_TICKS;
      }
      unit.path = path;
      unit.destination = path.at(-1) ?? null;
      unit.movementProgress = 0;
    }
  }
}

const PATH_RETRY_COOLDOWN_TICKS = 40;

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

function seedInitialBuildings(world: WorldState, scenario: ScenarioDefinition): void {
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
    assetId: definition.assetId,
    food: type === "storehouse" ? FOOD_BALANCE.storehouseInitialFood : null,
    foodCapacity: type === "storehouse" ? FOOD_BALANCE.storehouseCapacity : null,
    ladderHp: null,
    fillProgress: 0
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
    assetId: connectedBuildingAssetId(world, building),
    food: building.food,
    foodCapacity: building.foodCapacity,
    connectedToHonmaru: world.food.connectedStorehouseIds.includes(building.id),
    ladderHp: building.ladderHp,
    fillProgress: building.fillProgress
  };
}

function snapshotEconomy(world: WorldState): EconomySnapshot {
  const seasonIndex = Math.floor(world.currentTick / ECONOMY_BALANCE.seasonTicks);
  return {
    gold: world.economy.gold,
    weapons: world.economy.weapons,
    population: world.economy.population,
    populationCapacity: populationCapacity(world),
    approval: currentApproval(),
    recruitPool: world.economy.recruitPool,
    recruitPoolMax: maxRecruitPool(world),
    season: SEASONS[seasonIndex % SEASONS.length] ?? "spring",
    year: Math.floor(seasonIndex / SEASONS.length) + 1,
    plantedFarms: world.economy.plantedFarmIds.length
  };
}

function snapshotFood(world: WorldState): FoodSnapshot {
  const storehouses = intactBuildingsOfType(world, "storehouse");
  const connectedIds = new Set(world.food.connectedStorehouseIds);
  let available = 0;
  let total = 0;
  let capacity = 0;
  for (const storehouse of storehouses) {
    total += storehouse.food ?? 0;
    capacity += storehouse.foodCapacity ?? 0;
    if (connectedIds.has(storehouse.id)) {
      available += storehouse.food ?? 0;
    }
  }
  return {
    available,
    total,
    capacity,
    requiredPerCycle: requiredFoodPerCycle(world),
    nextConsumptionInTicks: Math.max(0, world.food.nextConsumptionTick - world.currentTick)
  };
}

function connectedBuildingAssetId(world: WorldState, building: BuildingState): string {
  if (isGate(building.type)) {
    return connectedGateAssetId(world, building);
  }

  const family = connectedAssetFamily(building.type);
  if (family === null) {
    return building.assetId;
  }

  const mask = connectionMask(world, building);
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

const cardinalDirections: readonly CellCoord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
];

function isGate(type: BuildingType): boolean {
  return (
    type === "gate" ||
    type === "gate_wide_2" ||
    type === "gate_wide_3" ||
    type === "gate_ne_sw" ||
    type === "gate_wide_2_ne_sw" ||
    type === "gate_wide_3_ne_sw"
  );
}

function isNeSwGate(type: BuildingType): boolean {
  return type === "gate_ne_sw" || type === "gate_wide_2_ne_sw" || type === "gate_wide_3_ne_sw";
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
