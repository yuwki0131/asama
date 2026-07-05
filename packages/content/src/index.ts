import type { BuildingCategory, BuildingType, GateState, ScenarioDefinition, UnitType } from "@asama/shared";

// --- Building and unit content definitions ---------------------------------
//
// Data-driven definitions consumed by the simulation and the renderer.
// Footprints are rectangles (width x height in cells); the simulation expands
// them to cell lists and applies its blocked-movement sentinel to impassable
// buildings, so `movementCostModifier` is only given for passable ones.

export interface BuildingSpec {
  readonly type: BuildingType;
  readonly category: BuildingCategory;
  readonly maxHp: number;
  readonly footprint: { readonly width: number; readonly height: number };
  readonly passable: boolean;
  readonly movementCostModifier?: number;
  readonly assetId: string;
  readonly gateState: GateState | null;
}

export const buildingSpecs: Record<BuildingType, BuildingSpec> = {
  fence: {
    type: "fence",
    category: "castle",
    maxHp: 120,
    footprint: { width: 1, height: 1 },
    passable: false,
    assetId: "building.fence.wood",
    gateState: null
  },
  wall: {
    type: "wall",
    category: "castle",
    maxHp: 260,
    footprint: { width: 1, height: 1 },
    passable: false,
    assetId: "building.wall.plaster",
    gateState: null
  },
  gate: {
    type: "gate",
    category: "castle",
    maxHp: 220,
    footprint: { width: 1, height: 1 },
    passable: false,
    assetId: "building.gate.wood.closed",
    gateState: "closed"
  },
  gate_wide_2: {
    type: "gate_wide_2",
    category: "castle",
    maxHp: 320,
    footprint: { width: 2, height: 1 },
    passable: false,
    assetId: "building.gate.wood.closed.width2",
    gateState: "closed"
  },
  gate_wide_3: {
    type: "gate_wide_3",
    category: "castle",
    maxHp: 420,
    footprint: { width: 3, height: 1 },
    passable: false,
    assetId: "building.gate.wood.closed.width3",
    gateState: "closed"
  },
  gate_ne_sw: {
    type: "gate_ne_sw",
    category: "castle",
    maxHp: 220,
    footprint: { width: 1, height: 1 },
    passable: false,
    assetId: "building.gate.wood.closed.ne_sw",
    gateState: "closed"
  },
  gate_wide_2_ne_sw: {
    type: "gate_wide_2_ne_sw",
    category: "castle",
    maxHp: 320,
    footprint: { width: 1, height: 2 },
    passable: false,
    assetId: "building.gate.wood.closed.ne_sw.width2",
    gateState: "closed"
  },
  gate_wide_3_ne_sw: {
    type: "gate_wide_3_ne_sw",
    category: "castle",
    maxHp: 420,
    footprint: { width: 1, height: 3 },
    passable: false,
    assetId: "building.gate.wood.closed.ne_sw.width3",
    gateState: "closed"
  },
  dry_moat: {
    type: "dry_moat",
    category: "moat",
    maxHp: 9999,
    footprint: { width: 1, height: 1 },
    passable: true,
    movementCostModifier: 5,
    assetId: "building.dry_moat",
    gateState: null
  },
  water_moat: {
    type: "water_moat",
    category: "moat",
    maxHp: 9999,
    footprint: { width: 1, height: 1 },
    passable: false,
    assetId: "building.water_moat",
    gateState: null
  },
  storehouse: {
    type: "storehouse",
    category: "economy",
    maxHp: 180,
    footprint: { width: 3, height: 3 },
    passable: false,
    assetId: "building.storehouse",
    gateState: null
  },
  market: {
    type: "market",
    category: "economy",
    maxHp: 160,
    footprint: { width: 4, height: 3 },
    passable: false,
    assetId: "building.market",
    gateState: null
  },
  barracks: {
    type: "barracks",
    category: "military",
    maxHp: 220,
    footprint: { width: 4, height: 3 },
    passable: false,
    assetId: "building.barracks",
    gateState: null
  },
  samurai_residence: {
    type: "samurai_residence",
    category: "residential",
    maxHp: 190,
    footprint: { width: 4, height: 4 },
    passable: false,
    assetId: "building.samurai_residence",
    gateState: null
  },
  town_block: {
    type: "town_block",
    category: "residential",
    maxHp: 150,
    footprint: { width: 6, height: 6 },
    passable: false,
    assetId: "building.town_block",
    gateState: null
  },
  farm: {
    type: "farm",
    category: "economy",
    maxHp: 80,
    footprint: { width: 4, height: 4 },
    passable: true,
    movementCostModifier: 2,
    assetId: "building.farm",
    gateState: null
  },
  road: {
    type: "road",
    category: "infrastructure",
    maxHp: 9999,
    footprint: { width: 1, height: 1 },
    passable: true,
    movementCostModifier: 0,
    assetId: "building.road",
    gateState: null
  },
  earth_bridge: {
    type: "earth_bridge",
    category: "infrastructure",
    maxHp: 220,
    footprint: { width: 1, height: 1 },
    passable: true,
    movementCostModifier: 0,
    assetId: "building.earth_bridge",
    gateState: null
  },
  wood_bridge: {
    type: "wood_bridge",
    category: "infrastructure",
    maxHp: 140,
    footprint: { width: 1, height: 1 },
    passable: true,
    movementCostModifier: 1,
    assetId: "building.wood_bridge",
    gateState: null
  },
  honmaru: {
    type: "honmaru",
    category: "objective",
    maxHp: 9999,
    footprint: { width: 1, height: 1 },
    passable: true,
    movementCostModifier: 1,
    assetId: "building.honmaru.marker",
    gateState: null
  },
  tenshu: {
    type: "tenshu",
    category: "objective",
    maxHp: 9999,
    footprint: { width: 8, height: 8 },
    passable: false,
    assetId: "building.tenshu.test",
    gateState: null
  },
  yagura: {
    type: "yagura",
    category: "castle",
    maxHp: 260,
    footprint: { width: 2, height: 2 },
    passable: false,
    assetId: "building.yagura.small.normal",
    gateState: null
  }
};

export interface UnitSpec {
  readonly type: UnitType;
  readonly maxHp: number;
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly attackCooldownSeconds: number;
  readonly ticksPerStep: number;
  readonly assetId: string;
}

