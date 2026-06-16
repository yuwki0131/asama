# Production Art Batch 01 Correction Request

## 目的

`requests/img2main/2026-06-16-production-art-batch-01-ready.md` の成果物を確認した結果、現行runtimeへそのまま反映できるものと、runtime互換性の都合で保留すべきものが分かれた。

現行実装へ安全に反映するには、既存manifest互換のcanvas、anchor、assetId、output名に合わせた修正版が必要。

## 反映済み

以下2件は既存runtime互換だったため、実装側で `assets/definitions/production-assets.json` のsourceをBatch 01へ差し替え済み。

```text
terrain.grass.base
building.road
```

反映先:

```text
assets/source/raster/approved-production/batch-01/terrain-grass-base.png
assets/source/raster/approved-production/batch-01/building-road-dirt.png
```

検証済み:

```text
pnpm run assets:import:raster
pnpm run assets:validate
pnpm run validate:generated-assets
```

## 修正が必要なもの

以下は画像としては生成済みだが、現行runtime manifestと互換ではないため未反映。

### building.storehouse

Batch 01:

```text
file: building-storehouse.png
canvas: 192x160
anchor: 96,136
footprint: 2x2
```

現行runtime:

```text
assetId: building.storehouse
output: building-storehouse.png
canvas: 96x80
anchor: 48,65.6
footprint: 1x1
```

依頼:

- 現行runtime互換版として `96x80` canvasで再出力する
- anchorは `48,65.6`
- footprintは `1x1`
- 見た目はBatch 01版の方向性を維持しつつ、小さいcanvasで読める蔵にする

### building.gate.wood.closed

Batch 01:

```text
file: building-gate-wood-closed.png
canvas: 192x176
anchor: 96,152
footprint: 2x1
```

現行runtime:

```text
assetId: building.gate.wood.closed
output: building-gate-wood-closed.png
canvas: 80x80
anchor: 40,62.4
footprint: 1x1
```

依頼:

- 現行runtime互換版として `80x80` canvasで再出力する
- anchorは `40,62.4`
- footprintは `1x1`
- 1セル門として読めること
- 幅2/幅3の門とは別物として、1セル用の小門にする

## 新規IDとして保留するもの

以下は現行runtime/content/manifestにまだ存在しないID、または新しい論理footprintを必要とするため、画像だけでは取り込めない。今回はsource保管のままとし、実装側のcontent定義追加タスクが必要。

```text
vegetation.forest.cluster.01
building.yagura.small.normal
building.yagura.small.occupied-cutaway
unit.ashigaru.spear.idle.ne
unit.ashigaru.spear.walk.ne
unit.engineer.idle.ne
unit.supply-cart.idle.ne
```

これらは画像修正不要。ただし、次回以降のruntime導入に備えて、asset-map上のcanvas/anchor/footprint情報は維持する。

## 出力先

修正版は新しいディレクトリに置く。

```text
assets/source/raster/approved-production/batch-01-corrections/
```

必要ファイル:

```text
building-storehouse.png
building-gate-wood-closed.png
contact-sheet.png
generation-report.md
```

## 完了報告

完了したら次を作成する。

```text
requests/img2main/2026-06-16-production-art-batch-01-corrections-ready.md
```

報告には次を含める。

- 修正したassetId一覧
- 出力ファイル一覧
- canvas、anchor、footprintが現行runtime互換であること
- 透明背景、alpha、寸法検証結果
- 目視上の懸念点

