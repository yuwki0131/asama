# AIプロファイル行動プリミティブAPI要求仕様

## 背景と現状確認

`packages/simulation/src/index.ts` の `updateEnemyAi` / 関連定数を読んだ上で本要求を作成する。

### 現行実装の構造（2026-07-05 時点）

```typescript
// 定数
const ENEMY_AI = {
  decisionIntervalTicks: 40,  // 40tick(=2秒)ごとに判断
  aggroRange: 12              // マンハッタン距離12以内の守備ユニットを優先攻撃
} as const;

const BREACHABLE_BUILDING_TYPES = [
  "wall", "fence", "gate", "gate_wide_2", "gate_wide_3",
  "gate_ne_sw", "gate_wide_2_ne_sw", "gate_wide_3_ne_sw"
];

// メイン関数
function updateEnemyAi(world: WorldState): void {
  spawnAttackWaves(world);                  // 波スポーン
  if (tick % decisionInterval !== 0) return;

  for (const unit of enemyUnits) {
    // 1. 近くの守備ユニットをアグロして直接攻撃
    // 2. すでに移動中/攻撃中/作業中なら継続
    // 3. 本丸への経路探索 → 成功なら進軍
    // 4. 経路不通なら breach:
    //    - engineer: wall に梯子 OR dry/water moat を埋める
    //    - 非engineer: 最近傍の breachable 建物を攻撃
  }
}
```

**現行AIの行動プロファイル**: 正面強襲型の1種のみ。全ユニットが同じロジックで本丸を目指し、経路が通れば進軍、通らなければ障害物を破壊する。

---

## 要求の目的

`docs/07_scenarios/ai-profiles.md` に定義された3つのプロファイルを実装するため、simulation側に行動プリミティブAPIの追加を求める。

- **梯子強襲型（LadderAssault）**: 壁の弱点を評価し、工兵を計画的に送り込んで梯子を設置してから歩兵を投入する
- **堀埋め型（MoatFill）**: 特定の堀セルを目標として工兵を優先的に派遣し、堀を埋めた後に強襲する
- **混合型（Mixed）**: 複数地点で門攻撃・梯子・堀埋めを並行して実施し、兵力配分はシナリオから指定する

---

## 要求するAPI

### 1. AIプロファイル識別子の型

```typescript
// packages/shared/src/index.ts に追加
export type EnemyAiProfile =
  | "frontal_assault"    // 現行（正面強襲）
  | "ladder_assault"     // 梯子強襲型
  | "moat_fill"          // 堀埋め型
  | "mixed";             // 混合型
```

`ScenarioDefinition` に `enemyAiProfile?: EnemyAiProfile` フィールドを追加し、未指定時は `"frontal_assault"` にフォールバックする。これは content 側のシナリオデータで指定できるようにするためのもの。

### 2. 壁弱点評価関数

```typescript
// 内部関数として simulation に追加
function evaluateWallBreachTargets(
  world: WorldState,
  maxCandidates: number
): Array<{
  building: BuildingState;          // 対象壁・柵
  estimatedPathCostAfterBreach: number; // 突破後の本丸までの推定コスト
  ladderAlreadyPresent: boolean;
}>
```

**背景**: 現行の `nearestBuildingOfTypes(world, unit, ["wall"])` は単純に「最近傍の壁」を返すだけで、突破後のルートコストを考慮しない。梯子強襲型AIは「どこに梯子を掛けると本丸に最短で到達できるか」を評価する必要がある。

**受け入れ条件**:
- 返す候補は `maxCandidates` 件以下
- `estimatedPathCostAfterBreach` は仮突破（当該建物を通過可能と仮定した上での A*）で算出する
- `water_moat` / `dry_moat` は考慮外（indestructible なため）
- 既に梯子が設置済みの壁は `ladderAlreadyPresent: true` として返す（除外はしない）

### 3. 工兵派遣指示API（目標座標指定）

```typescript
// updateEnemyAi から呼び出せる内部ヘルパー
function assignEngineerTask(
  unit: UnitState,           // engineer ユニット
  task: EngineerTaskKind,    // "ladder" | "fillMoat"
  targetPosition: CellCoord  // 作業対象セルの座標
): boolean                   // 割り当て成功なら true
```