export const unitSpecs: Record<UnitType, UnitSpec> = {
  spear_ashigaru: {
    type: "spear_ashigaru",
    maxHp: 100,
    attackDamage: 14,
    attackRange: 1,
    attackCooldownSeconds: 1.3,
    ticksPerStep: 6,
    assetId: "unit.spear_ashigaru.idle.south"
  },
  sword_ashigaru: {
    type: "sword_ashigaru",
    maxHp: 110,
    attackDamage: 18,
    attackRange: 1,
    attackCooldownSeconds: 1.1,
    ticksPerStep: 6,
    assetId: "unit.sword_ashigaru.idle.south"
  },
  archer: {
    type: "archer",
    maxHp: 70,
    attackDamage: 12,
    attackRange: 8,
    attackCooldownSeconds: 1.6,
    ticksPerStep: 7,
    assetId: "unit.archer.idle.south"
  },
  engineer: {
    type: "engineer",
    maxHp: 80,
    attackDamage: 8,
    attackRange: 1,
    attackCooldownSeconds: 1.5,
    ticksPerStep: 7,
    assetId: "unit.engineer.idle.south"
  },
  // assetId is provisional; art team will supply final sprites (renderer falls
  // back to the placeholder asset if the key is not found).
  musketeer: {
    type: "musketeer",
    maxHp: 60,
    attackDamage: 20,
    attackRange: 4,
    attackCooldownSeconds: 2.5,
    ticksPerStep: 7,
    assetId: "unit.musketeer.idle.south"
  },
  cavalry: {
    type: "cavalry",
    maxHp: 140,
    attackDamage: 16,
    attackRange: 1,
    attackCooldownSeconds: 1.2,
    ticksPerStep: 3,
    assetId: "unit.cavalry.idle.south"
  },
  supply_cart: {
    type: "supply_cart",
    maxHp: 80,
    attackDamage: 0,
    attackRange: 0,
    attackCooldownSeconds: 999,
    ticksPerStep: 10,
    assetId: "unit.supply_cart.idle.south"
  }
};

/** Damage multiplier table for unit type affinity.
 *  attacker type → defender type → multiplier.
 *  Missing entries default to 1.0. */
export const UNIT_TYPE_AFFINITY: Partial<Record<UnitType, Partial<Record<UnitType, number>>>> = {
  // 槍→騎兵: 槍が騎兵に対して有利
  spear_ashigaru: { cavalry: 1.5 },
  // 騎兵→弓・鉄砲: 騎兵が射撃兵種に対して有利
  cavalry: { archer: 1.5, musketeer: 1.5 },
  // 弓・鉄砲→歩兵(槍・刀・工兵): 射撃が近接歩兵に対して有利
  archer: { spear_ashigaru: 1.25, sword_ashigaru: 1.25, engineer: 1.25 },
  musketeer: { spear_ashigaru: 1.25, sword_ashigaru: 1.25, engineer: 1.25 }
} as const;


/**
 * MVP defense scenario (docs/07_scenarios/mvp-scenario.md).
 * Wave timings and compositions are provisional balance values.
 */
export const mvpDefenseScenario: ScenarioDefinition = {
  id: "mvp-defense",
  name: "MVP防衛戦",
  initialBuildings: [
  { type: "tenshu", position: { x: 54, y: 54 } },
  { type: "honmaru", position: { x: 62, y: 58 } },
  { type: "yagura", position: { x: 50, y: 58 } },
  { type: "storehouse", position: { x: 47, y: 62 } },
  { type: "market", position: { x: 52, y: 66 } },
  { type: "barracks", position: { x: 60, y: 66 } },
  { type: "samurai_residence", position: { x: 68, y: 55 } },
  { type: "town_block", position: { x: 70, y: 64 } },
  { type: "farm", position: { x: 50, y: 72 } },
  { type: "farm", position: { x: 55, y: 72 } },
  { type: "road", position: { x: 61, y: 64 } },
  { type: "road", position: { x: 62, y: 64 } },
  { type: "road", position: { x: 63, y: 64 } },
  { type: "road", position: { x: 64, y: 65 } },
  { type: "road", position: { x: 65, y: 65 } },
  { type: "road", position: { x: 67, y: 65 } },
  { type: "road", position: { x: 68, y: 65 } },
  { type: "road", position: { x: 69, y: 65 } },
  { type: "fence", position: { x: 52, y: 50 } },
  { type: "fence", position: { x: 53, y: 50 } },
  { type: "fence", position: { x: 54, y: 50 } },
  { type: "fence", position: { x: 55, y: 50 } },
  { type: "wall", position: { x: 56, y: 50 } },
  { type: "wall", position: { x: 57, y: 50 } },
  { type: "wall", position: { x: 58, y: 50 } },
  { type: "wall", position: { x: 59, y: 50 } },
  { type: "gate_wide_3", position: { x: 60, y: 50 } },
  { type: "gate_wide_3", position: { x: 64, y: 74 } },
  { type: "dry_moat", position: { x: 80, y: 58 } },
  { type: "dry_moat", position: { x: 80, y: 59 } },
  { type: "dry_moat", position: { x: 80, y: 60 } },
  { type: "water_moat", position: { x: 82, y: 58 } },
  { type: "water_moat", position: { x: 82, y: 59 } },
  { type: "water_moat", position: { x: 82, y: 60 } },
  { type: "earth_bridge", position: { x: 61, y: 44 } },
  { type: "wood_bridge", position: { x: 62, y: 45 } },
  { type: "gate_wide_3", position: { x: 84, y: 65 }, owner: "enemy" }
  ],
  initialUnits: [
    { type: "spear_ashigaru", position: { x: 62, y: 58 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 62, y: 59 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 63, y: 57 }, owner: "player" },
    { type: "archer", position: { x: 63, y: 58 }, owner: "player" },
    { type: "archer", position: { x: 64, y: 59 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 86, y: 66 }, owner: "enemy" },
    { type: "archer", position: { x: 87, y: 66 }, owner: "enemy" }
  ],
  waves: [
  {
    tick: 2400,
    spawns: [
      { type: "spear_ashigaru", position: { x: 86, y: 63 } },
      { type: "spear_ashigaru", position: { x: 87, y: 68 } }
    ]
  },
  {
    tick: 7200,
    spawns: [
      { type: "spear_ashigaru", position: { x: 86, y: 63 } },
      { type: "sword_ashigaru", position: { x: 86, y: 66 } },
      { type: "engineer", position: { x: 88, y: 65 } },
      { type: "archer", position: { x: 87, y: 68 } }
    ]
  },
  {
    tick: 12000,
    spawns: [
      { type: "spear_ashigaru", position: { x: 86, y: 63 } },
      { type: "spear_ashigaru", position: { x: 86, y: 66 } },
      { type: "sword_ashigaru", position: { x: 87, y: 64 } },
      { type: "engineer", position: { x: 88, y: 65 } },
      { type: "engineer", position: { x: 88, y: 67 } },
      { type: "archer", position: { x: 87, y: 68 } }
    ]
  }
  ],
  victory: {
    // Hold the honmaru for 20 minutes (well past the final wave) to win by
    // endurance; annihilating every wave also wins.
    holdTicks: 24000
  }
};

