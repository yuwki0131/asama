# 兵種相性表 (Unit Type Affinity)

> 実装: `packages/content/src/index.ts` — `UNIT_TYPE_AFFINITY`
> 適用: `packages/simulation/src/combat.ts` — `damageAgainst()`

## ダメージ倍率

| 攻撃兵種 | 対象兵種 | 倍率 |
|---------|---------|-----|
| 槍足軽 (spear_ashigaru) | 騎兵 (cavalry) | ×1.5 |
| 騎兵 (cavalry) | 弓 (archer) | ×1.5 |
| 騎兵 (cavalry) | 鉄砲 (musketeer) | ×1.5 |
| 弓 (archer) | 槍足軽 (spear_ashigaru) | ×1.25 |
| 弓 (archer) | 刀足軽 (sword_ashigaru) | ×1.25 |
| 弓 (archer) | 工兵 (engineer) | ×1.25 |
| 鉄砲 (musketeer) | 槍足軽 (spear_ashigaru) | ×1.25 |
| 鉄砲 (musketeer) | 刀足軽 (sword_ashigaru) | ×1.25 |
| 鉄砲 (musketeer) | 工兵 (engineer) | ×1.25 |

表に記載のない組み合わせはすべて倍率 ×1.0(等倍)。

## 設計方針

- データ値は `UNIT_TYPE_AFFINITY` 定数にまとめ、シミュレーションロジックから参照する
- 建物への攻撃には相性を適用しない(target が UnitType を持たない場合は等倍)
- 相性は攻撃ダメージにのみ影響し、HP・射程・クールダウンは変化しない

## 新兵種スペック概要

| 兵種 | HP | 攻撃力 | 射程 | クールダウン | 移動速度 | 備考 |
|-----|---|------|------|------------|---------|-----|
| musketeer (鉄砲) | 60 | 20 | 4 | 2.5s | 通常 (7tps) | 射程長・高火力・低耐久 |
| cavalry (騎兵) | 140 | 16 | 1 | 1.2s | 高速 (3tps) | HP高・約2倍速・梯子使用不可 |
| supply_cart (補給荷車) | 80 | 0 | 0 | — | 低速 (10tps) | 敵専用・非戦闘・撤退タイマーに関与 |

騎兵の移動速度制限:
- 水堀・塀は既存の passable=false 判定で通過不可
- 梯子タスクは engineer 専用のため受け付けない
