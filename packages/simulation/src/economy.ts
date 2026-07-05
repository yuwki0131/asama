import type { CellCoord, MarketTrade, UnitType } from "@asama/shared";
import { getBuildingAt } from "./buildings";
import { computeConnectedStorehouseIds } from "./food";
import { findSpawnCell, isPassable } from "./pathfinding";
import { createUnit, unitDefinitionFor } from "./units";
import { ECONOMY_BALANCE, ORTHOGONAL_DIRECTIONS, SEASONS, cellKey, intactBuildingsOfType, isInsideMap, manhattan } from "./types";
import type { BuildingState, WorldState } from "./types";

export function updateEconomy(world: WorldState): void {
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

export function populationCapacity(world: WorldState): number {
  let cells = 0;
  for (const townBlock of intactBuildingsOfType(world, "town_block")) {
    if (isTownBlockActive(world, townBlock)) {
      cells += townBlock.footprint.length;
    }
  }
  return cells * ECONOMY_BALANCE.populationPerTownCell;
}

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

export function currentApproval(): number {
  // MVP: approval derives directly from the fixed burden rate.
  return Math.max(0, Math.min(1, 1 - ECONOMY_BALANCE.taxRate * 0.8));
}

export function maxRecruitPool(world: WorldState): number {
  return Math.floor(world.economy.population * ECONOMY_BALANCE.mobilizationRate);
}

export function applyRecruitCommand(world: WorldState, unitType: UnitType): string | null {
  const definition = unitDefinitionFor(unitType);
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

export function applyMarketTrade(world: WorldState, trade: MarketTrade): string | null {
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
