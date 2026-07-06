import type {
  BuildingType,
  CellCoord,
  GameOutcomeReason,
  MarketTrade,
  OwnerId,
  UnitType,
} from "@asama/shared";

// ---- Selector types --------------------------------------------------------

/** Declarative unit selector — resolved to concrete unitIds against a WorldSnapshot at runtime. */
export type UnitSelector =
  | { readonly kind: "all"; readonly owner?: OwnerId }
  | { readonly kind: "byType"; readonly unitType: UnitType; readonly owner?: OwnerId }
  | { readonly kind: "nearPosition"; readonly position: CellCoord; readonly radius: number; readonly owner?: OwnerId };

/** Declarative entity selector — resolved to a single entityId for attack-target commands. */
export type EntitySelector =
  | { readonly kind: "nearPosition"; readonly position: CellCoord; readonly radius: number; readonly owner?: OwnerId }
  | { readonly kind: "byUnitType"; readonly unitType: UnitType; readonly owner?: OwnerId };

// ---- Action types ----------------------------------------------------------

/**
 * Declarative action data — maps 1:1 to PlayerCommand variants but carries
 * selectors rather than runtime IDs/tick stamps. The E2E runner resolves these
 * against the current WorldSnapshot before emitting actual PlayerCommands.
 */
export type ScriptAction =
  | { readonly type: "placeBuilding"; readonly buildingType: BuildingType; readonly position: CellCoord }
  | { readonly type: "recruitUnit"; readonly unitType: UnitType }
  | { readonly type: "moveUnits"; readonly selector: UnitSelector; readonly destination: CellCoord }
  | { readonly type: "attackMoveUnits"; readonly selector: UnitSelector; readonly destination: CellCoord }
  | { readonly type: "attackTarget"; readonly selector: UnitSelector; readonly targetSelector: EntitySelector }
  | { readonly type: "marketTrade"; readonly trade: MarketTrade }
  | { readonly type: "toggleGate"; readonly position: CellCoord }
  | { readonly type: "stopUnits"; readonly selector: UnitSelector }
  | { readonly type: "demolishBuilding"; readonly position: CellCoord };

// ---- Script types ----------------------------------------------------------

export interface ScriptStep {
  readonly atTick: number;
  readonly action: ScriptAction;
}

export interface PlaythroughExpectedOutcome {
  readonly outcome: GameOutcomeReason;
  readonly winner: OwnerId;
  readonly maxTick: number;
  /** Expected friendly casualty count range [min, max]. */
  readonly casualtyBand?: { readonly min: number; readonly max: number };
}

/** A complete, ordered sequence of declarative steps that drives an autoplay
 *  E2E run through a scenario from start to victory. */
export interface PlaythroughScript {
  readonly scenarioId: string;
  readonly steps: readonly ScriptStep[];
  readonly expectedOutcome?: PlaythroughExpectedOutcome;
}

// ---- Selector helpers (exported for E2E runner reuse) ----------------------

export const allPlayer: UnitSelector = { kind: "all", owner: "player" };

export function byTypePlayer(unitType: UnitType): UnitSelector {
  return { kind: "byType", unitType, owner: "player" };
}

export function playerNear(position: CellCoord, radius: number): UnitSelector {
  return { kind: "nearPosition", position, radius, owner: "player" };
}

export function enemyOfType(unitType: UnitType): EntitySelector {
  return { kind: "byUnitType", unitType, owner: "enemy" };
}

export function enemyNear(position: CellCoord, radius: number): EntitySelector {
  return { kind: "nearPosition", position, radius, owner: "enemy" };
}

// Internal step builder (keeps script literals concise)
function s(atTick: number, action: ScriptAction): ScriptStep {
  return { atTick, action };
}

// ---- Scenario A: concentricCastleScript ------------------------------------

