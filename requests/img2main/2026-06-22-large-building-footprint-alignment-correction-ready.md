# Large Building Footprint Alignment Correction Ready

対応対象:

- `requests/main2img/2026-06-22-large-building-footprint-alignment-correction.md`

実施内容:

- 大型建築source PNGを、宣言済みの`64x32` isometric footprintに合う基壇・敷地面を持つ形へ補正しました。
- 補正は再実行で劣化しないよう、初回退避した元画像から生成する方式にしました。
  - backup: `assets/source/raster/approved-production/large-building-scale/original-footprint-correction/`
  - script: `packages/asset-tools/src/correctLargeBuildingFootprints.ts`
- `building.market`と`building.barracks`は横方向に`0.9`倍へ縮小し、`6x4` footprint内へ収めました。
- `building.town_block`は横方向に`0.96`倍へ縮小し、`8x8` footprintに合わせました。
- `building.samurai_residence`と`building.storehouse`はスケール維持のまま、footprint一致の基壇を追加しました。
- production geometry metadataは変更していません。canvas、anchor、footprintは既存runtime contractを維持しています。
- runtime PNGとmanifestを再生成しました。
- `artifacts/isometric-alignment/contact-sheet.png` と `artifacts/isometric-alignment/report.md` を更新しました。
- 補正詳細レポートを追加しました。
  - `artifacts/isometric-alignment/large-building-footprint-report.md`

対象別結果:

| assetId | canvas | anchor | footprint | after alpha bounds | base match |
| --- | --- | --- | --- | --- | --- |
| `building.town_block` | `640x420` | `320,338` | `8x8` | `63,16-577,338` | corrected 64x32 footprint foundation |
| `building.market` | `420x280` | `210,196` | `6x4` | `49,16-370,196` | corrected 64x32 footprint foundation |
| `building.barracks` | `420x280` | `210,210` | `6x4` | `49,16-370,210` | corrected 64x32 footprint foundation |
| `building.samurai_residence` | `460x360` | `230,273` | `6x6` | `37,18-428,273` | corrected 64x32 footprint foundation |
| `building.storehouse` | `320x260` | `160,203` | `4x4` | `31,14-293,203` | corrected 64x32 footprint foundation |

実行済みコマンド:

```sh
pnpm run assets:alignment:correct-large-buildings
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

- 今回は既存production rasterを保持した補正です。完全な手描き/Blender再制作ではありません。
