# Production Building Scale-Up Request

## 目的

現行のBatch 02建物はruntime互換のため小さいcanvasに収めているが、ゲーム画面上では天守、蔵、市場、兵舎、武家屋敷、町区画が全体的に小さく見える。

実装側では暫定的に描画スケールを上げたが、拡大表示は画質劣化や密集時の見た目調整に限界がある。次のproduction passでは、大きめcanvas前提の本番アセットを用意したい。

## 現行の暫定実装

描画側で以下の表示倍率を入れている。

```text
building.tenshu.test: 1.38
building.storehouse: 1.22
building.market: 1.25
building.barracks: 1.25
building.samurai_residence: 1.18
building.town_block: 1.18
```

このため、現行runtimeにはそのまま差し替えず、次の候補画像は「larger runtime definition追加」を前提に作る。

## 作業前に読むもの

```text
AGENTS.md
docs/05_map-and-art/art-direction.md
docs/05_map-and-art/asset-pipeline.md
assets/source/raster/approved-production/batch-02-buildings/generation-report.md
requests/img2main/2026-06-16-production-art-batch-02-buildings-ready.md
```

## 依頼内容

以下の大きめproduction候補を生成する。

### 天守

```text
candidate assetId: building.tenshu.medium
file: building-tenshu-medium.png
canvas: 192x176
anchor: 96,156
footprint: 2x2
```

要件:

- 画面上で城の中心建築として読める大きさ
- 日本城郭の天守として見えること
- 中国風楼閣にしない
- 石垣、白漆喰、瓦屋根の素材感
- 既存 `building.tenshu.test` より明確に大きく、ランドマーク感がある

### 蔵

```text
candidate assetId: building.storehouse.large
file: building-storehouse-large.png
canvas: 128x112
anchor: 64,94
footprint: 2x1
```

要件:

- 既存蔵の方向性を維持
- 白壁または土壁、瓦屋根、貯蔵施設として読める
- 1x1版より存在感を上げる

### 市場

```text
candidate assetId: building.market.large
file: building-market-large.png
canvas: 144x112
anchor: 72,94
footprint: 2x1
```

要件:

- 店先、庇、荷物、屋台要素で市場と分かる
- 町区画や蔵とシルエットで区別できる

### 兵舎

```text
candidate assetId: building.barracks.large
file: building-barracks-large.png
canvas: 144x112
anchor: 72,94
footprint: 2x1
```

要件:

- 武具、槍立て、訓練場らしさなどで軍事施設と分かる
- 市場や町家と混同しない

### 武家屋敷

```text
candidate assetId: building.samurai_residence.large
file: building-samurai-residence-large.png
canvas: 144x112
anchor: 72,94
footprint: 2x1
```

要件:

- 屋敷、門、塀、庭などで上級住宅として読める
- 派手すぎず、町区画より格式がある

### 町区画

```text
candidate assetId: building.town_block.large
file: building-town-block-large.png
canvas: 144x112
anchor: 72,94
footprint: 2x1
```

要件:

- 複数の町家がまとまった区画として読める
- 市場や武家屋敷と見分けられる

## 出力先

```text
assets/source/raster/approved-production/building-scale-up/
```

必要ファイル:

```text
building-tenshu-medium.png
building-storehouse-large.png
building-market-large.png
building-barracks-large.png
building-samurai-residence-large.png
building-town-block-large.png
contact-sheet.png
in-game-composite-preview.png
generation-report.md
asset-map.json
```

## 注意

- 今回の候補は、現行 `public/assets/generated/manifest.json` へ即時取り込みしなくてよい
- 現行assetIdを上書きしない
- まずはsource候補として提出する
- 実装側でmulti-cell building definitionを追加してからruntimeへ取り込む

## 完了報告

完了したら次を作成する。

```text
requests/img2main/2026-06-16-production-art-building-scale-up-ready.md
```

報告には次を含める。

- 生成したcandidate assetId一覧
- canvas、anchor、footprint
- 出力ファイル一覧
- 透明背景、alpha、寸法検証結果
- 既存1x1版と比べた視認性の改善点
- 目視上の懸念点

