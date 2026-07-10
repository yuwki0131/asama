export const SIM_TICKS_PER_SECOND = 20;
export const SNAPSHOTS_PER_SECOND = 10;
export const MAP_WIDTH = 128;
export const MAP_HEIGHT = 128;

export type EntityId = string;
export type UnitId = EntityId;
export type BuildingId = EntityId;
export type OwnerId = "player" | "enemy" | "neutral";
export type UnitType = "spear_ashigaru" | "sword_ashigaru" | "archer" | "engineer" | "musketeer" | "cavalry" | "supply_cart";

export type EngineerTaskKind = "ladder" | "fillMoat";
export type TerrainType = "grass" | "dirt" | "water" | "stone" | "cliff";

// --- Elevation (docs/10_development/elevation-contract.md) ------------------

/** Discrete terrain height levels: 0 (base plain) .. 3 (highest terrace). */
export const MAX_ELEVATION = 3;

/** Cardinal direction in cell space (N = -y, E = +x, S = +y, W = -x). */
export type SlopeDirection = "N" | "E" | "S" | "W";

/** Visual skin for elevation edges: natural rock face or castle stone wall. */
export type ElevationSkin = "cliff" | "ishigaki";
export type BuildingType =
  | "fence"
  | "wall"
  | "gate"
  | "gate_wide_2"
  | "gate_wide_3"
  | "gate_ne_sw"
  | "gate_wide_2_ne_sw"
  | "gate_wide_3_ne_sw"
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
  | "tenshu"
  | "yagura";
export type BuildingCategory = "castle" | "moat" | "economy" | "military" | "residential" | "infrastructure" | "objective";
export type BuildingLifecycleState = "intact" | "destroyed";
export type GateState = "open" | "closed";

export interface CellCoord {
  readonly x: number;
  readonly y: number;
}

export interface MapDecoration {
  readonly assetId: string;
  readonly position: CellCoord;
}

export interface TerrainCellSnapshot {
  readonly coord: CellCoord;
  readonly terrain: TerrainType;
  readonly movementCost: number;
  readonly passable: boolean;
  readonly assetId: string;
  /** Discrete height 0..MAX_ELEVATION. Flat worlds are all 0. */
  readonly elevation: number;
  /** Ramp marker: walking toward this direction exits one level above
   *  `elevation`; the opposite edge exits at `elevation`. The two side edges
   *  of a slope cell are cliffs (impassable). null = flat cell. */
  readonly slope: SlopeDirection | null;
  /** Skin used for cliff faces / slope tiles rendered around this cell. */
  readonly elevationSkin: ElevationSkin;
  /** cliff cells only: which face this cell renders ("s" | "e" | "se"). */
  readonly cliffFace?: "s" | "e" | "se";
  /** cliff cells only: elevation drop from the adjacent high cell. */
  readonly cliffHeight?: number;
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
  readonly task: EngineerTaskSnapshot | null;
  /** Sim ticks accumulated toward the next path step (0..ticksPerStep-1). */
  readonly movementProgress: number;
  /** Sim ticks required to advance one cell along the path. Reflects the
   *  current step's climb penalty when moving uphill (elevation-contract.md). */
  readonly ticksPerStep: number;
  /** Elevation of the cell the unit stands on (0 when absent; additive field). */
  readonly elevation?: number;
}

export interface EngineerTaskSnapshot {
  readonly kind: EngineerTaskKind;
  readonly target: CellCoord;
  readonly progress: number;
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
  readonly food: number | null;
  readonly foodCapacity: number | null;
  readonly connectedToHonmaru: boolean;
  readonly ladderHp: number | null;
  readonly fillProgress: number;
  /** Elevation of the building's anchor cell (0 when absent; additive field).
   *  Footprints are always on uniform elevation (elevation-contract.md). */
  readonly elevation?: number;
}

export type GameOutcomeReason = "honmaru_fallen" | "starvation" | "enemy_annihilated" | "time_held" | "supply_cut";

export interface ScenarioBuildingPlacement {
  readonly type: BuildingType;
  readonly position: CellCoord;
  readonly owner?: OwnerId;
}

export interface ScenarioUnitSpawn {
  readonly type: UnitType;
  readonly position: CellCoord;
  readonly owner: OwnerId;
}

export interface ScenarioWave {
  readonly tick: number;
  readonly spawns: readonly { readonly type: UnitType; readonly position: CellCoord }[];
}

// --- Scenario elevation vocabulary (elevation-contract.md, P5) --------------