/**
 * Concentric castle scenario (docs/07_scenarios/concentric-castle.md).
 * A: 環郭式平城 — introductory.
 * Layered defense: east gate line → water moat ring → inner wall.
 * Supply cart in every wave teaches the retreat-timer mechanic.
 * AI profile: 正面強襲型 (frontal assault, single east direction).
 */
export const concentricCastleScenario: ScenarioDefinition = {
  id: "concentric-castle",
  name: "環郭の城",
  initialBuildings: [
    // === Castle core ===
    { type: "tenshu", position: { x: 32, y: 30 } },
    { type: "honmaru", position: { x: 41, y: 40 } },

    // === Inner wall (honmaru enclosure) x=30-43, y=28-43 ===
    // North wall
    { type: "wall", position: { x: 30, y: 28 } },
    { type: "wall", position: { x: 31, y: 28 } },
    { type: "wall", position: { x: 32, y: 28 } },
    { type: "wall", position: { x: 33, y: 28 } },
    { type: "wall", position: { x: 34, y: 28 } },
    { type: "wall", position: { x: 35, y: 28 } },
    { type: "wall", position: { x: 36, y: 28 } },
    { type: "wall", position: { x: 37, y: 28 } },
    { type: "wall", position: { x: 38, y: 28 } },
    { type: "wall", position: { x: 39, y: 28 } },
    { type: "wall", position: { x: 40, y: 28 } },
    { type: "wall", position: { x: 41, y: 28 } },
    { type: "wall", position: { x: 42, y: 28 } },
    { type: "wall", position: { x: 43, y: 28 } },
    // West wall
    { type: "wall", position: { x: 30, y: 29 } },
    { type: "wall", position: { x: 30, y: 30 } },
    { type: "wall", position: { x: 30, y: 31 } },
    { type: "wall", position: { x: 30, y: 32 } },
    { type: "wall", position: { x: 30, y: 33 } },
    { type: "wall", position: { x: 30, y: 34 } },
    { type: "wall", position: { x: 30, y: 35 } },
    { type: "wall", position: { x: 30, y: 36 } },
    { type: "wall", position: { x: 30, y: 37 } },
    { type: "wall", position: { x: 30, y: 38 } },
    { type: "wall", position: { x: 30, y: 39 } },
    { type: "wall", position: { x: 30, y: 40 } },
    { type: "wall", position: { x: 30, y: 41 } },
    { type: "wall", position: { x: 30, y: 42 } },
    // East wall
    { type: "wall", position: { x: 43, y: 29 } },
    { type: "wall", position: { x: 43, y: 30 } },
    { type: "wall", position: { x: 43, y: 31 } },
    { type: "wall", position: { x: 43, y: 32 } },
    { type: "wall", position: { x: 43, y: 33 } },
    { type: "wall", position: { x: 43, y: 34 } },
    { type: "wall", position: { x: 43, y: 35 } },
    { type: "wall", position: { x: 43, y: 36 } },
    { type: "wall", position: { x: 43, y: 37 } },
    { type: "wall", position: { x: 43, y: 38 } },
    { type: "wall", position: { x: 43, y: 39 } },
    { type: "wall", position: { x: 43, y: 40 } },
    { type: "wall", position: { x: 43, y: 41 } },
    { type: "wall", position: { x: 43, y: 42 } },
    // South wall — gate_wide_3 at x=34 occupies x=34,35,36
    { type: "wall", position: { x: 30, y: 43 } },
    { type: "wall", position: { x: 31, y: 43 } },
    { type: "wall", position: { x: 32, y: 43 } },
    { type: "wall", position: { x: 33, y: 43 } },
    { type: "gate_wide_3", position: { x: 34, y: 43 } },
    { type: "wall", position: { x: 37, y: 43 } },
    { type: "wall", position: { x: 38, y: 43 } },
    { type: "wall", position: { x: 39, y: 43 } },
    { type: "wall", position: { x: 40, y: 43 } },
    { type: "wall", position: { x: 41, y: 43 } },
    { type: "wall", position: { x: 42, y: 43 } },
    { type: "wall", position: { x: 43, y: 43 } },

    // === Water moat ring x=28-45, y=26-45 ===
    // North moat
    { type: "water_moat", position: { x: 28, y: 26 } },
    { type: "water_moat", position: { x: 29, y: 26 } },
    { type: "water_moat", position: { x: 30, y: 26 } },
    { type: "water_moat", position: { x: 31, y: 26 } },
    { type: "water_moat", position: { x: 32, y: 26 } },
    { type: "water_moat", position: { x: 33, y: 26 } },
    { type: "water_moat", position: { x: 34, y: 26 } },
    { type: "water_moat", position: { x: 35, y: 26 } },
    { type: "water_moat", position: { x: 36, y: 26 } },
    { type: "water_moat", position: { x: 37, y: 26 } },
    { type: "water_moat", position: { x: 38, y: 26 } },
    { type: "water_moat", position: { x: 39, y: 26 } },
    { type: "water_moat", position: { x: 40, y: 26 } },
    { type: "water_moat", position: { x: 41, y: 26 } },
    { type: "water_moat", position: { x: 42, y: 26 } },
    { type: "water_moat", position: { x: 43, y: 26 } },
    { type: "water_moat", position: { x: 44, y: 26 } },
    { type: "water_moat", position: { x: 45, y: 26 } },
    // West moat
    { type: "water_moat", position: { x: 28, y: 27 } },
    { type: "water_moat", position: { x: 28, y: 28 } },
    { type: "water_moat", position: { x: 28, y: 29 } },
    { type: "water_moat", position: { x: 28, y: 30 } },
    { type: "water_moat", position: { x: 28, y: 31 } },
    { type: "water_moat", position: { x: 28, y: 32 } },
    { type: "water_moat", position: { x: 28, y: 33 } },
    { type: "water_moat", position: { x: 28, y: 34 } },
    { type: "water_moat", position: { x: 28, y: 35 } },
    { type: "water_moat", position: { x: 28, y: 36 } },
    { type: "water_moat", position: { x: 28, y: 37 } },
    { type: "water_moat", position: { x: 28, y: 38 } },
    { type: "water_moat", position: { x: 28, y: 39 } },
    { type: "water_moat", position: { x: 28, y: 40 } },
    { type: "water_moat", position: { x: 28, y: 41 } },
    { type: "water_moat", position: { x: 28, y: 42 } },
    { type: "water_moat", position: { x: 28, y: 43 } },
    { type: "water_moat", position: { x: 28, y: 44 } },
    // East moat
    { type: "water_moat", position: { x: 45, y: 27 } },
    { type: "water_moat", position: { x: 45, y: 28 } },
    { type: "water_moat", position: { x: 45, y: 29 } },
    { type: "water_moat", position: { x: 45, y: 30 } },
    { type: "water_moat", position: { x: 45, y: 31 } },
    { type: "water_moat", position: { x: 45, y: 32 } },
    { type: "water_moat", position: { x: 45, y: 33 } },
    { type: "water_moat", position: { x: 45, y: 34 } },
    { type: "water_moat", position: { x: 45, y: 35 } },
    { type: "water_moat", position: { x: 45, y: 36 } },
    { type: "water_moat", position: { x: 45, y: 37 } },
    { type: "water_moat", position: { x: 45, y: 38 } },
    { type: "water_moat", position: { x: 45, y: 39 } },
    { type: "water_moat", position: { x: 45, y: 40 } },
    { type: "water_moat", position: { x: 45, y: 41 } },
    { type: "water_moat", position: { x: 45, y: 42 } },
    { type: "water_moat", position: { x: 45, y: 43 } },
    { type: "water_moat", position: { x: 45, y: 44 } },
    // South moat — earth_bridge at x=35 aligns with inner wall gate center
    { type: "water_moat", position: { x: 28, y: 45 } },
    { type: "water_moat", position: { x: 29, y: 45 } },
    { type: "water_moat", position: { x: 30, y: 45 } },
    { type: "water_moat", position: { x: 31, y: 45 } },
    { type: "water_moat", position: { x: 32, y: 45 } },
    { type: "water_moat", position: { x: 33, y: 45 } },
    { type: "water_moat", position: { x: 34, y: 45 } },
    { type: "earth_bridge", position: { x: 35, y: 45 } },
    { type: "water_moat", position: { x: 36, y: 45 } },
    { type: "water_moat", position: { x: 37, y: 45 } },
    { type: "water_moat", position: { x: 38, y: 45 } },
    { type: "water_moat", position: { x: 39, y: 45 } },
    { type: "water_moat", position: { x: 40, y: 45 } },
    { type: "water_moat", position: { x: 41, y: 45 } },
    { type: "water_moat", position: { x: 42, y: 45 } },
    { type: "water_moat", position: { x: 43, y: 45 } },
    { type: "water_moat", position: { x: 44, y: 45 } },
    { type: "water_moat", position: { x: 45, y: 45 } },

    // === East gate line (ninomaru first chokepoint) x=54, y=24-50 ===
    // North segment
    { type: "fence", position: { x: 54, y: 24 } },
    { type: "fence", position: { x: 54, y: 25 } },
    { type: "fence", position: { x: 54, y: 26 } },
    { type: "fence", position: { x: 54, y: 27 } },
    { type: "fence", position: { x: 54, y: 28 } },
    { type: "fence", position: { x: 54, y: 29 } },
    { type: "fence", position: { x: 54, y: 30 } },
    { type: "fence", position: { x: 54, y: 31 } },
    { type: "fence", position: { x: 54, y: 32 } },
    { type: "fence", position: { x: 54, y: 33 } },
    { type: "fence", position: { x: 54, y: 34 } },
    { type: "fence", position: { x: 54, y: 35 } },
    // East gate (single): gate_ne_sw at x=54, y=36
    { type: "gate_ne_sw", position: { x: 54, y: 36 } },
    // South segment
    { type: "fence", position: { x: 54, y: 37 } },
    { type: "fence", position: { x: 54, y: 38 } },
    { type: "fence", position: { x: 54, y: 39 } },
    { type: "fence", position: { x: 54, y: 40 } },
    { type: "fence", position: { x: 54, y: 41 } },
    { type: "fence", position: { x: 54, y: 42 } },
    { type: "fence", position: { x: 54, y: 43 } },
    { type: "fence", position: { x: 54, y: 44 } },
    { type: "fence", position: { x: 54, y: 45 } },
    { type: "fence", position: { x: 54, y: 46 } },
    { type: "fence", position: { x: 54, y: 47 } },
    { type: "fence", position: { x: 54, y: 48 } },

    // === Ninomaru buildings (between water moat east side and east gate line) ===
    { type: "yagura", position: { x: 47, y: 27 } },
    { type: "yagura", position: { x: 47, y: 42 } },
    { type: "storehouse", position: { x: 47, y: 32 } },
    { type: "barracks", position: { x: 47, y: 37 } },
    { type: "samurai_residence", position: { x: 22, y: 32 } },

    // === Town (south of water moat, castle-town access road) ===
    { type: "road", position: { x: 35, y: 47 } },
    { type: "road", position: { x: 35, y: 50 } },
    { type: "road", position: { x: 35, y: 54 } },
    { type: "town_block", position: { x: 24, y: 48 } },
    { type: "town_block", position: { x: 38, y: 48 } },
    { type: "town_block", position: { x: 24, y: 58 } },
    { type: "town_block", position: { x: 38, y: 58 } },
    { type: "market", position: { x: 45, y: 50 } },
    { type: "farm", position: { x: 23, y: 66 } },
    { type: "farm", position: { x: 28, y: 66 } },

    // Enemy staging area
    { type: "gate", position: { x: 100, y: 38 }, owner: "enemy" },
  ],
  initialUnits: [
    // Player garrison at honmaru
    { type: "spear_ashigaru", position: { x: 41, y: 40 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 42, y: 40 }, owner: "player" },
    // Player archers guarding east gate
    { type: "archer", position: { x: 53, y: 33 }, owner: "player" },
    { type: "archer", position: { x: 53, y: 39 }, owner: "player" },
    // Spear guard between gate and water moat
    { type: "spear_ashigaru", position: { x: 49, y: 36 }, owner: "player" },

    // Enemy advance scouts
    { type: "spear_ashigaru", position: { x: 87, y: 34 }, owner: "enemy" },
    { type: "archer", position: { x: 88, y: 40 }, owner: "enemy" },
  ],
  waves: [
    {
      // Wave 1 (tick 2400): Light probe — east approach, supply cart introduced.
      // Destroying the cart triggers the retreat timer (兵站切断 victory mechanic).
      tick: 2400,
      spawns: [
        { type: "spear_ashigaru", position: { x: 100, y: 32 } },
        { type: "spear_ashigaru", position: { x: 100, y: 42 } },
        { type: "supply_cart", position: { x: 103, y: 37 } },
      ],
    },
    {
      // Wave 2 (tick 6000): Reinforced probe — sword joins, supply cart again.
      tick: 6000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 100, y: 30 } },
        { type: "spear_ashigaru", position: { x: 100, y: 36 } },
        { type: "sword_ashigaru", position: { x: 100, y: 42 } },
        { type: "supply_cart", position: { x: 103, y: 36 } },
      ],
    },
    {
      // Wave 3 (tick 10000): First musketeer; supply cart is guarded more tightly.
      tick: 10000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 100, y: 30 } },
        { type: "spear_ashigaru", position: { x: 100, y: 38 } },
        { type: "sword_ashigaru", position: { x: 100, y: 44 } },
        { type: "musketeer", position: { x: 102, y: 33 } },
        { type: "supply_cart", position: { x: 104, y: 38 } },
      ],
    },
  ],
  victory: {
    holdTicks: 18000,
  },
};

