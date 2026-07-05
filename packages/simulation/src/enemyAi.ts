import type { BuildingType } from "@asama/shared";
import { getAttackTarget } from "./combat";
import { getBuildingAt } from "./buildings";
import { applyEngineerTaskCommand } from "./engineer";
import { PATH_RETRY_COOLDOWN_TICKS, findPath, findPathToAttackRange, findSpawnCell } from "./pathfinding";
import { createUnit } from "./units";
import { BREACHABLE_BUILDING_TYPES, ENEMY_AI, intactBuildingsOfType, manhattan } from "./types";
import type { BuildingState, UnitState, WorldState } from "./types";

export function updateEnemyAi(world: WorldState): void {
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
