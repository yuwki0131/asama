import type { BuildingCategory, BuildingType, GateState, ScenarioDefinition, UnitType } from "@asama/shared";
import { mountainCastleScenario } from "./mountain-castle";
import { freePlayScenario } from "./free-play";
import { waterCastleScenario } from "./water-castle";
import { fiveTierKeepScenario } from "./five-tier-keep";
import { cutPassFortScenario } from "./cut-pass-fort";
import { castleTownGateScenario } from "./castle-town-gate";
import { steppedFortressScenario } from "./stepped-fortress";

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
    footprint: { width: 5, height: 5 },
    passable: false,
    assetId: "building.tenshu.main",
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

/** Scenario definition extended with an optional description string.
 *  Implemented entirely within content — SharedScenarioDefinition remains unchanged. */
export interface ContentScenarioDefinition extends ScenarioDefinition {
  readonly description?: string;
}

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
  { type: "tenshu", position: { x: 55, y: 55 } },
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
 * 本丸(壁+水堀)を二之丸柵が包囲する同心円配置。敵は南の大手道から進軍。
 * 各波に補給荷車が同行し、撃破で撤退タイマー発動を体験させる。
 * AI profile: 正面強襲型 (frontal assault, single south direction).
 */
export const concentricCastleScenario: ContentScenarioDefinition = {
  id: "concentric-castle",
  name: "環郭の城",
  description: "同心円状の防衛リングで敵の南進を食い止める入門シナリオ。補給荷車を撃破して撤退タイマーを発動させよう。",
  initialBuildings: [
    // === 本丸(内郭) — 壁リング x=56-70, y=28-43 ===
    // 北壁
    { type: "wall", position: { x: 56, y: 66 } },
    { type: "wall", position: { x: 57, y: 66 } },
    { type: "wall", position: { x: 58, y: 66 } },
    { type: "wall", position: { x: 59, y: 66 } },
    { type: "wall", position: { x: 60, y: 66 } },
    { type: "wall", position: { x: 61, y: 66 } },
    { type: "wall", position: { x: 62, y: 66 } },
    { type: "wall", position: { x: 63, y: 66 } },
    { type: "wall", position: { x: 64, y: 66 } },
    { type: "wall", position: { x: 65, y: 66 } },
    { type: "wall", position: { x: 66, y: 66 } },
    { type: "wall", position: { x: 67, y: 66 } },
    { type: "wall", position: { x: 68, y: 66 } },
    { type: "wall", position: { x: 69, y: 66 } },
    { type: "wall", position: { x: 70, y: 66 } },
    // 西壁
    { type: "wall", position: { x: 56, y: 67 } },
    { type: "wall", position: { x: 56, y: 68 } },
    { type: "wall", position: { x: 56, y: 69 } },
    { type: "wall", position: { x: 56, y: 70 } },
    { type: "wall", position: { x: 56, y: 71 } },
    { type: "wall", position: { x: 56, y: 72 } },
    { type: "wall", position: { x: 56, y: 73 } },
    { type: "wall", position: { x: 56, y: 74 } },
    { type: "wall", position: { x: 56, y: 75 } },
    { type: "wall", position: { x: 56, y: 76 } },
    { type: "wall", position: { x: 56, y: 77 } },
    { type: "wall", position: { x: 56, y: 78 } },
    { type: "wall", position: { x: 56, y: 79 } },
    { type: "wall", position: { x: 56, y: 80 } },
    // 東壁
    { type: "wall", position: { x: 70, y: 67 } },
    { type: "wall", position: { x: 70, y: 68 } },
    { type: "wall", position: { x: 70, y: 69 } },
    { type: "wall", position: { x: 70, y: 70 } },
    { type: "wall", position: { x: 70, y: 71 } },
    { type: "wall", position: { x: 70, y: 72 } },
    { type: "wall", position: { x: 70, y: 73 } },
    { type: "wall", position: { x: 70, y: 74 } },
    { type: "wall", position: { x: 70, y: 75 } },
    { type: "wall", position: { x: 70, y: 76 } },
    { type: "wall", position: { x: 70, y: 77 } },
    { type: "wall", position: { x: 70, y: 78 } },
    { type: "wall", position: { x: 70, y: 79 } },
    { type: "wall", position: { x: 70, y: 80 } },
    // 南壁 — gate_wide_3 at x=62 (x=62,63,64 を占有)
    { type: "wall", position: { x: 56, y: 81 } },
    { type: "wall", position: { x: 57, y: 81 } },
    { type: "wall", position: { x: 58, y: 81 } },
    { type: "wall", position: { x: 59, y: 81 } },
    { type: "wall", position: { x: 60, y: 81 } },
    { type: "wall", position: { x: 61, y: 81 } },
    { type: "gate_wide_3", position: { x: 62, y: 81 } },
    { type: "wall", position: { x: 65, y: 81 } },
    { type: "wall", position: { x: 66, y: 81 } },
    { type: "wall", position: { x: 67, y: 81 } },
    { type: "wall", position: { x: 68, y: 81 } },
    { type: "wall", position: { x: 69, y: 81 } },
    { type: "wall", position: { x: 70, y: 81 } },
    // 天守(5×5) + 本丸マーカー
    { type: "tenshu", position: { x: 58, y: 68 } },
    { type: "honmaru", position: { x: 67, y: 78 } },

    // === 水堀リング x=54-72, y=26-45 ===
    // 北堀
    { type: "water_moat", position: { x: 54, y: 64 } },
    { type: "water_moat", position: { x: 55, y: 64 } },
    { type: "water_moat", position: { x: 56, y: 64 } },
    { type: "water_moat", position: { x: 57, y: 64 } },
    { type: "water_moat", position: { x: 58, y: 64 } },
    { type: "water_moat", position: { x: 59, y: 64 } },
    { type: "water_moat", position: { x: 60, y: 64 } },
    { type: "water_moat", position: { x: 61, y: 64 } },
    { type: "water_moat", position: { x: 62, y: 64 } },
    { type: "water_moat", position: { x: 63, y: 64 } },
    { type: "water_moat", position: { x: 64, y: 64 } },
    { type: "water_moat", position: { x: 65, y: 64 } },
    { type: "water_moat", position: { x: 66, y: 64 } },
    { type: "water_moat", position: { x: 67, y: 64 } },
    { type: "water_moat", position: { x: 68, y: 64 } },
    { type: "water_moat", position: { x: 69, y: 64 } },
    { type: "water_moat", position: { x: 70, y: 64 } },
    { type: "water_moat", position: { x: 71, y: 64 } },
    { type: "water_moat", position: { x: 72, y: 64 } },
    // 西堀
    { type: "water_moat", position: { x: 54, y: 65 } },
    { type: "water_moat", position: { x: 54, y: 66 } },
    { type: "water_moat", position: { x: 54, y: 67 } },
    { type: "water_moat", position: { x: 54, y: 68 } },
    { type: "water_moat", position: { x: 54, y: 69 } },
    { type: "water_moat", position: { x: 54, y: 70 } },
    { type: "water_moat", position: { x: 54, y: 71 } },
    { type: "water_moat", position: { x: 54, y: 72 } },
    { type: "water_moat", position: { x: 54, y: 73 } },
    { type: "water_moat", position: { x: 54, y: 74 } },
    { type: "water_moat", position: { x: 54, y: 75 } },
    { type: "water_moat", position: { x: 54, y: 76 } },
    { type: "water_moat", position: { x: 54, y: 77 } },
    { type: "water_moat", position: { x: 54, y: 78 } },
    { type: "water_moat", position: { x: 54, y: 79 } },
    { type: "water_moat", position: { x: 54, y: 80 } },
    { type: "water_moat", position: { x: 54, y: 81 } },
    { type: "water_moat", position: { x: 54, y: 82 } },
    // 東堀
    { type: "water_moat", position: { x: 72, y: 65 } },
    { type: "water_moat", position: { x: 72, y: 66 } },
    { type: "water_moat", position: { x: 72, y: 67 } },
    { type: "water_moat", position: { x: 72, y: 68 } },
    { type: "water_moat", position: { x: 72, y: 69 } },
    { type: "water_moat", position: { x: 72, y: 70 } },
    { type: "water_moat", position: { x: 72, y: 71 } },
    { type: "water_moat", position: { x: 72, y: 72 } },
    { type: "water_moat", position: { x: 72, y: 73 } },
    { type: "water_moat", position: { x: 72, y: 74 } },
    { type: "water_moat", position: { x: 72, y: 75 } },
    { type: "water_moat", position: { x: 72, y: 76 } },
    { type: "water_moat", position: { x: 72, y: 77 } },
    { type: "water_moat", position: { x: 72, y: 78 } },
    { type: "water_moat", position: { x: 72, y: 79 } },
    { type: "water_moat", position: { x: 72, y: 80 } },
    { type: "water_moat", position: { x: 72, y: 81 } },
    { type: "water_moat", position: { x: 72, y: 82 } },
    // 南堀 — earth_bridge at x=63 (土橋は大手道と一直線)
    { type: "water_moat", position: { x: 54, y: 83 } },
    { type: "water_moat", position: { x: 55, y: 83 } },
    { type: "water_moat", position: { x: 56, y: 83 } },
    { type: "water_moat", position: { x: 57, y: 83 } },
    { type: "water_moat", position: { x: 58, y: 83 } },
    { type: "water_moat", position: { x: 59, y: 83 } },
    { type: "water_moat", position: { x: 60, y: 83 } },
    { type: "water_moat", position: { x: 61, y: 83 } },
    { type: "water_moat", position: { x: 62, y: 83 } },
    { type: "earth_bridge", position: { x: 63, y: 83 } },
    { type: "water_moat", position: { x: 64, y: 83 } },
    { type: "water_moat", position: { x: 65, y: 83 } },
    { type: "water_moat", position: { x: 66, y: 83 } },
    { type: "water_moat", position: { x: 67, y: 83 } },
    { type: "water_moat", position: { x: 68, y: 83 } },
    { type: "water_moat", position: { x: 69, y: 83 } },
    { type: "water_moat", position: { x: 70, y: 83 } },
    { type: "water_moat", position: { x: 71, y: 83 } },
    { type: "water_moat", position: { x: 72, y: 83 } },

    // === 二之丸(外郭) — 柵リング x=48-78, y=20-57 ===
    // 北柵
    { type: "fence", position: { x: 48, y: 58 } },
    { type: "fence", position: { x: 49, y: 58 } },
    { type: "fence", position: { x: 50, y: 58 } },
    { type: "fence", position: { x: 51, y: 58 } },
    { type: "fence", position: { x: 52, y: 58 } },
    { type: "fence", position: { x: 53, y: 58 } },
    { type: "fence", position: { x: 54, y: 58 } },
    { type: "fence", position: { x: 55, y: 58 } },
    { type: "fence", position: { x: 56, y: 58 } },
    { type: "fence", position: { x: 57, y: 58 } },
    { type: "fence", position: { x: 58, y: 58 } },
    { type: "fence", position: { x: 59, y: 58 } },
    { type: "fence", position: { x: 60, y: 58 } },
    { type: "fence", position: { x: 61, y: 58 } },
    { type: "fence", position: { x: 62, y: 58 } },
    { type: "fence", position: { x: 63, y: 58 } },
    { type: "fence", position: { x: 64, y: 58 } },
    { type: "fence", position: { x: 65, y: 58 } },
    { type: "fence", position: { x: 66, y: 58 } },
    { type: "fence", position: { x: 67, y: 58 } },
    { type: "fence", position: { x: 68, y: 58 } },
    { type: "fence", position: { x: 69, y: 58 } },
    { type: "fence", position: { x: 70, y: 58 } },
    { type: "fence", position: { x: 71, y: 58 } },
    { type: "fence", position: { x: 72, y: 58 } },
    { type: "fence", position: { x: 73, y: 58 } },
    { type: "fence", position: { x: 74, y: 58 } },
    { type: "fence", position: { x: 75, y: 58 } },
    { type: "fence", position: { x: 76, y: 58 } },
    { type: "fence", position: { x: 77, y: 58 } },
    { type: "fence", position: { x: 78, y: 58 } },
    // 西柵
    { type: "fence", position: { x: 48, y: 59 } },
    { type: "fence", position: { x: 48, y: 60 } },
    { type: "fence", position: { x: 48, y: 61 } },
    { type: "fence", position: { x: 48, y: 62 } },
    { type: "fence", position: { x: 48, y: 63 } },
    { type: "fence", position: { x: 48, y: 64 } },
    { type: "fence", position: { x: 48, y: 65 } },
    { type: "fence", position: { x: 48, y: 66 } },
    { type: "fence", position: { x: 48, y: 67 } },
    { type: "fence", position: { x: 48, y: 68 } },
    { type: "fence", position: { x: 48, y: 69 } },
    { type: "fence", position: { x: 48, y: 70 } },
    { type: "fence", position: { x: 48, y: 71 } },
    { type: "fence", position: { x: 48, y: 72 } },
    { type: "fence", position: { x: 48, y: 73 } },
    { type: "fence", position: { x: 48, y: 74 } },
    { type: "fence", position: { x: 48, y: 75 } },
    { type: "fence", position: { x: 48, y: 76 } },
    { type: "fence", position: { x: 48, y: 77 } },
    { type: "fence", position: { x: 48, y: 78 } },
    { type: "fence", position: { x: 48, y: 79 } },
    { type: "fence", position: { x: 48, y: 80 } },
    { type: "fence", position: { x: 48, y: 81 } },
    { type: "fence", position: { x: 48, y: 82 } },
    { type: "fence", position: { x: 48, y: 83 } },
    { type: "fence", position: { x: 48, y: 84 } },
    { type: "fence", position: { x: 48, y: 85 } },
    { type: "fence", position: { x: 48, y: 86 } },
    { type: "fence", position: { x: 48, y: 87 } },
    { type: "fence", position: { x: 48, y: 88 } },
    { type: "fence", position: { x: 48, y: 89 } },
    { type: "fence", position: { x: 48, y: 90 } },
    { type: "fence", position: { x: 48, y: 91 } },
    { type: "fence", position: { x: 48, y: 92 } },
    { type: "fence", position: { x: 48, y: 93 } },
    { type: "fence", position: { x: 48, y: 94 } },
    // 東柵
    { type: "fence", position: { x: 78, y: 59 } },
    { type: "fence", position: { x: 78, y: 60 } },
    { type: "fence", position: { x: 78, y: 61 } },
    { type: "fence", position: { x: 78, y: 62 } },
    { type: "fence", position: { x: 78, y: 63 } },
    { type: "fence", position: { x: 78, y: 64 } },
    { type: "fence", position: { x: 78, y: 65 } },
    { type: "fence", position: { x: 78, y: 66 } },
    { type: "fence", position: { x: 78, y: 67 } },
    { type: "fence", position: { x: 78, y: 68 } },
    { type: "fence", position: { x: 78, y: 69 } },
    { type: "fence", position: { x: 78, y: 70 } },
    { type: "fence", position: { x: 78, y: 71 } },
    { type: "fence", position: { x: 78, y: 72 } },
    { type: "fence", position: { x: 78, y: 73 } },
    { type: "fence", position: { x: 78, y: 74 } },
    { type: "fence", position: { x: 78, y: 75 } },
    { type: "fence", position: { x: 78, y: 76 } },
    { type: "fence", position: { x: 78, y: 77 } },
    { type: "fence", position: { x: 78, y: 78 } },
    { type: "fence", position: { x: 78, y: 79 } },
    { type: "fence", position: { x: 78, y: 80 } },
    { type: "fence", position: { x: 78, y: 81 } },
    { type: "fence", position: { x: 78, y: 82 } },
    { type: "fence", position: { x: 78, y: 83 } },
    { type: "fence", position: { x: 78, y: 84 } },
    { type: "fence", position: { x: 78, y: 85 } },
    { type: "fence", position: { x: 78, y: 86 } },
    { type: "fence", position: { x: 78, y: 87 } },
    { type: "fence", position: { x: 78, y: 88 } },
    { type: "fence", position: { x: 78, y: 89 } },
    { type: "fence", position: { x: 78, y: 90 } },
    { type: "fence", position: { x: 78, y: 91 } },
    { type: "fence", position: { x: 78, y: 92 } },
    { type: "fence", position: { x: 78, y: 93 } },
    { type: "fence", position: { x: 78, y: 94 } },
    // 南柵 — gate_wide_3 at x=62 (大手道南門)
    { type: "fence", position: { x: 48, y: 95 } },
    { type: "fence", position: { x: 49, y: 95 } },
    { type: "fence", position: { x: 50, y: 95 } },
    { type: "fence", position: { x: 51, y: 95 } },
    { type: "fence", position: { x: 52, y: 95 } },
    { type: "fence", position: { x: 53, y: 95 } },
    { type: "fence", position: { x: 54, y: 95 } },
    { type: "fence", position: { x: 55, y: 95 } },
    { type: "fence", position: { x: 56, y: 95 } },
    { type: "fence", position: { x: 57, y: 95 } },
    { type: "fence", position: { x: 58, y: 95 } },
    { type: "fence", position: { x: 59, y: 95 } },
    { type: "fence", position: { x: 60, y: 95 } },
    { type: "fence", position: { x: 61, y: 95 } },
    { type: "gate_wide_3", position: { x: 62, y: 95 } },
    { type: "fence", position: { x: 65, y: 95 } },
    { type: "fence", position: { x: 66, y: 95 } },
    { type: "fence", position: { x: 67, y: 95 } },
    { type: "fence", position: { x: 68, y: 95 } },
    { type: "fence", position: { x: 69, y: 95 } },
    { type: "fence", position: { x: 70, y: 95 } },
    { type: "fence", position: { x: 71, y: 95 } },
    { type: "fence", position: { x: 72, y: 95 } },
    { type: "fence", position: { x: 73, y: 95 } },
    { type: "fence", position: { x: 74, y: 95 } },
    { type: "fence", position: { x: 75, y: 95 } },
    { type: "fence", position: { x: 76, y: 95 } },
    { type: "fence", position: { x: 77, y: 95 } },
    { type: "fence", position: { x: 78, y: 95 } },

    // === 二之丸内部 — 隅櫓2基・蔵2棟・兵舎・市場・侍屋敷 ===
    // 隅櫓: 北西・北東
    { type: "yagura", position: { x: 49, y: 59 } },
    { type: "yagura", position: { x: 76, y: 59 } },
    // 蔵 2棟 (西寄り)
    { type: "storehouse", position: { x: 49, y: 68 } },
    { type: "storehouse", position: { x: 49, y: 73 } },
    // 兵舎 (東寄り)
    { type: "barracks", position: { x: 73, y: 68 } },
    // 市場 (南東区画)
    { type: "market", position: { x: 68, y: 88 } },
    // 侍屋敷 (南西区画)
    { type: "samurai_residence", position: { x: 49, y: 86 } },

    // === 城下町 — 南の大手道(x=63)沿い ===
    // 大手道
    { type: "road", position: { x: 63, y: 96 } },
    { type: "road", position: { x: 63, y: 97 } },
    { type: "road", position: { x: 63, y: 98 } },
    { type: "road", position: { x: 63, y: 99 } },
    { type: "road", position: { x: 63, y: 100 } },
    { type: "road", position: { x: 63, y: 101 } },
    { type: "road", position: { x: 63, y: 102 } },
    { type: "road", position: { x: 63, y: 103 } },
    { type: "road", position: { x: 63, y: 104 } },
    { type: "road", position: { x: 63, y: 105 } },
    { type: "road", position: { x: 63, y: 106 } },
    { type: "road", position: { x: 63, y: 107 } },
    { type: "road", position: { x: 63, y: 108 } },
    // 町区画 (道路の東西)
    { type: "town_block", position: { x: 54, y: 98 } },
    { type: "town_block", position: { x: 65, y: 98 } },
    // 農地
    { type: "farm", position: { x: 51, y: 108 } },
    { type: "farm", position: { x: 65, y: 108 } },
  ],
  initialUnits: [
    // 本丸ガリソン (天守東側の空間)
    { type: "spear_ashigaru", position: { x: 65, y: 78 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 66, y: 76 }, owner: "player" },
    { type: "archer", position: { x: 65, y: 75 }, owner: "player" },
    // 二之丸南門付近 (大手道守備)
    { type: "archer", position: { x: 63, y: 90 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 61, y: 90 }, owner: "player" },
  ],
  waves: [
    {
      // 第1波 (tick 3600 ≈ 3分): 槍のみ+荷車。荷車の存在を認識させる。
      tick: 3600,
      spawns: [
        { type: "spear_ashigaru", position: { x: 60, y: 118 } },
        { type: "spear_ashigaru", position: { x: 66, y: 118 } },
        { type: "supply_cart", position: { x: 63, y: 121 } },
      ],
    },
    {
      // 第2波 (tick 9000 ≈ 7.5分): 槍+弓で圧力増加。荷車はやや後衛。
      tick: 9000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 59, y: 118 } },
        { type: "spear_ashigaru", position: { x: 67, y: 118 } },
        { type: "archer", position: { x: 63, y: 120 } },
        { type: "supply_cart", position: { x: 63, y: 124 } },
      ],
    },
    {
      // 第3波 (tick 15000 ≈ 12.5分): 槍・剣・騎兵で総攻撃。荷車の護衛密度増加。
      tick: 15000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 57, y: 118 } },
        { type: "spear_ashigaru", position: { x: 63, y: 118 } },
        { type: "spear_ashigaru", position: { x: 69, y: 118 } },
        { type: "sword_ashigaru", position: { x: 60, y: 120 } },
        { type: "cavalry", position: { x: 67, y: 120 } },
        { type: "supply_cart", position: { x: 63, y: 123 } },
      ],
    },
  ],
  victory: {
    holdTicks: 21600,
  },
};