/**
 * Linear fortress scenario (docs/07_scenarios/linear-fortress.md).
 * B: 連郭式 — standard difficulty.
 * Two compounds (honmaru NW + ninomaru east) linked across a dry moat.
 * Multi-direction assault (east + south) and cavalry introduction.
 * AI profile: 混合型 (mixed — frontal east + cavalry flanking south).
 */
export const linearFortressScenario: ScenarioDefinition = {
  id: "linear-fortress",
  name: "連郭の城",
  initialBuildings: [
    // === Honmaru compound (NW) — wall ring x=15-29, y=14-29 ===
    { type: "tenshu", position: { x: 17, y: 16 } },
    { type: "honmaru", position: { x: 26, y: 26 } },

    // North wall
    { type: "wall", position: { x: 15, y: 14 } },
    { type: "wall", position: { x: 16, y: 14 } },
    { type: "wall", position: { x: 17, y: 14 } },
    { type: "wall", position: { x: 18, y: 14 } },
    { type: "wall", position: { x: 19, y: 14 } },
    { type: "wall", position: { x: 20, y: 14 } },
    { type: "wall", position: { x: 21, y: 14 } },
    { type: "wall", position: { x: 22, y: 14 } },
    { type: "wall", position: { x: 23, y: 14 } },
    { type: "wall", position: { x: 24, y: 14 } },
    { type: "wall", position: { x: 25, y: 14 } },
    { type: "wall", position: { x: 26, y: 14 } },
    { type: "wall", position: { x: 27, y: 14 } },
    { type: "wall", position: { x: 28, y: 14 } },
    { type: "wall", position: { x: 29, y: 14 } },
    // South wall
    { type: "wall", position: { x: 15, y: 29 } },
    { type: "wall", position: { x: 16, y: 29 } },
    { type: "wall", position: { x: 17, y: 29 } },
    { type: "wall", position: { x: 18, y: 29 } },
    { type: "wall", position: { x: 19, y: 29 } },
    { type: "wall", position: { x: 20, y: 29 } },
    { type: "wall", position: { x: 21, y: 29 } },
    { type: "wall", position: { x: 22, y: 29 } },
    { type: "wall", position: { x: 23, y: 29 } },
    { type: "wall", position: { x: 24, y: 29 } },
    { type: "wall", position: { x: 25, y: 29 } },
    { type: "wall", position: { x: 26, y: 29 } },
    { type: "wall", position: { x: 27, y: 29 } },
    { type: "wall", position: { x: 28, y: 29 } },
    { type: "wall", position: { x: 29, y: 29 } },
    // West wall
    { type: "wall", position: { x: 15, y: 15 } },
    { type: "wall", position: { x: 15, y: 16 } },
    { type: "wall", position: { x: 15, y: 17 } },
    { type: "wall", position: { x: 15, y: 18 } },
    { type: "wall", position: { x: 15, y: 19 } },
    { type: "wall", position: { x: 15, y: 20 } },
    { type: "wall", position: { x: 15, y: 21 } },
    { type: "wall", position: { x: 15, y: 22 } },
    { type: "wall", position: { x: 15, y: 23 } },
    { type: "wall", position: { x: 15, y: 24 } },
    { type: "wall", position: { x: 15, y: 25 } },
    { type: "wall", position: { x: 15, y: 26 } },
    { type: "wall", position: { x: 15, y: 27 } },
    { type: "wall", position: { x: 15, y: 28 } },
    // East wall — gate_wide_3_ne_sw at x=29, y=21 (spans y=21,22,23)
    { type: "wall", position: { x: 29, y: 15 } },
    { type: "wall", position: { x: 29, y: 16 } },
    { type: "wall", position: { x: 29, y: 17 } },
    { type: "wall", position: { x: 29, y: 18 } },
    { type: "wall", position: { x: 29, y: 19 } },
    { type: "wall", position: { x: 29, y: 20 } },
    { type: "gate_wide_3_ne_sw", position: { x: 29, y: 21 } },
    { type: "wall", position: { x: 29, y: 24 } },
    { type: "wall", position: { x: 29, y: 25 } },
    { type: "wall", position: { x: 29, y: 26 } },
    { type: "wall", position: { x: 29, y: 27 } },
    { type: "wall", position: { x: 29, y: 28 } },

    // === Dry moat between compounds x=31-32, y=12-30 (bridges at y=22) ===
    { type: "dry_moat", position: { x: 31, y: 12 } },
    { type: "dry_moat", position: { x: 31, y: 13 } },
    { type: "dry_moat", position: { x: 31, y: 14 } },
    { type: "dry_moat", position: { x: 31, y: 15 } },
    { type: "dry_moat", position: { x: 31, y: 16 } },
    { type: "dry_moat", position: { x: 31, y: 17 } },
    { type: "dry_moat", position: { x: 31, y: 18 } },
    { type: "dry_moat", position: { x: 31, y: 19 } },
    { type: "dry_moat", position: { x: 31, y: 20 } },
    { type: "dry_moat", position: { x: 31, y: 21 } },
    { type: "earth_bridge", position: { x: 31, y: 22 } },
    { type: "dry_moat", position: { x: 31, y: 23 } },
    { type: "dry_moat", position: { x: 31, y: 24 } },
    { type: "dry_moat", position: { x: 31, y: 25 } },
    { type: "dry_moat", position: { x: 31, y: 26 } },
    { type: "dry_moat", position: { x: 31, y: 27 } },
    { type: "dry_moat", position: { x: 31, y: 28 } },
    { type: "dry_moat", position: { x: 31, y: 29 } },
    { type: "dry_moat", position: { x: 31, y: 30 } },
    { type: "dry_moat", position: { x: 32, y: 12 } },
    { type: "dry_moat", position: { x: 32, y: 13 } },
    { type: "dry_moat", position: { x: 32, y: 14 } },
    { type: "dry_moat", position: { x: 32, y: 15 } },
    { type: "dry_moat", position: { x: 32, y: 16 } },
    { type: "dry_moat", position: { x: 32, y: 17 } },
    { type: "dry_moat", position: { x: 32, y: 18 } },
    { type: "dry_moat", position: { x: 32, y: 19 } },
    { type: "dry_moat", position: { x: 32, y: 20 } },
    { type: "dry_moat", position: { x: 32, y: 21 } },
    { type: "earth_bridge", position: { x: 32, y: 22 } },
    { type: "dry_moat", position: { x: 32, y: 23 } },
    { type: "dry_moat", position: { x: 32, y: 24 } },
    { type: "dry_moat", position: { x: 32, y: 25 } },
    { type: "dry_moat", position: { x: 32, y: 26 } },
    { type: "dry_moat", position: { x: 32, y: 27 } },
    { type: "dry_moat", position: { x: 32, y: 28 } },
    { type: "dry_moat", position: { x: 32, y: 29 } },
    { type: "dry_moat", position: { x: 32, y: 30 } },

    // === Ninomaru fence ring x=34-54, y=12-30 ===
    // North fence
    { type: "fence", position: { x: 34, y: 12 } },
    { type: "fence", position: { x: 35, y: 12 } },
    { type: "fence", position: { x: 36, y: 12 } },
    { type: "fence", position: { x: 37, y: 12 } },
    { type: "fence", position: { x: 38, y: 12 } },
    { type: "fence", position: { x: 39, y: 12 } },
    { type: "fence", position: { x: 40, y: 12 } },
    { type: "fence", position: { x: 41, y: 12 } },
    { type: "fence", position: { x: 42, y: 12 } },
    { type: "fence", position: { x: 43, y: 12 } },
    { type: "fence", position: { x: 44, y: 12 } },
    { type: "fence", position: { x: 45, y: 12 } },
    { type: "fence", position: { x: 46, y: 12 } },
    { type: "fence", position: { x: 47, y: 12 } },
    { type: "fence", position: { x: 48, y: 12 } },
    { type: "fence", position: { x: 49, y: 12 } },
    { type: "fence", position: { x: 50, y: 12 } },
    { type: "fence", position: { x: 51, y: 12 } },
    { type: "fence", position: { x: 52, y: 12 } },
    { type: "fence", position: { x: 53, y: 12 } },
    { type: "fence", position: { x: 54, y: 12 } },
    // South fence
    { type: "fence", position: { x: 34, y: 30 } },
    { type: "fence", position: { x: 35, y: 30 } },
    { type: "fence", position: { x: 36, y: 30 } },
    { type: "fence", position: { x: 37, y: 30 } },
    { type: "fence", position: { x: 38, y: 30 } },
    { type: "fence", position: { x: 39, y: 30 } },
    { type: "fence", position: { x: 40, y: 30 } },
    { type: "fence", position: { x: 41, y: 30 } },
    { type: "fence", position: { x: 42, y: 30 } },
    { type: "fence", position: { x: 43, y: 30 } },
    { type: "fence", position: { x: 44, y: 30 } },
    { type: "fence", position: { x: 45, y: 30 } },
    { type: "fence", position: { x: 46, y: 30 } },
    { type: "fence", position: { x: 47, y: 30 } },
    { type: "fence", position: { x: 48, y: 30 } },
    { type: "fence", position: { x: 49, y: 30 } },
    { type: "fence", position: { x: 50, y: 30 } },
    { type: "fence", position: { x: 51, y: 30 } },
    { type: "fence", position: { x: 52, y: 30 } },
    { type: "fence", position: { x: 53, y: 30 } },
    { type: "fence", position: { x: 54, y: 30 } },
    // West fence
    { type: "fence", position: { x: 34, y: 13 } },
    { type: "fence", position: { x: 34, y: 14 } },
    { type: "fence", position: { x: 34, y: 15 } },
    { type: "fence", position: { x: 34, y: 16 } },
    { type: "fence", position: { x: 34, y: 17 } },
    { type: "fence", position: { x: 34, y: 18 } },
    { type: "fence", position: { x: 34, y: 19 } },
    { type: "fence", position: { x: 34, y: 20 } },
    { type: "fence", position: { x: 34, y: 21 } },
    { type: "fence", position: { x: 34, y: 22 } },
    { type: "fence", position: { x: 34, y: 23 } },
    { type: "fence", position: { x: 34, y: 24 } },
    { type: "fence", position: { x: 34, y: 25 } },
    { type: "fence", position: { x: 34, y: 26 } },
    { type: "fence", position: { x: 34, y: 27 } },
    { type: "fence", position: { x: 34, y: 28 } },
    { type: "fence", position: { x: 34, y: 29 } },
    // East fence — gate_wide_3_ne_sw at x=54, y=21 (spans y=21,22,23)
    { type: "fence", position: { x: 54, y: 13 } },
    { type: "fence", position: { x: 54, y: 14 } },
    { type: "fence", position: { x: 54, y: 15 } },
    { type: "fence", position: { x: 54, y: 16 } },
    { type: "fence", position: { x: 54, y: 17 } },
    { type: "fence", position: { x: 54, y: 18 } },
    { type: "fence", position: { x: 54, y: 19 } },
    { type: "fence", position: { x: 54, y: 20 } },
    { type: "gate_wide_3_ne_sw", position: { x: 54, y: 21 } },
    { type: "fence", position: { x: 54, y: 24 } },
    { type: "fence", position: { x: 54, y: 25 } },
    { type: "fence", position: { x: 54, y: 26 } },
    { type: "fence", position: { x: 54, y: 27 } },
    { type: "fence", position: { x: 54, y: 28 } },
    { type: "fence", position: { x: 54, y: 29 } },

    // === Ninomaru buildings ===
    { type: "yagura", position: { x: 35, y: 13 } },
    { type: "yagura", position: { x: 51, y: 27 } },
    { type: "barracks", position: { x: 36, y: 19 } },
    { type: "storehouse", position: { x: 46, y: 13 } },
    { type: "storehouse", position: { x: 36, y: 24 } },

    // === Road system (east exit road + south turn) ===
    { type: "road", position: { x: 55, y: 22 } },
    { type: "road", position: { x: 57, y: 22 } },
    { type: "road", position: { x: 59, y: 22 } },
    { type: "road", position: { x: 61, y: 22 } },
    { type: "road", position: { x: 63, y: 22 } },
    { type: "road", position: { x: 63, y: 25 } },
    { type: "road", position: { x: 63, y: 30 } },
    { type: "road", position: { x: 63, y: 38 } },
    { type: "road", position: { x: 63, y: 46 } },

    // === Town (SE of castle) ===
    { type: "town_block", position: { x: 56, y: 34 } },
    { type: "town_block", position: { x: 56, y: 42 } },
    { type: "town_block", position: { x: 64, y: 34 } },
    { type: "market", position: { x: 47, y: 34 } },
    { type: "samurai_residence", position: { x: 47, y: 40 } },
    { type: "samurai_residence", position: { x: 41, y: 32 } },
    { type: "farm", position: { x: 42, y: 47 } },
    { type: "farm", position: { x: 48, y: 49 } },

    // Enemy staging areas (east and south)
    { type: "gate", position: { x: 100, y: 22 }, owner: "enemy" },
    { type: "gate", position: { x: 63, y: 100 }, owner: "enemy" },
  ],
  initialUnits: [
    // Player garrison in honmaru
    { type: "spear_ashigaru", position: { x: 26, y: 26 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 27, y: 27 }, owner: "player" },
    // Archer guarding ninomaru east gate
    { type: "archer", position: { x: 53, y: 22 }, owner: "player" },
    // Spear at ninomaru east gate
    { type: "spear_ashigaru", position: { x: 51, y: 22 }, owner: "player" },
    // Archer covering southern road
    { type: "archer", position: { x: 62, y: 48 }, owner: "player" },

    // Enemy advance scouts (east bank)
    { type: "spear_ashigaru", position: { x: 85, y: 21 }, owner: "enemy" },
    { type: "archer", position: { x: 86, y: 25 }, owner: "enemy" },
  ],
  waves: [
    {
      // Wave 1 (tick 2400): Light east probe with supply cart.
      tick: 2400,
      spawns: [
        { type: "spear_ashigaru", position: { x: 100, y: 19 } },
        { type: "spear_ashigaru", position: { x: 100, y: 24 } },
        { type: "supply_cart", position: { x: 103, y: 21 } },
      ],
    },
    {
      // Wave 2 (tick 6000): East main assault + south probe. Two-front pressure begins.
      tick: 6000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 100, y: 18 } },
        { type: "spear_ashigaru", position: { x: 100, y: 22 } },
        { type: "archer", position: { x: 100, y: 26 } },
        { type: "supply_cart", position: { x: 103, y: 21 } },
        // South probe — tests the undefended flank
        { type: "spear_ashigaru", position: { x: 61, y: 100 } },
        { type: "archer", position: { x: 64, y: 102 } },
      ],
    },
    {
      // Wave 3 (tick 10000): Cavalry flanks south; engineer begins moat-fill from east.
      tick: 10000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 100, y: 18 } },
        { type: "sword_ashigaru", position: { x: 100, y: 22 } },
        { type: "engineer", position: { x: 102, y: 20 } },
        { type: "cavalry", position: { x: 100, y: 27 } },
        { type: "supply_cart", position: { x: 104, y: 21 } },
        // South cavalry flanking — fast and hard to intercept
        { type: "cavalry", position: { x: 60, y: 100 } },
        { type: "spear_ashigaru", position: { x: 64, y: 100 } },
      ],
    },
    {
      // Wave 4 (tick 15000): Full coordinated assault — east and south simultaneously.
      // Musketeer provides long-range fire support from the east.
      tick: 15000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 100, y: 17 } },
        { type: "sword_ashigaru", position: { x: 100, y: 21 } },
        { type: "sword_ashigaru", position: { x: 100, y: 25 } },
        { type: "archer", position: { x: 100, y: 29 } },
        { type: "engineer", position: { x: 102, y: 21 } },
        { type: "cavalry", position: { x: 100, y: 32 } },
        { type: "musketeer", position: { x: 102, y: 25 } },
        { type: "supply_cart", position: { x: 104, y: 21 } },
        // South assault column
        { type: "spear_ashigaru", position: { x: 59, y: 100 } },
        { type: "sword_ashigaru", position: { x: 62, y: 100 } },
        { type: "cavalry", position: { x: 66, y: 100 } },
        { type: "supply_cart", position: { x: 62, y: 104 } },
      ],
    },
  ],
  victory: {
    holdTicks: 24000,
  },
};

