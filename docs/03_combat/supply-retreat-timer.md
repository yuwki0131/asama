# 補給荷車と撤退タイマー仕様 (Supply Cart & Retreat Timer)

> 実装: `packages/simulation/src/world.ts` — `updateSupplyState()`, `checkOutcome()`
> 定数: `SIEGE_BALANCE.supplyRetreatTicks = 4800` (4分 @ 20tps)

## 概要

敵の補給荷車 (`supply_cart`) が戦場から失われると兵糧が途絶し、攻撃側は撤退を余儀なくされる。
これは防衛側に「荷車を優先撃破して短縮勝利を狙う」という戦略的選択肢を与える。

## 発動条件

1. **過去に供給荷車が1体以上出現していた** (`supplyState.hasHadCart = true`)
2. **生存する敵荷車が0になった**

両条件が同時に成立した瞬間から撤退タイマーが起動する。

## タイマー挙動

| 状態 | 処理 |
|-----|-----|
| タイマー発動中、荷車が再出現 | タイマー解除 (`retreatTimerActive = false`) |
| 荷車再び全滅 | タイマー再起動 |
| タイマー満了 (`remainingTicks ≤ 0`) | 敵全ユニット即時撤退(除去)、ゲーム終了 |

## 勝利条件

タイマー満了時:
- 敵ユニット全除去
- `GameOutcome = { winner: "player", reason: "supply_cut" }`

既存の `holdTicks` による時間切れ勝利と共存する。判定順は:

1. `supply_cut`(撤退タイマー満了)
2. `honmaru_fallen`(本丸陥落)
3. `time_held`(規定時間保持)
4. `enemy_annihilated`(敵全滅)

荷車を破壊しても `holdTicks` より早くタイマーが満了しなければ通常勝利となる。

## スナップショット

`WorldSnapshot.supplyRetreat` に以下を公開する(UI 表示用):

```ts
supplyRetreat: {
  active: boolean;       // タイマー進行中か
  remainingTicks: number // 残りtick(inactive時は0)
}
```

## シリアライズ互換

旧セーブに `supplyState` が存在しない場合は `deserializeWorld` 内で `??=` 補完:

```ts
world.supplyState ??= { hasHadCart: false, retreatTimerActive: false, retreatTimerRemaining: 0 };
```

## シナリオ設定例

wave の spawns に `supply_cart` を含めるだけで機能する:

```ts
waves: [
  {
    tick: 3600,
    spawns: [
      { type: "supply_cart", position: { x: 90, y: 58 } },
      { type: "spear_ashigaru", position: { x: 88, y: 58 } }
    ]
  }
]
```