/**
 * concentric-castle (環郭式・入門) の完走台本。
 *
 * 想定プレイ:
 *   序盤補強(増壁+徴兵)→第1波を防衛(荷車撃破で撤退タイマー発動)
 *   →兵糧補充→第2波荷車撃破→第3波荷車撃破→supply_cut 勝利
 *
 * 座標参照 (concentric-castle シナリオ定義より):
 *   - 南外郭門(柵)  gate_wide_3 @ (62, 57)
 *   - 南内郭門(壁)  gate_wide_3 @ (62, 43)
 *   - 土橋          earth_bridge @ (63, 45)
 *   - 本丸          honmaru @ (67, 40)
 *   - 各波荷車      wave1: (63,121)  wave2: (63,124)  wave3: (63,123)
 */
export const concentricCastleScript: PlaythroughScript = {
  scenarioId: "concentric-castle",
  steps: [
    // ── Phase 1: Setup (tick 0–3600) ─────────────────────────────────────────
    // 南大手道への敵進路を絞り込む増壁 (外郭南門の東西)
    s(200,  { type: "placeBuilding", buildingType: "wall", position: { x: 61, y: 58 } }),
    s(350,  { type: "placeBuilding", buildingType: "wall", position: { x: 65, y: 58 } }),
    // 新兵徴兵 (二之丸 barracks x=73,y=30)
    s(500,  { type: "recruitUnit", unitType: "spear_ashigaru" }),
    s(700,  { type: "recruitUnit", unitType: "archer" }),
    // 兵糧先買い (市場 x=68,y=50)
    s(1000, { type: "marketTrade", trade: "buyFood" }),
    // 全軍を南守備ライン (y=52) に集結
    s(1600, { type: "moveUnits", selector: allPlayer, destination: { x: 63, y: 52 } }),

    // ── Phase 2: Wave 1 defense (tick ~3600) ─────────────────────────────────
    // 第1波: 槍×2 + 荷車(63,121)。荷車を優先撃破して撤退タイマーを発動。
    s(3650, { type: "attackMoveUnits", selector: allPlayer, destination: { x: 63, y: 90 } }),
    s(4300, { type: "attackTarget",    selector: allPlayer, targetSelector: enemyOfType("supply_cart") }),
    s(5000, { type: "stopUnits",       selector: allPlayer }),
    s(5500, { type: "moveUnits",       selector: allPlayer, destination: { x: 63, y: 52 } }),

    // ── Phase 3: 兵糧管理 (tick 5500–8500) ───────────────────────────────────
    s(6000, { type: "marketTrade", trade: "buyFood" }),
    // 本丸ガリソンを天守東側 (67, 40) へ引き戻す
    s(7500, { type: "moveUnits", selector: playerNear({ x: 65, y: 40 }, 15), destination: { x: 67, y: 40 } }),

    // ── Phase 4: Wave 2 (tick ~9000) ─────────────────────────────────────────
    // 第2波: 槍×2 + 弓 + 荷車(63,124)
    s(9050,  { type: "attackMoveUnits", selector: allPlayer, destination: { x: 63, y: 85 } }),
    s(9800,  { type: "attackTarget",    selector: allPlayer, targetSelector: enemyOfType("supply_cart") }),
    s(11000, { type: "stopUnits",       selector: allPlayer }),
    s(11500, { type: "moveUnits",       selector: allPlayer, destination: { x: 63, y: 52 } }),

    // ── Phase 5: Wave 3 + 最終出撃 (tick ~15000) ─────────────────────────────
    // 第3波: 槍×3 + 剣 + 騎兵 + 荷車(63,123)。全荷車撃破で supply_cut 勝利。
    s(15050, { type: "attackMoveUnits", selector: allPlayer, destination: { x: 63, y: 80 } }),
    s(16000, { type: "attackTarget",    selector: allPlayer, targetSelector: enemyOfType("supply_cart") }),
    s(17500, { type: "stopUnits",       selector: allPlayer }),
    s(18000, { type: "moveUnits",       selector: allPlayer, destination: { x: 67, y: 40 } }),
  ],
  expectedOutcome: {
    outcome: "supply_cut",
    winner: "player",
    maxTick: 21600,
    casualtyBand: { min: 0, max: 3 },
  },
};

// ---- Scenario B: linearFortressScript (rough) ------------------------------

