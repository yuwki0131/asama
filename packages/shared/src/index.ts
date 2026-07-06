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
export type TerrainType = "grass" | "dirt" | "water" | "stone";

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

export interface WorldSnapshot {
  readonly currentTick: number;
  readonly invalidMoveTarget: CellCoord | null;
  readonly outcome: GameOutcome | null;
  readonly food: FoodSnapshot;
  readonly economy: EconomySnapshot;
  readonly map: {
    readonly width: number;
    readonly height: number;
    readonly cells: readonly TerrainCellSnapshot[];
    readonly decorations: readonly MapDecoration[];
  };
  readonly units: readonly UnitSnapshot[];
  readonly buildings: readonly BuildingSnapshot[];
  readonly supplyRetreat: SupplyRetreatSnapshot;
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