**背景**: 現行は各 engineer が自分で「最近傍の壁を探してタスクを設定する」ため、複数の工兵が同じ壁に群がる問題が発生する。上位のプロファイルロジックから「どの工兵をどこへ」を明示的に割り当てられるようにする。

**受け入れ条件**:
- ユニットが `engineer` 以外の場合は `false` を返し、タスクは設定しない
- `unit.task !== null` の場合（既にタスク割当済み）も `false` を返す
- 成功時は `unit.task = { kind, target, progress: 0 }` を設定する
- 経路探索は行わない（移動は既存の `unit.path` 設定ロジックが担当）

### 4. 堀セル列挙関数

```typescript
function findMoatCellsOnRoute(
  world: WorldState,
  fromPosition: CellCoord,   // 工兵の現在地 or 敵スポーン地点
  toPosition: CellCoord,     // 本丸の座標
  moatTypes: readonly BuildingType[]  // 対象の堀種別
): CellCoord[]
```

**背景**: 堀埋め型AIは「本丸への最短ルート上にある堀セル」を優先して工兵を送る。現行の `nearestBuildingOfTypes` は単純近傍探索であり、ルート上の堀を特定できない。

**受け入れ条件**:
- A* で from→to を探索し、通過したセルに存在する `moatTypes` の建物を順番に返す
- 経路が見つからない場合は空配列を返す
- intact かつ player-owned の堀のみ対象とする

### 5. 攻撃目標優先度重み付けAPI

```typescript
// ScenarioDefinition (shared) に追加するフィールド
interface ScenarioAiWeights {
  // 各行動への相対重み (合計が1.0になるよう正規化する)
  readonly frontalAssaultWeight: number;  // 正面ゲート攻撃
  readonly ladderWeight: number;          // 梯子設置
  readonly moatFillWeight: number;        // 堀埋め
}
```

混合型AIがシナリオから行動比率を受け取るためのデータ構造。`ScenarioDefinition` に `aiWeights?: ScenarioAiWeights` として追加し、未指定時は `{ frontalAssaultWeight: 1, ladderWeight: 0, moatFillWeight: 0 }` をデフォルトとする。

**受け入れ条件**:
- 各値は0以上の実数
- 全て0の場合は `frontalAssaultWeight: 1` として扱う
- simulation側では重みをそのまま保持し、プロファイルロジックが確率的またはラウンドロビンで使用する

---

## 変更スコープ

| パッケージ | 変更内容 |
|-----------|---------|
| `@asama/shared` | `EnemyAiProfile` 型、`ScenarioDefinition.enemyAiProfile?`、`ScenarioDefinition.aiWeights?`、`ScenarioAiWeights` インターフェース |
| `@asama/simulation` | `evaluateWallBreachTargets`、`assignEngineerTask`、`findMoatCellsOnRoute` の追加。`updateEnemyAi` をプロファイル別の処理にディスパッチするよう改修 |
| `@asama/content` | シナリオデータに `enemyAiProfile` / `aiWeights` フィールドを追加（shared型変更後） |

---

## 受け入れ条件（全体）

1. `pnpm run typecheck` が成功する
2. `pnpm test` が成功する（既存テストを壊さない）
3. `enemyAiProfile` 未指定のシナリオは従来と同一挙動を示す（後方互換）
4. 各プリミティブ関数に対して最低1件のユニットテストが追加されている

---

## 非要求（やらないこと）

- 学習型AIや動的な戦術切り替え（Fog of War・長期経済最適化）
- 防衛AI（攻撃側プレイシナリオは対象外）
- 砲撃・火災判断ロジック
- 複数ユニットのグループ行動調整（隊形維持・連携射撃）
- 新たな `UnitType` や `BuildingType` の追加（既存型のみで実装すること）

---

## 関連ファイル

- `docs/07_scenarios/ai-profiles.md` — プロファイル仕様の原文
- `packages/simulation/src/index.ts` — 現行 `updateEnemyAi` 実装
- `docs/07_scenarios/riverside-defense.md` — 梯子強襲・堀埋め型が登場する最初のシナリオ