/**
 * linear-fortress (連郭式・標準) の粗い完走台本。
 *
 * 東(x≈100,y=22)と南(x=63,y≈100)の二方向を交互に押さえながら
 * 荷車を撃破し、holdTicks(tick 24000)まで保持して time_held 勝利。
 *
 * 座標参照:
 *   - 二之丸東門  gate_wide_3_ne_sw @ (54, 21)
 *   - 本丸        honmaru @ (26, 26)
 *   - 東・荷車    wave1–4: x≈103-104, y=21
 *   - 南・荷車    wave4: (62, 104)
 */
export const linearFortressScript: PlaythroughScript = {
  scenarioId: "linear-fortress",
  steps: [
    // Setup: 徴兵 + 東門守備固め
    s(300,  { type: "recruitUnit", unitType: "spear_ashigaru" }),
    s(500,  { type: "recruitUnit", unitType: "archer" }),
    s(800,  { type: "marketTrade", trade: "buyFood" }),
    s(1200, { type: "moveUnits", selector: byTypePlayer("archer"), destination: { x: 53, y: 22 } }),

    // Wave 1 (tick 2400): 東の小探索部隊 + 荷車(103,21)
    s(2500, { type: "attackMoveUnits", selector: playerNear({ x: 53, y: 22 }, 15), destination: { x: 75, y: 22 } }),
    s(3200, { type: "attackTarget",    selector: allPlayer, targetSelector: enemyOfType("supply_cart") }),
    s(4000, { type: "stopUnits",       selector: allPlayer }),
    s(4500, { type: "moveUnits",       selector: allPlayer, destination: { x: 53, y: 22 } }),

    // Wave 2 (tick 6000): 東主力 + 南探索 (二正面圧力)
    s(6100, { type: "moveUnits",       selector: byTypePlayer("spear_ashigaru"), destination: { x: 62, y: 50 } }),
    s(6200, { type: "attackMoveUnits", selector: playerNear({ x: 53, y: 22 }, 10), destination: { x: 75, y: 22 } }),
    s(7000, { type: "attackTarget",    selector: allPlayer, targetSelector: enemyOfType("supply_cart") }),
    s(8000, { type: "stopUnits",       selector: allPlayer }),
    s(8500, { type: "moveUnits",       selector: allPlayer, destination: { x: 26, y: 26 } }),

    // Wave 3 (tick 10000): 騎兵が南側を回り込む
    s(10100, { type: "recruitUnit",    unitType: "spear_ashigaru" }),   // 対騎兵の槍を補充
    s(10300, { type: "moveUnits",      selector: byTypePlayer("spear_ashigaru"), destination: { x: 62, y: 50 } }),
    s(10500, { type: "attackTarget",   selector: allPlayer, targetSelector: enemyOfType("supply_cart") }),
    s(12000, { type: "moveUnits",      selector: allPlayer, destination: { x: 26, y: 26 } }),

    // Wave 4 (tick 15000): 東×南 同時総攻撃
    s(15100, { type: "attackMoveUnits", selector: playerNear({ x: 53, y: 22 }, 15), destination: { x: 75, y: 22 } }),
    s(15200, { type: "attackMoveUnits", selector: playerNear({ x: 62, y: 50 }, 15), destination: { x: 62, y: 75 } }),
    s(16500, { type: "attackTarget",    selector: allPlayer, targetSelector: enemyOfType("supply_cart") }),
    s(18000, { type: "stopUnits",       selector: allPlayer }),
    s(18500, { type: "moveUnits",       selector: allPlayer, destination: { x: 26, y: 26 } }),
  ],
  expectedOutcome: {
    outcome: "time_held",
    winner: "player",
    maxTick: 24000,
    casualtyBand: { min: 0, max: 4 },
  },
};

// ---- Scenario C: riversideDefenseScript (rough) ----------------------------

