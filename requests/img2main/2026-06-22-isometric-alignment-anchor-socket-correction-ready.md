# Isometric Alignment Anchor / Socket Correction Ready

対応対象:

- `requests/main2img/2026-06-22-isometric-alignment-anchor-socket-correction.md`

実施内容:

- `building.wall.plaster.connected.*` の全16マスクと通常壁を、alpha bottom が `anchorY=80` に一致するよう再生成・補正しました。
- `building.fence.wood.connected.*` の全16マスクと通常柵を、alpha bottom が `anchorY=48` に一致するようsource PNGを補正しました。
- `building.storehouse`、`building.gate.wood.closed` は現行sourceでalpha bottomとanchorが一致していることを確認しました。
- `building.yagura.small.normal` をproduction runtime定義に追加しました。
  - source: `assets/source/raster/approved-production/batch-01/building-yagura-small-normal.png`
  - canvas: `224x208`
  - anchor: `112,183`
  - footprint: `1x1`
  - 注記: 最終footprintはゲームデザイン側で要確認です。
- `artifacts/isometric-alignment/contact-sheet.png` を再生成しました。
  - tile grid
  - footprint diamond
  - anchor crosshair
  - sprite bounds
  - connected/socket points
- `artifacts/isometric-alignment/report.md` にcanvas、anchor、alpha bounds、footprint、懸念欄を出力しました。
- `artifacts/isometric-alignment/source-correction-report.md` にsource PNG補正前後のboundsとdeltaYを出力しました。

代表実測値:

| assetId | canvas | anchor | alpha bounds |
| --- | --- | --- | --- |
| `building.wall.plaster.connected.1010` | `64x96` | `32,80` | `7,30-54,80` |
| `building.fence.wood.connected.1010` | `64x64` | `32,48` | `10,21-54,48` |
| `building.storehouse` | `320x260` | `160,203` | `41,14-293,203` |
| `building.gate.wood.closed` | `80x80` | `40,61` | `15,8-65,61` |
| `building.yagura.small.normal` | `224x208` | `112,183` | `50,19-174,183` |

実行済みコマンド:

```sh
pnpm --filter @asama/asset-tools assets:generate:directional-wall-gates
pnpm run assets:alignment:correct
pnpm run assets:all
pnpm run assets:alignment:contact-sheet
pnpm run typecheck
pnpm test
pnpm run assets:audit:production
```

確認結果:

- `assets:all`: `Completed asset pipeline; validated 205 generated assets.`
- `typecheck`: passed
- `test`: passed, 26 tests
- `assets:audit:production`: passed

残件:

- `building.yagura.small.normal` の最終footprintは、設計側で1x1のまま採用するか要確認です。
