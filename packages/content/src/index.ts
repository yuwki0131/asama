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
  }
};


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

export const scenarios: readonly ScenarioDefinition[] = [mvpDefenseScenario];
