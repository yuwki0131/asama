import type { EntityId, OwnerId } from "@asama/shared";
import { UNIT_TYPE_AFFINITY } from "@asama/content";
import { detachLadder } from "./buildings";
import { PATH_RETRY_COOLDOWN_TICKS, findPath, findPathToAttackRange } from "./pathfinding";
import { ENEMY_AI, manhattan, sameCell } from "./types";
import type { AttackTarget, BuildingState, UnitState, WorldState } from "./types";

export function updateCombat(world: WorldState): void {
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

    const damage = damageAgainst(unit, target);
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
      const path = findPathToAttackRange(world, unit.position, target.position, unit.attackRange, unit.owner === "player" ? "player" : undefined);
      if (path.length === 0) {
        unit.pathRetryCooldown = PATH_RETRY_COOLDOWN_TICKS;
      }
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

export function getAttackTarget(world: WorldState, targetId: EntityId): AttackTarget | null {
  const unit = world.units.find((candidate) => candidate.id === targetId && candidate.hp > 0);
  if (unit !== undefined) {
    return unit;
  }

  const building = world.buildings.find(
    (candidate) => candidate.id === targetId && candidate.lifecycleState === "intact" && candidate.hp > 0
  );
  return building ?? null;
}

export function areEnemies(a: OwnerId, b: OwnerId): boolean {
  return a !== b && a !== "neutral" && b !== "neutral";
}

function damageAgainst(attacker: UnitState, target: AttackTarget): number {
  const targetUnit = target as Partial<UnitState>;
  const targetType = targetUnit.type;
  const affinityRow = UNIT_TYPE_AFFINITY[attacker.type];
  const multiplier = targetType !== undefined && affinityRow !== undefined ? (affinityRow[targetType] ?? 1) : 1;
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

export function updateAttackMoveBehavior(world: WorldState): void {
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