/** Axis-aligned rectangle of cells: x..x+width-1, y..y+height-1 (inclusive). */
export interface ElevationRectArea {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Filled ellipse of cells: (dx/rx)^2 + (dy/ry)^2 <= 1 around center (cx, cy). */
export interface ElevationEllipseArea {
  readonly kind: "ellipse";
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export type ElevationArea = ElevationRectArea | ElevationEllipseArea;

/** Raises every covered land cell to at least `level` (max-composition:
 *  overlapping patches keep the highest level). Water cells are skipped and
 *  always stay at elevation 0. */
export interface ScenarioElevationPatch {
  readonly area: ElevationArea;
  /** Absolute target level 1..MAX_ELEVATION. */
  readonly level: number;
  /** Edge skin for covered cells: natural rock ("cliff", default) or castle
   *  stone wall ("ishigaki" — use for kuruwa terraces). */
  readonly skin?: ElevationSkin;
}

/** Declares a ramp. `position` is the LOW cell of the ramp; walking `toward`
 *  from it exits one level higher. `width` extends the ramp perpendicular to
 *  `toward` (in +x for N/S ramps, +y for E/W ramps), default 1. */
export interface ScenarioSlope {
  readonly position: CellCoord;
  readonly toward: SlopeDirection;
  readonly width?: number;
}

export interface ScenarioElevationDefinition {
  readonly patches: readonly ScenarioElevationPatch[];
  readonly slopes?: readonly ScenarioSlope[];
}

export interface ScenarioDefinition {
  readonly id: string;
  readonly name: string;
  readonly initialBuildings: readonly ScenarioBuildingPlacement[];
  readonly initialUnits: readonly ScenarioUnitSpawn[];
  readonly waves: readonly ScenarioWave[];
  /** Terrain elevation layout (hills, terraces, ramps). Omitted = fully flat
   *  map (all cells at elevation 0) — existing scenarios need no change. */
  readonly elevation?: ScenarioElevationDefinition;
  readonly victory: {
    /** Defender wins by holding the honmaru until this tick (null: no time victory). */
    readonly holdTicks: number | null;
  };
}

export interface GameOutcome {
  readonly winner: OwnerId;
  readonly reason: GameOutcomeReason;
  readonly tick: number;
}

export interface FoodSnapshot {
  /** Food in storehouses currently connected to the honmaru. */
  readonly available: number;
  /** Food in all intact storehouses regardless of connectivity. */
  readonly total: number;
  readonly capacity: number;
  readonly requiredPerCycle: number;
  readonly nextConsumptionInTicks: number;
}

export type Season = "spring" | "summer" | "autumn" | "winter";

export type MarketTrade = "buyFood" | "sellFood" | "buyWeapons";

export interface EconomySnapshot {
  readonly gold: number;
  readonly weapons: number;
  readonly population: number;
  readonly populationCapacity: number;
  readonly approval: number;
  readonly recruitPool: number;
  readonly recruitPoolMax: number;
  readonly season: Season;
  readonly year: number;
  readonly plantedFarms: number;
}

export interface SupplyRetreatSnapshot {
  readonly active: boolean;
  readonly remainingTicks: number;
}

// --- Combat events (P6: 戦闘エフェクト用の事実データ) ------------------------
//
// The simulation reports combat *facts* only; visual physics (arrow flight
// time, smoke duration, ragdoll timing…) is entirely the renderer's choice.
// Events accumulate per sim tick and are drained into the next snapshot, so a
// snapshot carries every event that happened since the previous snapshot
// (normally 2 ticks at 20 tps / 10 snapshots per second) and each event is
// delivered exactly once.

/** Fields shared by both attack event kinds. Exactly one of `targetId` /
 *  `targetBuildingId` is non-null. */
export interface CombatAttackEventBase {
  /** Sim tick at which the attack resolved (damage applied on this tick). */
  readonly tick: number;
  readonly attackerId: UnitId;
  readonly attackerOwner: OwnerId;
  /** Attacker's unit type — the renderer derives the projectile/effect from
   *  this (archer → arrow, musketeer → smoke + muzzle flash, …). */
  readonly unitType: UnitType;
  readonly attackerPos: CellCoord;
  readonly targetId: UnitId | null;
  readonly targetBuildingId: BuildingId | null;
  /** Target's anchor cell at resolution time (buildings: anchor position). */
  readonly targetPos: CellCoord;
  /** True when the high-ground bonus applied (attacker strictly above the
   *  target, elevation-contract.md: +1 range, x1.25 damage). */
  readonly highGround: boolean;
}

/** A melee strike resolved (attackRange 1 units: 槍・刀・騎馬・工兵). */
export interface AttackMeleeEventSnapshot extends CombatAttackEventBase {
  readonly kind: "attack_melee";
}

/** A ranged shot resolved (attackRange > 1 units: 弓 archer / 鉄砲 musketeer). */
export interface AttackRangedEventSnapshot extends CombatAttackEventBase {
  readonly kind: "attack_ranged";
}

/** Damage was applied. Paired 1:1 with the same-tick attack event of the same
 *  `attackerId` (hit numbers / flash display). For a melee strike on a wall
 *  with an attached ladder the amount went to the ladder, still reported
 *  against the building (siege-system.md: 梯子破壊). */
export interface DamageEventSnapshot {
  readonly kind: "damage";
  readonly tick: number;
  /** Unit whose attack caused this damage (correlate with the attack event). */
  readonly attackerId: UnitId;
  readonly targetId: UnitId | null;
  readonly targetBuildingId: BuildingId | null;
  readonly targetPos: CellCoord;
  readonly amount: number;
}

/** A unit died in combat. The unit is absent from `units` in the same
 *  snapshot, so death VFX must key off this event. Enemy retreat despawns
 *  (supply_cut) are not deaths and emit no event. */
export interface UnitDiedEventSnapshot {
  readonly kind: "unit_died";
  readonly tick: number;
  readonly unitId: UnitId;
  readonly unitType: UnitType;
  readonly owner: OwnerId;
  readonly position: CellCoord;
}

/** A building was destroyed by combat damage (hp reached 0). The building is
 *  absent from `buildings` in the same snapshot; `footprint` is included so
 *  multi-tile debris can be placed. Player demolition and engineer moat fill
 *  emit no event. */
export interface BuildingDestroyedEventSnapshot {
  readonly kind: "building_destroyed";
  readonly tick: number;
  readonly buildingId: BuildingId;
  readonly buildingType: BuildingType;
  readonly owner: OwnerId;
  readonly position: CellCoord;
  readonly footprint: readonly CellCoord[];
}

export type CombatEventSnapshot =
  | AttackMeleeEventSnapshot
  | AttackRangedEventSnapshot
  | DamageEventSnapshot
  | UnitDiedEventSnapshot
  | BuildingDestroyedEventSnapshot;

export interface WorldSnapshot {
  readonly currentTick: number;
  readonly invalidMoveTarget: CellCoord | null;
  readonly outcome: GameOutcome | null;
  readonly food: FoodSnapshot;
  readonly economy: EconomySnapshot;
  /** Increments on every terrain-mutation command (raiseTerrain / lowerTerrain
   *  / placeSlope / removeSlope). The renderer uses this to know when to
   *  rebuild terrain chunks. Absent on legacy payloads (treat as 0). */
  readonly terrainRevision?: number;
  readonly map: {
    readonly width: number;
    readonly height: number;
    readonly cells: readonly TerrainCellSnapshot[];
    readonly decorations: readonly MapDecoration[];
  };
  readonly units: readonly UnitSnapshot[];
  readonly buildings: readonly BuildingSnapshot[];
  readonly supplyRetreat: SupplyRetreatSnapshot;
  /** Combat events since the previous snapshot (exactly-once delivery: the
   *  sim's buffer is drained into the snapshot). Empty when nothing happened;
   *  optional only for compatibility with pre-P6 payloads — snapshotWorld
   *  always sets it. */
  readonly events?: readonly CombatEventSnapshot[];
  /** Tick at which the next enemy wave spawns, or null if all waves have been deployed. */
  readonly nextWaveTick?: number | null;
  /** Tick at which the hold-out victory triggers (null: no time victory). */
  readonly holdDeadlineTick?: number | null;
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
    }
  | {
      readonly type: "recruitUnit";
      readonly unitType: UnitType;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      readonly type: "marketTrade";
      readonly trade: MarketTrade;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      readonly type: "toggleGate";
      readonly position: CellCoord;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      readonly type: "attackMoveUnits";
      readonly unitIds: readonly UnitId[];
      readonly destination: CellCoord;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      readonly type: "stopUnits";
      readonly unitIds: readonly UnitId[];
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      readonly type: "engineerTask";
      readonly unitIds: readonly UnitId[];
      readonly task: EngineerTaskKind;
      readonly position: CellCoord;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      /** Raise the target cell one elevation level (50 gold). */
      readonly type: "raiseTerrain";
      readonly position: CellCoord;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      /** Lower the target cell one elevation level (20 gold). */
      readonly type: "lowerTerrain";
      readonly position: CellCoord;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      /** Place a ramp on the target cell rising toward `toward` (30 gold).
       *  The cell in the `toward` direction must be at exactly elevation+1. */
      readonly type: "placeSlope";
      readonly position: CellCoord;
      readonly toward: SlopeDirection;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    }
  | {
      /** Remove the slope from the target cell, restoring it to a flat surface
       *  at its current elevation (10 gold). */
      readonly type: "removeSlope";
      readonly position: CellCoord;
      readonly issuedAtTick: number;
      readonly clientSequence: number;
    };

export type MainToWorkerMessage =
  /** `scenarioId` is a DEV-only hook for booting test fixtures (e.g. the
   *  elevation render fixture). Omitted / unknown ids boot the default
   *  scenario, so production behaviour is unchanged. */
  | { readonly type: "init"; readonly scenarioId?: string }
  | { readonly type: "setSpeed"; readonly speed: 0 | 1 | 2 | 4 }
  | { readonly type: "enqueueCommand"; readonly command: PlayerCommand }
  | { readonly type: "requestSnapshot" }
  | { readonly type: "requestSaveState" }
  | { readonly type: "loadSaveState"; readonly state: SerializedWorld };

export type WorkerToMainMessage =
  | { readonly type: "ready"; readonly snapshot: WorldSnapshot }
  | { readonly type: "snapshot"; readonly snapshot: WorldSnapshot }
  | { readonly type: "saveState"; readonly state: SerializedWorld }
  | { readonly type: "commandRejected"; readonly reason: string }
  | { readonly type: "error"; readonly message: string };

export interface SerializedWorld {
  readonly version: number;
  readonly world: unknown;
}
