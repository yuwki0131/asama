import type { BuildingId, CellCoord } from "@asama/shared";
import { getBuildingAt } from "./buildings";
import { isPassable } from "./pathfinding";
import { FOOD_BALANCE, ORTHOGONAL_DIRECTIONS, cellKey, intactBuildingsOfType, isInsideMap, manhattan, nextRandom } from "./types";
import type { BuildingState, WorldState } from "./types";

export function updateFoodSupply(world: WorldState): void {
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

export function requiredFoodPerCycle(world: WorldState): number {
  const defenders = world.units.filter((unit) => unit.owner === "player" && unit.hp > 0).length;
  return defenders * FOOD_BALANCE.foodPerUnitPerCycle;
}

export function connectedStorehouses(world: WorldState): BuildingState[] {
  const connectedIds = new Set(world.food.connectedStorehouseIds);
  return intactBuildingsOfType(world, "storehouse").filter((storehouse) => connectedIds.has(storehouse.id));
}

export function computeConnectedStorehouseIds(world: WorldState): BuildingId[] {
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
