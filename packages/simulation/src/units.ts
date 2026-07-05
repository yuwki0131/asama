import { SIM_TICKS_PER_SECOND, type CellCoord, type OwnerId, type UnitId, type UnitType } from "@asama/shared";
import { unitSpecs } from "@asama/content";
import type { UnitDefinition, UnitState } from "./types";

export const unitDefinitions: Record<UnitType, UnitDefinition> = Object.fromEntries(
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

export function createUnit(id: UnitId, owner: OwnerId, type: UnitType, position: CellCoord): UnitState {
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

export function unitDefinitionFor(type: UnitType): UnitDefinition | undefined {
  return unitDefinitions[type];
}
