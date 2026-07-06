# 依頼: 橋の1x3化に伴うシナリオ配置位置の更新

## 依頼元
packages/simulation (sim エージェント)

## 背景
橋（earth_bridge / wood_bridge）を1×1タイルから **1×3タイル** に変更した。
プレイヤーが配置する橋は「中央マス = water 地形、両端マス = 通行可能な陸地（grass/dirt）」を必須とする。

現在のシナリオ配置はこの制約を満たしておらず、互換性のために
**シード時のみ旧バリデーション（1×1 per-cell）を使っている**。
これは暫定措置であり、シナリオを正しい 1×3 対応位置に更新してほしい。

## 新しい配置ルール

```
center (position): water 地形
向き = "y" のとき: footprint = [{x, y-1}, {x, y}, {x+1, y}] — 南北方向 (E-W の川を渡る)
向き = "x" のとき: footprint = [{x-1, y}, {x, y}, {x+1, y}] — 東西方向 (N-S の川を渡る)

向き判定: center の東 or 西に water/water_moat/dry_moat があれば y、なければ x
```

## 新しい assetId

| 旧 assetId | 新 assetId (x 向き) | 新 assetId (y 向き) |
|---|---|---|
| building.earth_bridge | building.earth_bridge.x3 | building.earth_bridge.y3 |
| building.wood_bridge | building.wood_bridge.x3 | building.wood_bridge.y3 |

アセット画像は統括が準備予定。

## 更新が必要なシナリオ配置

### mvpDefenseScenario

```typescript
// 現在 (問題あり: {62,45} は草地)
{ type: "earth_bridge", position: { x: 61, y: 44 } },  // water ✓ 1x3 対応済み
{ type: "wood_bridge",  position: { x: 62, y: 45 } },  // grass ✗ → water 位置に移動必要

// 川の y 座標: y = 42 + Math.round(Math.sin(x/9) * 4)
// x=62 での川位置 → y ≈ 44
// 修正案: { type: "wood_bridge", position: { x: 62, y: 44 } }
// ただし {62,44} は earth_bridge のフットプリント ({61,43},{61,44},{61,45}) と
// 重複しないことを確認すること。
// 別の crossing 位置 (例: {64,45}) を検討するか、earth_bridge のみ残すことを推奨。
```

### concentricCastleScenario

```typescript
// 現在
{ type: "earth_bridge", position: { x: 63, y: 45 } },
// x=63 での川: y = 42 + round(sin(63/9)*4) ≈ 45 ✓ → すでに water 上
// 両端 {63,44} と {63,46} が草地なら問題なし — 要確認
```

### linearFortressScenario

```typescript
// 現在 (問題あり: 川は y≈41 付近、{31,22} は水上ではない)
{ type: "earth_bridge", position: { x: 31, y: 22 } },
{ type: "earth_bridge", position: { x: 32, y: 22 } },
// これらは dry_moat 上に置かれているが、新バリデーションは center=water 地形のみ許可。
// dry_moat の中央に橋を架ける場合は専用の対応が別途必要。
// 暫定: この 2 本は削除するか、川が通っている位置に移動する。
```

### riversideDefenseScenario

```typescript
// 現在
{ type: "wood_bridge",  position: { x: 58, y: 50 } },
{ type: "earth_bridge", position: { x: 58, y: 66 } },
// 川位置の確認が必要だが、riverside シナリオは川沿いのため
// 位置が正しければ自動で 1x3 になる可能性が高い。
```

## sim 側の暫定措置

`seedInitialBuildings` に以下のコメントがある (packages/simulation/src/buildings.ts):

```typescript
// Bridges in existing scenarios use pre-1x3 single-cell positions; validate
// with the legacy per-cell check until scenarios are updated (see requests/sim2content).
const canPlace = isBridge(definition.type)
  ? canPlaceOnCell(world, placement.position, definition)
  : canPlaceBuilding(world, placement.position, definition);
```

シナリオが 1×3 対応位置に更新されたら、この分岐を削除して `canPlaceBuilding` に統一できる。

## アクション依頼

1. 各シナリオの橋位置を water 地形上に修正
2. `earth_bridge` / `wood_bridge` の `footprint` は content 側の変更不要（sim 側で動的計算）
3. assetId も変更不要（sim が `.x3` / `.y3` サフィックスを動的に付与）
4. 修正後、sim 側の暫定コードを削除できる旨を sim チームに連絡
