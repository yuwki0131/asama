# Production Art Large Building Scale Request

## 目的

建物スケール方針を変更したため、主要建築物を大きい論理footprintに合わせたproduction artとして再制作する。

従来の1×1建物画像は、ユニットと比較して小さすぎ、城郭RTSとしてのスケール感が出ない。今後は、城・町・主要施設を大きな構造物として扱う。

## 新方針

```text
unit: 1x1
linear/ground objects: 1x1
storehouse: 4x4
market: 6x4
barracks: 6x4
samurai_residence: 6x6
town_block: 8x8
tenshu: minimum 8x8
```

城壁、柵、堀、道路、橋、農地は今回対象外。既存どおり基本1×1でよい。

## 作業前に読むもの

```text
AGENTS.md
docs/05_map-and-art/art-direction.md
docs/05_map-and-art/asset-pipeline.md
docs/05_map-and-art/map-specification.md
requests/img2main/2026-06-16-production-art-batch-02-buildings-ready.md
assets/source/raster/approved-production/batch-02-buildings/generation-report.md
```

## 出力先

```text
assets/source/raster/approved-production/large-building-scale/
```

## 制作対象

### 天守

```text
candidate assetId: building.tenshu.large
file: building-tenshu-large.png
footprint: 8x8
canvas: 640x520
anchor: 320,456
```

要件:

- ゲーム画面上で明確な城の中心建築として見える
- 日本城郭の天守。中国風楼閣にしない
- 石垣、白漆喰、瓦屋根の素材感
- 小さな塔ではなく、8×8区画を占有するランドマーク

### 町区画

```text
candidate assetId: building.town_block.large
file: building-town-block-large.png
footprint: 8x8
canvas: 640x420
anchor: 320,356
```

要件:

- 複数の町家がまとまった区画として読める
- 通路、屋根の連なり、小さな庭や荷物などで生活感を出す
- 市場や武家屋敷とシルエットで区別できる

### 蔵

```text
candidate assetId: building.storehouse.large
file: building-storehouse-large.png
footprint: 4x4
canvas: 320x260
anchor: 160,224
```

要件:

- 蔵として読める白壁・土壁・瓦屋根
- 小さい1×1版より明確に大きいが、町区画や天守より控えめ

### 市場

```text
candidate assetId: building.market.large
file: building-market-large.png
footprint: 6x4
canvas: 420x280
anchor: 210,236
```

要件:

- 店先、庇、荷物、屋台要素で市場と分かる
- 町区画や蔵と混同しない

### 兵舎

```text
candidate assetId: building.barracks.large
file: building-barracks-large.png
footprint: 6x4
canvas: 420x280
anchor: 210,236
```

要件:

- 武具、槍立て、訓練場らしさなどで軍事施設と分かる
- 市場や町家と混同しない

### 武家屋敷

```text
candidate assetId: building.samurai_residence.large
file: building-samurai-residence-large.png
footprint: 6x6
canvas: 460x360
anchor: 230,308
```

要件:

- 屋敷、門、塀、庭などで上級住宅として読める
- 派手すぎず、町区画より格式がある

## 品質要件

- 透明背景PNG
- 固定アイソメトリック2Dプリレンダー
- 光源は左上、影は右下
- 低彩度、疑似ドット絵、過剰な黒輪郭なし
- canvas内で接地点がanchorに自然に合う
- 同じ画面にユニット1×1がいても、主要建物が十分大きく見える
- 既存1×1版を単純拡大しただけにしない

## runtime反映について

今回の画像は、現行runtime assetIdを直接上書きしなくてよい。実装側でlarge building definitionとmanifest entryを追加してから取り込む。

## 完了報告

完了したら次を作成する。

```text
requests/img2main/2026-06-17-production-art-large-building-scale-ready.md
```

報告には次を含める。

- 生成したcandidate assetId一覧
- canvas、anchor、footprint
- 出力ファイル一覧
- 透明背景、alpha、寸法検証結果
- 既存1×1版と比べた視認性の改善点
- 目視上の懸念点