/**
 * Linear fortress scenario (docs/07_scenarios/linear-fortress.md).
 * B: 連郭式 — standard difficulty.
 * Two compounds (honmaru NW + ninomaru east) linked across a dry moat.
 * Multi-direction assault (east + south) and cavalry introduction.
 * AI profile: 混合型 (mixed — frontal east + cavalry flanking south).
 */
export const linearFortressScenario: ContentScenarioDefinition = {
  id: "linear-fortress",
  name: "連郭の城",
  description: "連郭式の二之丸を前線に東西二方向の敵と戦う標準難易度シナリオ。騎兵による南側奇襲に要注意。",
  initialBuildings: [
    // === Honmaru compound (NW) — wall ring x=15-29, y=14-29 ===
    { type: "tenshu", position: { x: 18, y: 57 } },
    { type: "honmaru", position: { x: 26, y: 66 } },

    // North wall
    { type: "wall", position: { x: 15, y: 54 } },
    { type: "wall", position: { x: 16, y: 54 } },
    { type: "wall", position: { x: 17, y: 54 } },
    { type: "wall", position: { x: 18, y: 54 } },
    { type: "wall", position: { x: 19, y: 54 } },
    { type: "wall", position: { x: 20, y: 54 } },
    { type: "wall", position: { x: 21, y: 54 } },
    { type: "wall", position: { x: 22, y: 54 } },
    { type: "wall", position: { x: 23, y: 54 } },
    { type: "wall", position: { x: 24, y: 54 } },
    { type: "wall", position: { x: 25, y: 54 } },
    { type: "wall", position: { x: 26, y: 54 } },
    { type: "wall", position: { x: 27, y: 54 } },
    { type: "wall", position: { x: 28, y: 54 } },
    { type: "wall", position: { x: 29, y: 54 } },
    // South wall
    { type: "wall", position: { x: 15, y: 69 } },
    { type: "wall", position: { x: 16, y: 69 } },
    { type: "wall", position: { x: 17, y: 69 } },
    { type: "wall", position: { x: 18, y: 69 } },
    { type: "wall", position: { x: 19, y: 69 } },
    { type: "wall", position: { x: 20, y: 69 } },
    { type: "wall", position: { x: 21, y: 69 } },
    { type: "wall", position: { x: 22, y: 69 } },
    { type: "wall", position: { x: 23, y: 69 } },
    { type: "wall", position: { x: 24, y: 69 } },
    { type: "wall", position: { x: 25, y: 69 } },
    { type: "wall", position: { x: 26, y: 69 } },
    { type: "wall", position: { x: 27, y: 69 } },
    { type: "wall", position: { x: 28, y: 69 } },
    { type: "wall", position: { x: 29, y: 69 } },
    // West wall
    { type: "wall", position: { x: 15, y: 55 } },
    { type: "wall", position: { x: 15, y: 56 } },
    { type: "wall", position: { x: 15, y: 57 } },
    { type: "wall", position: { x: 15, y: 58 } },
    { type: "wall", position: { x: 15, y: 59 } },
    { type: "wall", position: { x: 15, y: 60 } },
    { type: "wall", position: { x: 15, y: 61 } },
    { type: "wall", position: { x: 15, y: 62 } },
    { type: "wall", position: { x: 15, y: 63 } },
    { type: "wall", position: { x: 15, y: 64 } },
    { type: "wall", position: { x: 15, y: 65 } },
    { type: "wall", position: { x: 15, y: 66 } },
    { type: "wall", position: { x: 15, y: 67 } },
    { type: "wall", position: { x: 15, y: 68 } },
    // East wall — gate_wide_3_ne_sw at x=29, y=21 (spans y=21,22,23)
    { type: "wall", position: { x: 29, y: 55 } },
    { type: "wall", position: { x: 29, y: 56 } },
    { type: "wall", position: { x: 29, y: 57 } },
    { type: "wall", position: { x: 29, y: 58 } },
    { type: "wall", position: { x: 29, y: 59 } },
    { type: "wall", position: { x: 29, y: 60 } },
    { type: "gate_wide_3_ne_sw", position: { x: 29, y: 61 } },
    { type: "wall", position: { x: 29, y: 64 } },
    { type: "wall", position: { x: 29, y: 65 } },
    { type: "wall", position: { x: 29, y: 66 } },
    { type: "wall", position: { x: 29, y: 67 } },
    { type: "wall", position: { x: 29, y: 68 } },

    // === Dry moat between compounds x=31-32, y=12-30 (bridges at y=22) ===
    { type: "dry_moat", position: { x: 31, y: 52 } },
    { type: "dry_moat", position: { x: 31, y: 53 } },
    { type: "dry_moat", position: { x: 31, y: 54 } },
    { type: "dry_moat", position: { x: 31, y: 55 } },
    { type: "dry_moat", position: { x: 31, y: 56 } },
    { type: "dry_moat", position: { x: 31, y: 57 } },
    { type: "dry_moat", position: { x: 31, y: 58 } },
    { type: "dry_moat", position: { x: 31, y: 59 } },
    { type: "dry_moat", position: { x: 31, y: 60 } },
    { type: "dry_moat", position: { x: 31, y: 61 } },
    { type: "earth_bridge", position: { x: 31, y: 62 } },
    { type: "dry_moat", position: { x: 31, y: 63 } },
    { type: "dry_moat", position: { x: 31, y: 64 } },
    { type: "dry_moat", position: { x: 31, y: 65 } },
    { type: "dry_moat", position: { x: 31, y: 66 } },
    { type: "dry_moat", position: { x: 31, y: 67 } },
    { type: "dry_moat", position: { x: 31, y: 68 } },
    { type: "dry_moat", position: { x: 31, y: 69 } },
    { type: "dry_moat", position: { x: 31, y: 70 } },
    { type: "dry_moat", position: { x: 32, y: 52 } },
    { type: "dry_moat", position: { x: 32, y: 53 } },
    { type: "dry_moat", position: { x: 32, y: 54 } },
    { type: "dry_moat", position: { x: 32, y: 55 } },
    { type: "dry_moat", position: { x: 32, y: 56 } },
    { type: "dry_moat", position: { x: 32, y: 57 } },
    { type: "dry_moat", position: { x: 32, y: 58 } },
    { type: "dry_moat", position: { x: 32, y: 59 } },
    { type: "dry_moat", position: { x: 32, y: 60 } },
    { type: "dry_moat", position: { x: 32, y: 61 } },
    { type: "earth_bridge", position: { x: 32, y: 62 } },
    { type: "dry_moat", position: { x: 32, y: 63 } },
    { type: "dry_moat", position: { x: 32, y: 64 } },
    { type: "dry_moat", position: { x: 32, y: 65 } },
    { type: "dry_moat", position: { x: 32, y: 66 } },
    { type: "dry_moat", position: { x: 32, y: 67 } },
    { type: "dry_moat", position: { x: 32, y: 68 } },
    { type: "dry_moat", position: { x: 32, y: 69 } },
    { type: "dry_moat", position: { x: 32, y: 70 } },

    // === Ninomaru fence ring x=34-54, y=12-30 ===
    // North fence
    { type: "fence", position: { x: 34, y: 52 } },
    { type: "fence", position: { x: 35, y: 52 } },
    { type: "fence", position: { x: 36, y: 52 } },
    { type: "fence", position: { x: 37, y: 52 } },
    { type: "fence", position: { x: 38, y: 52 } },
    { type: "fence", position: { x: 39, y: 52 } },
    { type: "fence", position: { x: 40, y: 52 } },
    { type: "fence", position: { x: 41, y: 52 } },
    { type: "fence", position: { x: 42, y: 52 } },
    { type: "fence", position: { x: 43, y: 52 } },
    { type: "fence", position: { x: 44, y: 52 } },
    { type: "fence", position: { x: 45, y: 52 } },
    { type: "fence", position: { x: 46, y: 52 } },
    { type: "fence", position: { x: 47, y: 52 } },
    { type: "fence", position: { x: 48, y: 52 } },
    { type: "fence", position: { x: 49, y: 52 } },
    { type: "fence", position: { x: 50, y: 52 } },
    { type: "fence", position: { x: 51, y: 52 } },
    { type: "fence", position: { x: 52, y: 52 } },
    { type: "fence", position: { x: 53, y: 52 } },
    { type: "fence", position: { x: 54, y: 52 } },
    // South fence
    { type: "fence", position: { x: 34, y: 70 } },
    { type: "fence", position: { x: 35, y: 70 } },
    { type: "fence", position: { x: 36, y: 70 } },
    { type: "fence", position: { x: 37, y: 70 } },
    { type: "fence", position: { x: 38, y: 70 } },
    { type: "fence", position: { x: 39, y: 70 } },
    { type: "fence", position: { x: 40, y: 70 } },
    { type: "fence", position: { x: 41, y: 70 } },
    { type: "fence", position: { x: 42, y: 70 } },
    { type: "fence", position: { x: 43, y: 70 } },
    { type: "fence", position: { x: 44, y: 70 } },
    { type: "fence", position: { x: 45, y: 70 } },
    { type: "fence", position: { x: 46, y: 70 } },
    { type: "fence", position: { x: 47, y: 70 } },
    { type: "fence", position: { x: 48, y: 70 } },
    { type: "fence", position: { x: 49, y: 70 } },
    { type: "fence", position: { x: 50, y: 70 } },
    { type: "fence", position: { x: 51, y: 70 } },
    { type: "fence", position: { x: 52, y: 70 } },
    { type: "fence", position: { x: 53, y: 70 } },
    { type: "fence", position: { x: 54, y: 70 } },
    // West fence
    { type: "fence", position: { x: 34, y: 53 } },
    { type: "fence", position: { x: 34, y: 54 } },
    { type: "fence", position: { x: 34, y: 55 } },
    { type: "fence", position: { x: 34, y: 56 } },
    { type: "fence", position: { x: 34, y: 57 } },
    { type: "fence", position: { x: 34, y: 58 } },
    { type: "fence", position: { x: 34, y: 59 } },
    { type: "fence", position: { x: 34, y: 60 } },
    { type: "fence", position: { x: 34, y: 61 } },
    { type: "fence", position: { x: 34, y: 62 } },
    { type: "fence", position: { x: 34, y: 63 } },
    { type: "fence", position: { x: 34, y: 64 } },
    { type: "fence", position: { x: 34, y: 65 } },
    { type: "fence", position: { x: 34, y: 66 } },
    { type: "fence", position: { x: 34, y: 67 } },
    { type: "fence", position: { x: 34, y: 68 } },
    { type: "fence", position: { x: 34, y: 69 } },
    // East fence — gate_wide_3_ne_sw at x=54, y=21 (spans y=21,22,23)
    { type: "fence", position: { x: 54, y: 53 } },
    { type: "fence", position: { x: 54, y: 54 } },
    { type: "fence", position: { x: 54, y: 55 } },
    { type: "fence", position: { x: 54, y: 56 } },
    { type: "fence", position: { x: 54, y: 57 } },
    { type: "fence", position: { x: 54, y: 58 } },
    { type: "fence", position: { x: 54, y: 59 } },
    { type: "fence", position: { x: 54, y: 60 } },
    { type: "gate_wide_3_ne_sw", position: { x: 54, y: 61 } },
    { type: "fence", position: { x: 54, y: 64 } },
    { type: "fence", position: { x: 54, y: 65 } },
    { type: "fence", position: { x: 54, y: 66 } },
    { type: "fence", position: { x: 54, y: 67 } },
    { type: "fence", position: { x: 54, y: 68 } },
    { type: "fence", position: { x: 54, y: 69 } },

    // === Ninomaru buildings ===
    { type: "yagura", position: { x: 35, y: 53 } },
    { type: "yagura", position: { x: 51, y: 67 } },
    { type: "barracks", position: { x: 36, y: 59 } },
    { type: "storehouse", position: { x: 46, y: 53 } },
    { type: "storehouse", position: { x: 36, y: 64 } },

    // === Road system (east exit road + south turn) ===
    { type: "road", position: { x: 55, y: 62 } },
    { type: "road", position: { x: 57, y: 62 } },
    { type: "road", position: { x: 59, y: 62 } },
    { type: "road", position: { x: 61, y: 62 } },
    { type: "road", position: { x: 63, y: 62 } },
    { type: "road", position: { x: 63, y: 65 } },
    { type: "road", position: { x: 63, y: 70 } },
    { type: "road", position: { x: 63, y: 78 } },
    { type: "road", position: { x: 63, y: 86 } },

    // === Town (SE of castle) ===
    { type: "town_block", position: { x: 56, y: 74 } },
    { type: "town_block", position: { x: 56, y: 82 } },
    { type: "town_block", position: { x: 64, y: 74 } },
    { type: "market", position: { x: 47, y: 74 } },
    { type: "samurai_residence", position: { x: 47, y: 80 } },
    { type: "samurai_residence", position: { x: 41, y: 72 } },
    { type: "farm", position: { x: 42, y: 87 } },
    { type: "farm", position: { x: 48, y: 89 } },

    // Enemy staging areas (east and south)
    { type: "gate", position: { x: 100, y: 62 }, owner: "enemy" },
    { type: "gate", position: { x: 63, y: 100 }, owner: "enemy" },
  ],
  initialUnits: [
    // Player garrison in honmaru
    { type: "spear_ashigaru", position: { x: 26, y: 66 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 27, y: 67 }, owner: "player" },
    // Archer guarding ninomaru east gate
    { type: "archer", position: { x: 53, y: 62 }, owner: "player" },
    // Spear at ninomaru east gate
    { type: "spear_ashigaru", position: { x: 51, y: 62 }, owner: "player" },
    // Archer covering southern road
    { type: "archer", position: { x: 62, y: 88 }, owner: "player" },

    // Enemy advance scouts (east bank)
    { type: "spear_ashigaru", position: { x: 85, y: 61 }, owner: "enemy" },
    { type: "archer", position: { x: 86, y: 65 }, owner: "enemy" },
  ],
  waves: [
    {
      // Wave 1 (tick 2400): Light east probe with supply cart.
      tick: 2400,
      spawns: [
        { type: "spear_ashigaru", position: { x: 100, y: 59 } },
        { type: "spear_ashigaru", position: { x: 100, y: 64 } },
        { type: "supply_cart", position: { x: 103, y: 61 } },
      ],
    },
    {
      // Wave 2 (tick 6000): East main assault + south probe. Two-front pressure begins.
      tick: 6000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 100, y: 58 } },
        { type: "spear_ashigaru", position: { x: 100, y: 62 } },
        { type: "archer", position: { x: 100, y: 66 } },
        { type: "supply_cart", position: { x: 103, y: 61 } },
        // South probe — tests the undefended flank
        { type: "spear_ashigaru", position: { x: 61, y: 100 } },
        { type: "archer", position: { x: 64, y: 102 } },
      ],
    },
    {
      // Wave 3 (tick 10000): Cavalry flanks south; engineer begins moat-fill from east.
      tick: 10000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 100, y: 58 } },
        { type: "sword_ashigaru", position: { x: 100, y: 62 } },
        { type: "engineer", position: { x: 102, y: 60 } },
        { type: "cavalry", position: { x: 100, y: 67 } },
        { type: "supply_cart", position: { x: 104, y: 61 } },
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
        { type: "spear_ashigaru", position: { x: 100, y: 57 } },
        { type: "sword_ashigaru", position: { x: 100, y: 61 } },
        { type: "sword_ashigaru", position: { x: 100, y: 65 } },
        { type: "archer", position: { x: 100, y: 69 } },
        { type: "engineer", position: { x: 102, y: 61 } },
        { type: "cavalry", position: { x: 100, y: 72 } },
        { type: "musketeer", position: { x: 102, y: 65 } },
        { type: "supply_cart", position: { x: 104, y: 61 } },
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
export const riversideDefenseScenario: ContentScenarioDefinition = {
  id: "riverside-defense",
  name: "川沿いの城",
  description: "川を天然の水堀として活用する上級シナリオ。二本の橋を押さえる橋頭堡防衛と工兵による橋破壊が鍵。",
  initialBuildings: [
    // === Castle core (west bank) ===
    { type: "tenshu", position: { x: 31, y: 47 } },
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

/** Scenario roster in ascending difficulty order.
 *  A: 環郭式平城(入門) / B: 連郭式(標準) / C: 川城+門前町(上級) /
 *  D: 山城(2.0ショーケース・高低差) / 追加5種 (浮城/五段積/切通し/城下/段郭) /
 *  Free: 自由演習(サンドボックス) */
export const scenarios: readonly ScenarioDefinition[] = [
  concentricCastleScenario,
  linearFortressScenario,
  riversideDefenseScenario,
  mountainCastleScenario,
  waterCastleScenario,
  castleTownGateScenario,
  cutPassFortScenario,
  steppedFortressScenario,
  fiveTierKeepScenario,
  freePlayScenario,
];

/** デフォルトシナリオ (初回プレイ = 環郭の城・入門)。 */
export const DEFAULT_SCENARIO = concentricCastleScenario;

export * from "./scripts";
export { mountainCastleScenario } from "./mountain-castle";
export { freePlayScenario } from "./free-play";
export { waterCastleScenario } from "./water-castle";
export { fiveTierKeepScenario } from "./five-tier-keep";
export { cutPassFortScenario } from "./cut-pass-fort";
export { castleTownGateScenario } from "./castle-town-gate";
export { steppedFortressScenario } from "./stepped-fortress";
