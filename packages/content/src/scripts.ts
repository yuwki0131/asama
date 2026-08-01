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
 *   序盤補強(増壁+徴兵)→内郭南門を閉鎖(最終防衛線)→出撃部隊(南門守備隊+新兵)を
 *   外郭南門チョーク (63,96) に常駐→各波を大手道上(y≈106)で迎撃し荷車を優先撃破
 *   (撤退タイマー発動)→第3波荷車撃破→supply_cut 勝利。
 *
 * 戦術上の不変条件 (requests/content/fix-concentric-castle-script.md の再発防止):
 *   - 門はシミュレーション仕様で「常時開で開始」(buildings.ts createBuildingState)。
 *     toggleGate はトグルなので、開けたい門には触らないこと。
 *     過去不具合: 外郭南門を「開放するつもりで」toggle し逆に閉鎖 → 出撃部隊が
 *     場内に閉じ込められ、開いたままの内郭門から第2波が本丸へ直行し honmaru_fallen。
 *   - 内郭南門 (62,81) は序盤に toggleGate で閉鎖する (本丸の最終防衛線)。
 *     兵糧接続は supply パースペクティブで門を常時通行扱いするため閉鎖しても安全。
 *   - 外郭南門 (62,95) は開けたままにする (出撃・帰還経路)。すり抜け対策として
 *     帰還は attackMoveUnits で行い、駐屯位置は増壁チョーク (63,96) に置く。
 *   - 本丸ガリソン6名は常駐 — allPlayer を移動系コマンドに使わない
 *     (全軍出撃で本丸が空になり honmaru_fallen した過去不具合)。
 *     出撃系セレクタは playerNear で本丸 (65,76) から半径外に収める。
 *   - 第3波荷車は tick 16800 までに撃破 (撤退タイマー4800 + 発火が holdTicks=21600
 *     の time_held より先である必要があるため)。
 *
 * 座標参照 (concentric-castle シナリオ定義より):
 *   - 南外郭門(柵)  gate_wide_3 @ (62, 95) — 開のまま (出撃経路)
 *   - 南内郭門(壁)  gate_wide_3 @ (62, 81) — tick 1500 に閉鎖 (本丸の最終防衛線)
 *   - 土橋          earth_bridge @ (63, 83)
 *   - 本丸ガリソン  (64-66, 75-78) 6名 / 南門守備隊 (61-63, 90) 3名
 *   - 兵舎          barracks @ (73, 68) — 新兵はここに出現
 *   - 各波荷車      wave1: (63,121)  wave2: (63,124)  wave3: (63,123)
 */
