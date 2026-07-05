import { mvpDefenseScenario } from "@asama/content";
import type { CellCoord, EconomySnapshot, FoodSnapshot, PlayerCommand, WorldSnapshot } from "@asama/shared";
import type { ScenarioDefinition, ScenarioWave } from "@asama/shared";
import { buildingDefinitions, absoluteFootprint, canPlaceBuilding, clearUnitPathsThrough, seedInitialBuildings, snapshotBuilding, snapshotCell, getBuildingAt } from "./buildings";
import { getAttackTarget, areEnemies, updateAttackMoveBehavior, updateCombat } from "./combat";
import { updateEconomy, applyMarketTrade, applyRecruitCommand, populationCapacity, currentApproval, maxRecruitPool } from "./economy";
import { updateEnemyAi } from "./enemyAi";
import { applyEngineerTaskCommand, updateEngineerTasks } from "./engineer";
import { requiredFoodPerCycle, updateFoodSupply } from "./food";
import { createInitialMap } from "./map";
import { findPath, formationSlots, isPassable } from "./pathfinding";
import { deserializeWorld, serializeWorld } from "./serialization";
import { createUnit } from "./units";
import {
  BLOCKED_MOVEMENT_COST,
  ECONOMY_BALANCE,
  FOOD_BALANCE,
  SEASONS,
  SIEGE_BALANCE,
  WORLD_RNG_SEED,
  cellKey,
  clampCell,
  intactBuildingsOfType,
  manhattan,
  sameCell,
  type SnapshotOptions,
  type WorldState
} from "./types";

export type { WorldState } from "./types";
export { ECONOMY_BALANCE, FOOD_BALANCE, SIEGE_BALANCE } from "./types";
export { serializeWorld, deserializeWorld } from "./serialization";

/** Compatibility export: the default scenario's waves (tests, tooling). */
export const ENEMY_WAVES: readonly ScenarioWave[] = mvpDefenseScenario.waves;

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
    supplyState: {
      hasHadCart: false,
      retreatTimerActive: false,
      retreatTimerRemaining: 0
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
  // Track supply carts before combat removes dead units this tick.
  updateSupplyState(world);

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

function updateSupplyState(world: WorldState): void {
  const hasAliveCarts = world.units.some(
    (u) => u.owner === "enemy" && u.type === "supply_cart" && u.hp > 0
  );

  if (hasAliveCarts) {
    world.supplyState.hasHadCart = true;
    world.supplyState.retreatTimerActive = false;
    world.supplyState.retreatTimerRemaining = 0;
  } else if (world.supplyState.hasHadCart) {
    if (!world.supplyState.retreatTimerActive) {
      world.supplyState.retreatTimerActive = true;
      world.supplyState.retreatTimerRemaining = SIEGE_BALANCE.supplyRetreatTicks;
    } else {
      world.supplyState.retreatTimerRemaining -= 1;
    }
  }
}

function checkOutcome(world: WorldState): void {
  if (world.outcome !== null) {
    return;
  }

  // Supply-cut victory: retreat timer expired after all supply carts were destroyed.
  if (world.supplyState.retreatTimerActive && world.supplyState.retreatTimerRemaining <= 0) {
    world.units = world.units.filter((unit) => unit.owner !== "enemy");
    world.outcome = { winner: "player", reason: "supply_cut", tick: world.currentTick };
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

export function snapshotWorld(world: WorldState, options: SnapshotOptions = {}): WorldSnapshot {
  const includeMapCells = options.includeMapCells ?? true;

  return {
    currentTick: world.currentTick,
    invalidMoveTarget: world.invalidMoveTarget,
    outcome: world.outcome,
    food: snapshotFood(world),
    economy: snapshotEconomy(world),
    supplyRetreat: {
      active: world.supplyState.retreatTimerActive,
      remainingTicks: world.supplyState.retreatTimerRemaining
    },
    map: {
      width: world.map.width,
      height: world.map.height,
      cells: includeMapCells ? world.map.cells.map(snapshotCell) : [],
      decorations: includeMapCells ? world.map.decorations : []
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
