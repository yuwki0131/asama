import type { CellCoord, EngineerTaskKind, UnitId } from "@asama/shared";
import { attachLadder, getBuildingAt } from "./buildings";
import { PATH_RETRY_COOLDOWN_TICKS, findPathToAttackRange } from "./pathfinding";
import { SIEGE_BALANCE, isWall, manhattan, sameCell } from "./types";
import type { BuildingState, WorldState } from "./types";

export function applyEngineerTaskCommand(
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
    return isWall(building.type) && building.ladderHp === null ? building : null;
  }
  return building.type === "dry_moat" || building.type === "water_moat" ? building : null;
}

export function updateEngineerTasks(world: WorldState): void {
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
    return isWall(building.type) && building.ladderHp === null ? building : null;
  }
  return building.type === "dry_moat" || building.type === "water_moat" ? building : null;
}