export const concentricCastleScript: PlaythroughScript = {
  scenarioId: "concentric-castle",
  steps: [
    // ── Phase 1: Setup (tick 0–3600) ─────────────────────────────────────────
    // 南大手道への敵進路を絞り込む増壁 (外郭南門のすぐ外・東西)
    s(200,  { type: "placeBuilding", buildingType: "wall", position: { x: 61, y: 96 } }),
    s(350,  { type: "placeBuilding", buildingType: "wall", position: { x: 65, y: 96 } }),
    // 新兵徴兵 (二之丸 barracks x=73,y=68)
    s(500,  { type: "recruitUnit", unitType: "spear_ashigaru" }),
    s(700,  { type: "recruitUnit", unitType: "archer" }),
    s(900,  { type: "recruitUnit", unitType: "spear_ashigaru" }),
    // 兵糧先買い (市場 x=68,y=88)
    s(1000, { type: "marketTrade", trade: "buyFood" }),
    s(1100, { type: "recruitUnit", unitType: "archer" }),
    // 内郭南門を閉鎖 (門は開で開始する仕様 — toggle で閉じる)。外郭南門は開のまま。
    s(1500, { type: "toggleGate", position: { x: 62, y: 81 } }),
    // 南門守備隊をチョーク (63,92→96) 側で待機させる
    s(1600, { type: "moveUnits", selector: playerNear({ x: 63, y: 90 }, 10), destination: { x: 63, y: 92 } }),
    // 兵舎の新兵を出撃部隊に合流させる
    s(2600, { type: "moveUnits", selector: playerNear({ x: 73, y: 68 }, 8), destination: { x: 63, y: 91 } }),

    // ── Phase 2: Wave 1 defense (tick 3600) ──────────────────────────────────
    // 第1波: 槍×4 + 荷車(63,121)。大手道上 y≈106 で迎撃し荷車を優先撃破。
    s(3650, { type: "attackMoveUnits", selector: playerNear({ x: 63, y: 92 }, 12), destination: { x: 63, y: 106 } }),
    s(4400, { type: "attackTarget",    selector: playerNear({ x: 63, y: 106 }, 20), targetSelector: enemyOfType("supply_cart") }),
    s(5300, { type: "stopUnits",       selector: playerNear({ x: 63, y: 114 }, 25) }),
    // 帰還は attackMove — 取り残した敵を掃討しつつチョーク (63,96) に駐屯
    s(5500, { type: "attackMoveUnits", selector: playerNear({ x: 63, y: 110 }, 25), destination: { x: 63, y: 96 } }),

    // ── Phase 3: 兵糧管理+補充徴兵 (tick 5500–8500) ──────────────────────────
    s(6000, { type: "marketTrade", trade: "buyFood" }),
    s(6300, { type: "recruitUnit", unitType: "spear_ashigaru" }),
    s(6600, { type: "recruitUnit", unitType: "archer" }),
    s(7800, { type: "moveUnits", selector: playerNear({ x: 73, y: 68 }, 8), destination: { x: 63, y: 93 } }),

    // ── Phase 4: Wave 2 (tick 9000) ──────────────────────────────────────────
    // 第2波: 槍×4 + 弓×2 + 荷車(63,124)
    s(9050,  { type: "attackMoveUnits", selector: playerNear({ x: 63, y: 94 }, 12), destination: { x: 63, y: 106 } }),
    // 荷車撃破は早めに (野戦は tick 9500 までに決着する)。撃破 tick + 4800 の撤退タイマーが
    // 第3波スポーン (15000) より確実に先に発火するようマージンを確保する。
    s(9600,  { type: "attackTarget",    selector: playerNear({ x: 63, y: 108 }, 22), targetSelector: enemyOfType("supply_cart") }),
    s(11000, { type: "stopUnits",       selector: playerNear({ x: 63, y: 115 }, 25) }),
    s(11400, { type: "attackMoveUnits", selector: playerNear({ x: 63, y: 110 }, 25), destination: { x: 63, y: 96 } }),

    // ── Phase 4.5: 補充徴兵 (tick 12000–13500) ───────────────────────────────
    // 注: marketTrade は内郭門閉鎖中は「market not connected」で失敗するため置かない。
    // 通常は第2波荷車撃破→撤退タイマー発火 (≈tick 14800) で第3波前に勝利するので
    // 以降のフェーズは保険 (バランス変更で第3波が湧いた場合のみ実行される)。
    s(12300, { type: "recruitUnit", unitType: "spear_ashigaru" }),
    s(13500, { type: "moveUnits", selector: playerNear({ x: 73, y: 68 }, 8), destination: { x: 63, y: 93 } }),

    // ── Phase 5: Wave 3 (tick 15000) — 荷車を tick 16800 までに撃破 ──────────
    // 第3波: 槍×5 + 剣×2 + 弓 + 騎兵 + 荷車(63,123)
    s(15050, { type: "attackMoveUnits", selector: playerNear({ x: 63, y: 94 }, 12), destination: { x: 63, y: 110 } }),
    s(15400, { type: "attackTarget",    selector: playerNear({ x: 63, y: 106 }, 25), targetSelector: enemyOfType("supply_cart") }),
    s(17600, { type: "stopUnits",       selector: playerNear({ x: 63, y: 118 }, 30) }),
    s(18000, { type: "attackMoveUnits", selector: playerNear({ x: 63, y: 112 }, 30), destination: { x: 63, y: 96 } }),
  ],
  expectedOutcome: {
    outcome: "supply_cut",
    winner: "player",
    maxTick: 21600,
    casualtyBand: { min: 0, max: 6 },
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
 *   - 北橋アプローチ門  gate_narrow_3_ne_sw @ (56, 49)
 *   - 南橋アプローチ門  gate_narrow_3_ne_sw @ (56, 65)
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

// ---- Scenario D: mountainCastleScript ----------------------------------------

/**
 * mountain-castle (霞ヶ峰城・2.0ショーケース) の完走台本。
 *
 * 戦略 (試行錯誤の結論):
 *   1. 野戦は大手正面のみ、セレクタは常に (56,86) r14 — L2/L3 守備・搦手門
 *      衛兵は絶対に動かさない。広半径で引き抜くと東側の長い迂回路 (搦手道経由)
 *      で各個撃破され守備が崩壊する。
 *   2. 兵糧は市場接続が生きているうちに買い増し (蔵初期在庫 1200 だけでは
 *      24000 tick 籠城に不足)、tick 11500 で虎口門を閉じて本丸を封鎖する。
 *      閉門後も兵糧接続は supply 視点で通るが市場取引は切れる。
 *   3. 荷車は第1〜3波のみ撃破 (第3波は撤退タイマー×第4波スポーンの関係で
 *      tick 12200 以降に)。第4波の荷車2台は意図的に放置 — 1台でも生存して
 *      いれば撤退タイマーは始動せず、time_held (24000) が決定的に成立する。
 *
 * 座標参照:
 *   - 本丸          honmaru @ (59, 60)  L3 (footprint 59..61 × 60..62)
 *   - 虎口門 (L3)   gate_narrow_3 @ (59, 64) — L3 への唯一の入口
 *   - 大手門 (L1)   gate_wide_2 @ (56, 85)
 *   - 搦手門 (L1)   gate_narrow_3_ne_sw @ (73, 78)
 *   - 城下守備       spear(55,106) archer(57,106)
 *   - 各波荷車       wave1: (56,119)  wave2: (56,120)  wave3: (56,121)  wave4: (55,120),(76,110)
 */
export const mountainCastleScript: PlaythroughScript = {
  scenarioId: "mountain-castle",
  steps: [
    // ── Phase 0: 城下遅滞部隊の回収と兵糧の買い付け ────────────────────────
    // 城下守備は tick 0 から敵物見 (y≈112) に自動交戦で釣り出されるので、
    // 少し南寄りの広めセレクタで拾って大手坂上へ引き上げる。
    s(200,  { type: "moveUnits", selector: playerNear({ x: 56, y: 108 }, 10), destination: { x: 56, y: 87 } }),
    // 兵糧: 蔵2棟の初期在庫 1200 では 24000 tick 籠城に足りない (40周期 × 生存数×2)。
    // 市場が本丸に接続している間 (虎口門を閉じる 11500 まで) は税収が貯まり次第
    // 買い増す。金不足の回は拒否されるだけで無害。
    s(500,  { type: "marketTrade", trade: "buyFood" }),
    s(2000, { type: "marketTrade", trade: "buyFood" }),

    // ── Wave 1 (tick 3000): 大手坂前で荷車を優先撃破 ──────────────────────
    // 野戦セレクタは常に中心 (56,86) r14 — 大手野戦部隊+回収済み城下部隊だけを
    // 拾い、L2/L3 守備・搦手門衛兵 (最短でも距離17超) は絶対に動かさない。
    // 広半径で守備隊まで引き抜くと東側の長い迂回路で各個撃破され、守備が崩壊する。
    s(3100, { type: "attackTarget", selector: playerNear({ x: 56, y: 86 }, 14), targetSelector: enemyOfType("supply_cart") }),
    s(3500, { type: "marketTrade", trade: "buyFood" }),
    s(5000, { type: "marketTrade", trade: "buyFood" }),
    // 荷車追撃で南方 (y≈120) に残った部隊を大手坂上へ回収。
    s(5500, { type: "moveUnits", selector: playerNear({ x: 56, y: 112 }, 12), destination: { x: 56, y: 84 } }),
    s(6500, { type: "marketTrade", trade: "buyFood" }),

    // ── Wave 2 (tick 7200): 野戦部隊で迎撃し荷車も撃破 ─────────────────────
    s(7300, { type: "attackTarget", selector: playerNear({ x: 56, y: 86 }, 14), targetSelector: enemyOfType("supply_cart") }),
    s(8000, { type: "marketTrade", trade: "buyFood" }),
    s(9500, { type: "marketTrade", trade: "buyFood" }),
    s(9800, { type: "moveUnits", selector: playerNear({ x: 56, y: 112 }, 12), destination: { x: 56, y: 84 } }),
    // 荷車追撃で南方 (y≈120) に残留した部隊を必ず回収する。放置すると第3波の
    // 荷車 (56,121) がスポーン直後に自動交戦で撃破され、撤退タイマーが第4波
    // スポーン (17000) より先に発火して supply_cut 早期終了してしまう。
    s(10200, { type: "moveUnits", selector: playerNear({ x: 56, y: 110 }, 20), destination: { x: 56, y: 84 } }),
    s(11000, { type: "marketTrade", trade: "buyFood" }),
    // 虎口門 (59,64) は L3 本丸への唯一の入口 (幅1の 2→3 坂の出口)。開けたままだと
    // 搦手門から浸透した第3波がマーカー守備1体を削り殺して honmaru_fallen する
    // (実測 tick≈12881)。第3波の搦手浸透が L3 に届く前 (実測 ≈12400) に閉じれば、
    // 敵は 380hp の門を高所の L3 弓兵の射撃下で叩くしかなく、本丸は落ちない。
    // 兵糧接続は supply 視点で閉門を通過するので籠城中も補給は切れない。
    s(11500, { type: "toggleGate", position: { x: 59, y: 64 } }),

    // ── Wave 3 (tick 12000): 大手・搦手の二方面 ────────────────────────────
    // 荷車撃破は tick 12200 より後に (撃破+4800 の撤退タイマーが第4波スポーン 17000 より
    // 先に発火すると supply_cut で早期終了してしまう)。第4波の荷車は2台で片方しか
    // 攻撃しないため、タイマーは再始動せず time_held (24000) が決定的に成立する。
    s(12200, { type: "moveUnits", selector: playerNear({ x: 72, y: 79 }, 8), destination: { x: 72, y: 84 } }),
    s(12300, { type: "attackTarget", selector: playerNear({ x: 56, y: 86 }, 14), targetSelector: enemyOfType("supply_cart") }),
    s(15000, { type: "stopUnits", selector: allPlayer }),
    // 第3波荷車追撃の南方残留部隊も回収 (第4波の大手荷車 (55,120) を偶発撃破させない)
    s(15600, { type: "moveUnits", selector: playerNear({ x: 56, y: 105 }, 20), destination: { x: 56, y: 84 } }),

    // ── Wave 4 (tick 17000): 総攻撃 — 大手坂上で受け止める ─────────────────
    // 大手側の荷車 (55,120 / 先スポーン=先ターゲット) のみ撃破。搦手側の荷車
    // (76,110) は意図的に残す — 荷車が1台でも生存していれば撤退タイマーは
    // 始動せず、time_held (24000) が決定的に成立する。
    s(17100, { type: "attackTarget", selector: playerNear({ x: 56, y: 86 }, 14), targetSelector: enemyOfType("supply_cart") }),
    s(20000, { type: "stopUnits", selector: allPlayer }),
    // 野戦部隊は大手坂上に再集結 (本丸は閉じた虎口門と L3 守備が保持する)。
    s(20500, { type: "moveUnits", selector: playerNear({ x: 56, y: 90 }, 25), destination: { x: 56, y: 84 } }),
  ],
  expectedOutcome: {
    outcome: "time_held",
    winner: "player",
    maxTick: 28000,
  },
};

// ---- Script registry -------------------------------------------------------

/** All playthrough scripts in scenario order (A / B / C / D difficulty). */
export const playthroughScripts: readonly PlaythroughScript[] = [
  concentricCastleScript,
  linearFortressScript,
  riversideDefenseScript,
  mountainCastleScript,
];
