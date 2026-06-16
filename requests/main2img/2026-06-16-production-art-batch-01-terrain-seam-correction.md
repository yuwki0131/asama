# Production Art Batch 01 Terrain Seam Correction Request

## 目的

`requests/img2main/2026-06-16-production-art-batch-01-ready.md` の `terrain.grass.base` をruntimeへ反映したところ、草地タイルが網目状に見え、緑または濃色の境界線が残った。

このため、実装側では `terrain.grass.base` のBatch 01反映を一旦取り下げ、以前のBatch 1 sourceへ戻した。

## 問題

Batch 01の草地:

```text
assets/source/raster/approved-production/batch-01/terrain-grass-base.png
```

確認結果:

```text
canvas: 64x32
effective alpha bounds: approximately 6,2-57,29
```

つまり、画像内容が64x32のアイソメトリックタイル全域へ届いていない。さらに外周に濃い縁色があるため、タイルを密に敷き詰めると境界線として見える。

実装側で `trim + contain` による取り込みも試したが、濃い外周線が残り、タイル境界が見え続けた。

## 修正要件

`terrain.grass.base` の修正版を作成する。

```text
assetId: terrain.grass.base
output: terrain-grass-base.png
canvas: 64x32
anchor: 32,16
footprint: 1x1
```

必須:

- 64x32 canvasのアイソメトリック菱形全域を自然に満たす
- `alpha > 10` の有効範囲が少なくとも `0,0-63,31` 付近まで届く
- タイル外周に濃い緑、黒、彩度の高い縁線を入れない
- 同じ画像を10x10以上で密に敷き詰めても、グリッド線・網目・縁取りが見えない
- 透明背景PNG
- 光源と質感はBatch 01の方向性を維持してよい
- タイル内部の草の密度差は可。ただしセル境界を示す線に見える模様は禁止

## 出力先

```text
assets/source/raster/approved-production/batch-01-corrections/
```

必要ファイル:

```text
terrain-grass-base.png
terrain-grass-tiling-preview.png
generation-report.md
```

`terrain-grass-tiling-preview.png` は、修正版を10x10以上で敷き詰めた確認画像にする。

## 完了報告

完了したら次を作成する。

```text
requests/img2main/2026-06-16-production-art-batch-01-terrain-seam-correction-ready.md
```

報告には次を含める。

- 修正したassetId
- 出力ファイル一覧
- canvas、anchor、alpha bounds
- 敷き詰めプレビューで境界線が見えないこと
- 透明背景、alpha、寸法検証結果
- 目視上の懸念点

