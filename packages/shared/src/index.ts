export const SIM_TICKS_PER_SECOND = 20;
export const SNAPSHOTS_PER_SECOND = 10;
export const MAP_WIDTH = 128;
export const MAP_HEIGHT = 128;

export type EntityId = string;
export type UnitId = EntityId;
export type BuildingId = EntityId;
export type OwnerId = "player" | "enemy" | "neutral";
export type UnitType = "spear_ashigaru" | "sword_ashigaru" | "archer";
export type TerrainType = "grass" | "dirt" | "water" | "stone";
export type BuildingType =
  | "fence"
  | "wall"
  | "gate"
  | "gate_wide_2"
  | "gate_wide_3"
  | "dry_moat"
  | "water_moat"
  | "storehouse"
  | "market"
  | "barracks"
  | "samurai_residence"
  | "town_block"
  | "farm"
  | "road"
  | "earth_bridge"
  | "wood_bridge"
  | "honmaru"
  | "tenshu";
export type BuildingCategory = "castle" | "moat" | "economy" | "military" | "residential" | "infrastructure" | "objective";
export type BuildingLifecycleState = "intact" | "destroyed";
export type GateState = "open" | "closed";

export interface CellCoord {
  readonly x: number;
  readonly y: number;
}

export interface TerrainCellSnapshot {
  readonly coord: CellCoord;
  readonly terrain: TerrainType;
  readonly movementCost: number;
  readonly passable: boolean;
  readonly assetId: string;
}

export interface UnitSnapshot {
  readonly id: UnitId;
  readonly owner: OwnerId;
  readonly type: UnitType;
  readonly position: CellCoord;
  readonly destination: CellCoord | null;
  readonly path: readonly CellCoord[];
  readonly selected: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly attackCooldownTicks: number;
  readonly attackCooldownRemaining: number;
  readonly targetId: EntityId | null;
  readonly assetId: string;
}

export interface BuildingSnapshot {
  readonly id: BuildingId;
  readonly owner: OwnerId;
  readonly type: BuildingType;
  readonly category: BuildingCategory;
  readonly position: CellCoord;
  readonly footprint: readonly CellCoord[];
  readonly hp: number;
  readonly maxHp: number;
  readonly lifecycleState: BuildingLifecycleState;
  readonly gateState: GateState | null;
  readonly passable: boolean;
  readonly movementCostModifier: number;
  readonly assetId: string;
}

export interface WorldSnapshot {
  readonly currentTick: number;
  readonly invalidMoveTarget: CellCoord | null;
  readonly map: {
    readonly width: number;
    readonly height: number;
    readonly cells: readonly TerrainCellSnapshot[];
  };
  readonly units: readonly UnitSnapshot[];
  readonly buildings: readonly BuildingSnapshot[];
}

export type PlayerCommand =
  | {
      readonly type: "selectUnits";
      readonly unitIds: readonly UnitId[];
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      readonly type: "moveUnits";
      readonly unitIds: readonly UnitId[];
      readonly destination: CellCoord;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      readonly type: "attackTarget";
      readonly unitIds: readonly UnitId[];
      readonly targetId: EntityId;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      readonly type: "placeBuilding";
      readonly buildingType: BuildingType;
      readonly position: CellCoord;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      readonly type: "demolishBuilding";
      readonly position: CellCoord;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    };

export type MainToWorkerMessage =
  | { readonly type: "init" }
  | { readonly type: "setSpeed"; readonly speed: 0 | 1 | 2 | 4 }
  | { readonly type: "enqueueCommand"; readonly command: PlayerCommand }
  | { readonly type: "requestSnapshot" };

export type WorkerToMainMessage =
  | { readonly type: "ready"; readonly snapshot: WorldSnapshot }
  | { readonly type: "snapshot"; readonly snapshot: WorldSnapshot }
  | { readonly type: "commandRejected"; readonly reason: string }
  | { readonly type: "error"; readonly message: string };