/**
 * Riverside defense scenario (docs/07_scenarios/riverside-defense.md).
 * C: 川城+門前町 — advanced.
 * A river acts as the primary barrier; two bridges are the key chokepoints.
 * New unit types (musketeer, cavalry, supply_cart) appear in later waves.
 * AI profile: 混合型 (mixed — bridge assault + engineer bridge-break + cavalry probe).
 */
export const riversideDefenseScenario: ScenarioDefinition = {
  id: "riverside-defense",
  name: "川沿いの城",
  initialBuildings: [
    // === Castle core (west bank) ===
    { type: "tenshu", position: { x: 30, y: 46 } },
    { type: "honmaru", position: { x: 42, y: 57 } },

    // Watchtower guarding the NE approach
    { type: "yagura", position: { x: 46, y: 43 } },

    // Military and economy
    { type: "barracks", position: { x: 35, y: 58 } },
    { type: "storehouse", position: { x: 35, y: 63 } },
    { type: "market", position: { x: 40, y: 63 } },
    { type: "samurai_residence", position: { x: 44, y: 63 } },
    { type: "town_block", position: { x: 38, y: 67 } },

    // Farms on the safe western flank
    { type: "farm", position: { x: 24, y: 50 } },
    { type: "farm", position: { x: 24, y: 56 } },

    // === Outer fence line (north perimeter) ===
    { type: "fence", position: { x: 28, y: 43 } },
    { type: "fence", position: { x: 30, y: 43 } },
    { type: "fence", position: { x: 32, y: 43 } },
    { type: "fence", position: { x: 34, y: 43 } },
    { type: "fence", position: { x: 36, y: 43 } },
    { type: "fence", position: { x: 38, y: 43 } },
    { type: "fence", position: { x: 40, y: 43 } },
    { type: "fence", position: { x: 42, y: 43 } },
    { type: "fence", position: { x: 44, y: 43 } },

    // === East wall (castle perimeter facing the river) ===
    // Continuous wall y=44-55, then 3-wide vertical gate, then y=59-70
    { type: "wall", position: { x: 52, y: 44 } },
    { type: "wall", position: { x: 52, y: 45 } },
    { type: "wall", position: { x: 52, y: 46 } },
    { type: "wall", position: { x: 52, y: 47 } },
    { type: "wall", position: { x: 52, y: 48 } },
    { type: "wall", position: { x: 52, y: 49 } },
    { type: "wall", position: { x: 52, y: 50 } },
    { type: "wall", position: { x: 52, y: 51 } },
    { type: "wall", position: { x: 52, y: 52 } },
    { type: "wall", position: { x: 52, y: 53 } },
    { type: "wall", position: { x: 52, y: 54 } },
    { type: "wall", position: { x: 52, y: 55 } },
    // Main gate: 3-wide vertical opening (occupies x=52, y=56-58)
    { type: "gate_wide_3_ne_sw", position: { x: 52, y: 56 } },
    { type: "wall", position: { x: 52, y: 59 } },
    { type: "wall", position: { x: 52, y: 60 } },
    { type: "wall", position: { x: 52, y: 61 } },
    { type: "wall", position: { x: 52, y: 62 } },
    { type: "wall", position: { x: 52, y: 63 } },
    { type: "wall", position: { x: 52, y: 64 } },
    { type: "wall", position: { x: 52, y: 65 } },
    { type: "wall", position: { x: 52, y: 66 } },
    { type: "wall", position: { x: 52, y: 67 } },
    { type: "wall", position: { x: 52, y: 68 } },
    { type: "wall", position: { x: 52, y: 69 } },
    { type: "wall", position: { x: 52, y: 70 } },

    // === Bridge approach gates (west shore — choke the exits) ===
    { type: "gate", position: { x: 56, y: 50 } },
    { type: "gate", position: { x: 56, y: 66 } },

    // Roads connecting castle gate to bridge approach gates
    { type: "road", position: { x: 54, y: 57 } },
    { type: "road", position: { x: 55, y: 50 } },
    { type: "road", position: { x: 55, y: 66 } },

    // === River (water moat at x=58 — natural barrier) ===
    // North section: above north bridge
    { type: "water_moat", position: { x: 58, y: 44 } },
    { type: "water_moat", position: { x: 58, y: 46 } },
    { type: "water_moat", position: { x: 58, y: 48 } },
    // North bridge crossing (wood — less durable)
    { type: "wood_bridge", position: { x: 58, y: 50 } },
    // Middle section: between the two bridges
    { type: "water_moat", position: { x: 58, y: 52 } },
    { type: "water_moat", position: { x: 58, y: 54 } },
    { type: "water_moat", position: { x: 58, y: 56 } },
    { type: "water_moat", position: { x: 58, y: 58 } },
    { type: "water_moat", position: { x: 58, y: 60 } },
    { type: "water_moat", position: { x: 58, y: 62 } },
    { type: "water_moat", position: { x: 58, y: 64 } },
    // South bridge crossing (earth — more durable)
    { type: "earth_bridge", position: { x: 58, y: 66 } },
    // South section: below south bridge
    { type: "water_moat", position: { x: 58, y: 68 } },
    { type: "water_moat", position: { x: 58, y: 70 } },
    { type: "water_moat", position: { x: 58, y: 72 } },

    // === East bank (enemy approach roads) ===
    { type: "road", position: { x: 60, y: 50 } },
    { type: "road", position: { x: 62, y: 50 } },
    { type: "road", position: { x: 60, y: 66 } },
    { type: "road", position: { x: 62, y: 66 } },

    // Enemy staging area
    { type: "gate", position: { x: 80, y: 58 }, owner: "enemy" },
  ],
  initialUnits: [
    // Player garrison at honmaru
    { type: "spear_ashigaru", position: { x: 42, y: 57 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 43, y: 57 }, owner: "player" },
    // Player archers covering bridge exits
    { type: "archer", position: { x: 55, y: 50 }, owner: "player" },
    { type: "archer", position: { x: 55, y: 66 }, owner: "player" },
    // Player spear guard in front of castle gate
    { type: "spear_ashigaru", position: { x: 50, y: 57 }, owner: "player" },

    // Enemy advance scouts on east bank
    { type: "spear_ashigaru", position: { x: 78, y: 56 }, owner: "enemy" },
    { type: "archer", position: { x: 78, y: 60 }, owner: "enemy" },
  ],
  waves: [
    {
      // Wave 1 (tick 1800): Light probe — tests north bridge.
      tick: 1800,
      spawns: [
        { type: "spear_ashigaru", position: { x: 90, y: 50 } },
        { type: "spear_ashigaru", position: { x: 90, y: 52 } },
      ],
    },
    {
      // Wave 2 (tick 5400): Archer fire support. Supply cart introduced.
      tick: 5400,
      spawns: [
        { type: "spear_ashigaru", position: { x: 90, y: 48 } },
        { type: "spear_ashigaru", position: { x: 90, y: 52 } },
        { type: "archer", position: { x: 92, y: 50 } },
        { type: "supply_cart", position: { x: 94, y: 50 } },
      ],
    },
    {
      // Wave 3 (tick 9000): First engineer; dual bridge pressure begins. Supply cart.
      tick: 9000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 90, y: 50 } },
        { type: "sword_ashigaru", position: { x: 90, y: 54 } },
        { type: "engineer", position: { x: 92, y: 52 } },
        { type: "spear_ashigaru", position: { x: 90, y: 66 } },
        { type: "archer", position: { x: 92, y: 68 } },
        { type: "supply_cart", position: { x: 94, y: 58 } },
      ],
    },
    {
      // Wave 4 (tick 13200): Coordinated two-bridge assault. Musketeer ranged support.
      tick: 13200,
      spawns: [
        { type: "spear_ashigaru", position: { x: 90, y: 48 } },
        { type: "sword_ashigaru", position: { x: 90, y: 50 } },
        { type: "engineer", position: { x: 92, y: 50 } },
        { type: "archer", position: { x: 90, y: 52 } },
        { type: "spear_ashigaru", position: { x: 90, y: 64 } },
        { type: "sword_ashigaru", position: { x: 90, y: 66 } },
        { type: "engineer", position: { x: 92, y: 66 } },
        { type: "archer", position: { x: 90, y: 68 } },
        { type: "musketeer", position: { x: 93, y: 52 } },
        { type: "supply_cart", position: { x: 95, y: 50 } },
      ],
    },
    {
      // Wave 5 (tick 18000): Elite final assault — cavalry probe + musketeer suppression.
      // Two supply carts (north and south groups) to teach dual-cart interception.
      tick: 18000,
      spawns: [
        { type: "sword_ashigaru", position: { x: 90, y: 46 } },
        { type: "sword_ashigaru", position: { x: 90, y: 50 } },
        { type: "engineer", position: { x: 92, y: 48 } },
        { type: "engineer", position: { x: 92, y: 52 } },
        { type: "archer", position: { x: 90, y: 54 } },
        { type: "sword_ashigaru", position: { x: 90, y: 64 } },
        { type: "spear_ashigaru", position: { x: 90, y: 66 } },
        { type: "archer", position: { x: 90, y: 68 } },
        { type: "archer", position: { x: 90, y: 70 } },
        { type: "cavalry", position: { x: 90, y: 58 } },
        { type: "musketeer", position: { x: 93, y: 56 } },
        { type: "supply_cart", position: { x: 95, y: 48 } },
        { type: "supply_cart", position: { x: 95, y: 66 } },
      ],
    },
  ],
  victory: {
    holdTicks: 30000,
  },
};

/** Release 1.0 scenario roster in ascending difficulty order.
 *  A: 環郭式平城(入門) / B: 連郭式(標準) / C: 川城+門前町(上級) */
export const scenarios: readonly ScenarioDefinition[] = [
  concentricCastleScenario,
  linearFortressScenario,
  riversideDefenseScenario,
];