/**
 * riverside-defense (川城・上級) の粗い完走台本。
 *
 * 川(x=58)を挟んで南北二橋(北:木橋y=50/南:土橋y=66)を守りながら
 * 5波を凌ぎ、holdTicks(tick 30000)まで保持して time_held 勝利。
 *
 * 座標参照:
 *   - 北橋アプローチ門  gate @ (56, 50)
 *   - 南橋アプローチ門  gate @ (56, 66)
 *   - 本丸              honmaru @ (42, 57)
 *   - 敵荷車            wave2: (94,50)  wave3: (94,58)  wave4: (95,50)  wave5: (95,48),(95,66)
 */
export const riversideDefenseScript: PlaythroughScript = {
  scenarioId: "riverside-defense",
  steps: [
    // Setup: 工兵徴兵 + 弓を南北橋頭に配置
    s(300,  { type: "recruitUnit", unitType: "engineer" }),
    s(500,  { type: "recruitUnit", unitType: "archer" }),
    s(800,  { type: "marketTrade", trade: "buyFood" }),
    s(1000, { type: "moveUnits", selector: byTypePlayer("archer"), destination: { x: 55, y: 50 } }),

    // Wave 1 (tick 1800): 北橋への軽探索
    s(1900, { type: "attackMoveUnits", selector: playerNear({ x: 55, y: 50 }, 8), destination: { x: 60, y: 50 } }),
    s(2600, { type: "stopUnits",       selector: allPlayer }),
    s(3000, { type: "moveUnits",       selector: allPlayer, destination: { x: 55, y: 50 } }),

    // Wave 2 (tick 5400): 荷車(94,50) 初登場、弓で先制撃破
    s(5500, { type: "attackTarget",   selector: playerNear({ x: 55, y: 50 }, 15), targetSelector: enemyOfType("supply_cart") }),
    s(6500, { type: "stopUnits",      selector: allPlayer }),
    s(7000, { type: "moveUnits",      selector: allPlayer, destination: { x: 55, y: 50 } }),

    // Wave 3 (tick 9000): 工兵が橋を攻撃/南北二橋への同時圧力
    s(9100, { type: "recruitUnit",    unitType: "engineer" }),
    s(9400, { type: "moveUnits",      selector: byTypePlayer("archer"), destination: { x: 55, y: 66 } }),
    s(10000, { type: "attackTarget",  selector: allPlayer, targetSelector: enemyOfType("supply_cart") }),
    s(11000, { type: "stopUnits",     selector: allPlayer }),
    s(11500, { type: "moveUnits",     selector: allPlayer, destination: { x: 42, y: 57 } }),

    // Wave 4 (tick 13200): 二橋同時攻撃
    s(13300, { type: "attackMoveUnits", selector: playerNear({ x: 55, y: 50 }, 10), destination: { x: 60, y: 50 } }),
    s(13400, { type: "attackMoveUnits", selector: playerNear({ x: 55, y: 66 }, 10), destination: { x: 60, y: 66 } }),
    s(14500, { type: "attackTarget",    selector: allPlayer, targetSelector: enemyOfType("supply_cart") }),
    s(15500, { type: "stopUnits",       selector: allPlayer }),
    s(16000, { type: "moveUnits",       selector: allPlayer, destination: { x: 42, y: 57 } }),

    // Wave 5 (tick 18000): 精鋭部隊 + 騎兵 + 南北二荷車
    s(18100, { type: "recruitUnit",     unitType: "spear_ashigaru" }),  // 対騎兵補充
    s(18500, { type: "attackMoveUnits", selector: allPlayer, destination: { x: 60, y: 58 } }),
    s(19500, { type: "attackTarget",    selector: allPlayer, targetSelector: enemyOfType("supply_cart") }),
    s(21000, { type: "stopUnits",       selector: allPlayer }),
    s(21500, { type: "moveUnits",       selector: allPlayer, destination: { x: 42, y: 57 } }),
  ],
  expectedOutcome: {
    outcome: "time_held",
    winner: "player",
    maxTick: 30000,
    casualtyBand: { min: 0, max: 5 },
  },
};

// ---- Script registry -------------------------------------------------------

/** All playthrough scripts in scenario order (A / B / C difficulty). */
export const playthroughScripts: readonly PlaythroughScript[] = [
  concentricCastleScript,
  linearFortressScript,
  riversideDefenseScript,
];
