# Production Raster Art Batch 1 Request

## 目的

本番アート投入経路を早期に実用化するため、Blender `.blend` 定義の完成を待たず、承認済みAI生成または手修正済みPNGを `raster` 入力として取り込む。

既存のruntime互換性を必ず維持すること。

- 既存 `assetId` を変更しない
- 既存 `public/assets/generated/manifest.json` の `file`, `width`, `height`, `anchor` と整合させる
- ゲーム本体にsource種別を意識させない
- TypeScript/SVGテンプレートはplaceholder/debug用途のまま拡張しない
- 本番画像の制作元は `assets/source/raster/approved-ai/production/batch-1/` に置く
- 最終出力は従来どおり `public/assets/generated/` に取り込む

## 作業前に読むもの

```text
AGENTS.md
docs/README.md
docs/05_map-and-art/art-direction.md
docs/05_map-and-art/asset-pipeline.md
requests/main2img/2026-06-15-production-art-pipeline-migration.md
requests/img2main/2026-06-15-production-art-pipeline-migration-ready.md
assets/definitions/README.md
assets/definitions/production-assets.json
public/assets/generated/manifest.json
```

## 現状

移行基盤は実装済みだが、`assets/definitions/production-assets.json` はまだ空である。

`assets:render:blender` は `.blend` 定義がないため「No Blender production assets configured.」で正常終了する。今回の依頼では、先に `source.type: "raster"` のproduction定義を追加して、production artへ置換済みのassetIdを作る。

## アート方針

- Stronghold風の固定アイソメトリック2Dプリレンダー
- 日本の戦国時代から江戸初期
- 疑似ドット絵、減色調、低彩度
- 光源は画面左上、影は右下
- 透明背景PNG
- ぼかしすぎず、小さい表示でも識別できること
- 太い黒輪郭は避ける
- 建物は接地感を重視し、キャンバス下端側のanchor位置に自然に乗ること
- 地形・道路・農地・堀・橋は64x32のアイソメトリック接地面に収める
- ユニットは足元がanchorに合うこと。体の重心をマス中央に置きすぎない

## 実装要件

1. 生成した本番PNGを次へ配置する。

```text
assets/source/raster/approved-ai/production/batch-1/
```

2. 置換するassetごとに `assets/definitions/production-assets.json` へ定義を追加する。

例:

```json
{
  "assetId": "building.market",
  "kind": "building",
  "output": "building-market.png",
  "source": {
    "type": "raster",
    "file": "assets/source/raster/approved-ai/production/batch-1/building-market.png"
  },
  "geometry": {
    "footprintWidth": 1,
    "footprintHeight": 1,
    "canvasWidth": 96,
    "canvasHeight": 80,
    "anchorX": 48,
    "anchorY": 65.6
  },
  "category": "building"
}
```

3. `output` は既存manifestの `generated/<filename>` から `generated/` を除いた値にする。

4. `canvasWidth`, `canvasHeight`, `anchorX`, `anchorY` は既存manifestと同一互換にする。`anchorX/Y` は `width * anchor.x`, `height * anchor.y` でよい。

5. `footprintWidth/Height` はゲーム論理に合わせる。

- 基本は `1x1`
- `building.gate.wood.closed.width2` は `2x1`
- `building.gate.wood.closed.width3` は `3x1`

6. import後、既存placeholder由来PNGと同じ出力ファイルをproduction PNGで置き換える。

```text
pnpm run assets:import:raster
pnpm run assets:validate
pnpm run validate:generated-assets
```

この環境では必要に応じて次を使う。

```text
nix-shell --run 'pnpm run assets:import:raster'
nix-shell --run 'pnpm run assets:validate'
nix-shell --run 'pnpm run validate:generated-assets'
```

## Batch 1 対象

まず、MVP画面で目に入る主要アセットを本番化する。overlay系はdebug/UX用として当面SVG由来のままでよい。

| assetId | kind | output | canvas | anchor px | category | footprint |
|---|---:|---|---:|---:|---|---:|
| terrain.grass.base | terrain | terrain-grass-base.png | 64x32 | 32,16 | terrain | 1x1 |
| terrain.dirt.base | terrain | terrain-dirt-base.png | 64x32 | 32,16 | terrain | 1x1 |
| terrain.water.base | terrain | terrain-water-base.png | 64x32 | 32,16 | terrain | 1x1 |
| terrain.stone.base | terrain | terrain-stone-base.png | 64x32 | 32,16 | terrain | 1x1 |
| terrain.grass.variant.1 | terrain | terrain-grass-variant-1.png | 64x32 | 32,16 | terrain | 1x1 |
| terrain.dirt.variant.1 | terrain | terrain-dirt-variant-1.png | 64x32 | 32,16 | terrain | 1x1 |
| unit.ashigaru.idle.south | unit | unit-ashigaru-idle-south.png | 48x64 | 24,52.48 | unit | 1x1 |
| unit.ashigaru.move.south | unit | unit-ashigaru-move-south.png | 48x64 | 24,52.48 | unit | 1x1 |
| unit.ashigaru.idle.north | unit | unit-ashigaru-idle-north.png | 48x64 | 24,52.48 | unit | 1x1 |
| unit.ashigaru.idle.east | unit | unit-ashigaru-idle-east.png | 48x64 | 24,52.48 | unit | 1x1 |
| unit.ashigaru.idle.west | unit | unit-ashigaru-idle-west.png | 48x64 | 24,52.48 | unit | 1x1 |
| building.storehouse | building | building-storehouse.png | 96x80 | 48,65.6 | building | 1x1 |
| building.market | building | building-market.png | 96x80 | 48,65.6 | building | 1x1 |
| building.barracks | building | building-barracks.png | 96x80 | 48,65.6 | building | 1x1 |
| building.samurai_residence | building | building-samurai-residence.png | 96x80 | 48,65.6 | building | 1x1 |
| building.town_block | building | building-town-block.png | 96x80 | 48,65.6 | building | 1x1 |
| building.tenshu.test | building | building-tenshu-test.png | 112x104 | 56,91.52 | building | 1x1 |
| building.farm | building | building-farm.png | 64x32 | 32,16 | building | 1x1 |
| building.road | building | building-road.png | 64x32 | 32,16 | building | 1x1 |
| building.earth_bridge | building | building-earth-bridge.png | 64x32 | 32,16 | building | 1x1 |
| building.wood_bridge | building | building-wood-bridge.png | 64x32 | 32,16 | building | 1x1 |
| building.fence.wood | building | building-fence-wood.png | 64x64 | 32,48 | building | 1x1 |
| building.wall.plaster | building | building-wall-plaster.png | 64x72 | 32,56.16 | building | 1x1 |
| building.gate.wood.closed | building | building-gate-wood-closed.png | 80x80 | 40,62.4 | building | 1x1 |
| building.gate.wood.closed.width2 | building | building-gate-wood-closed-width2.png | 128x80 | 64,62.4 | building | 2x1 |
| building.gate.wood.closed.width3 | building | building-gate-wood-closed-width3.png | 192x80 | 96,62.4 | building | 3x1 |
| building.dry_moat | building | building-dry-moat.png | 64x32 | 32,16 | building | 1x1 |
| building.water_moat | building | building-water-moat.png | 64x32 | 32,16 | building | 1x1 |

## 接続系アセットの扱い

Batch 1で余力があれば、接続系も同時にproduction化する。難しければBatch 2として返答に明記する。

対象ファミリー:

```text
building.fence.wood.connected.0000 - 1111
building.wall.plaster.connected.0000 - 1111
building.dry_moat.connected.0000 - 1111
building.water_moat.connected.0000 - 1111
```

接続マスクは4bit文字列をそのまま使う。既存実装は隣接状態に応じてassetIdを切り替えるため、画像側は同一ファミリー内で接続位置の意味が一貫している必要がある。

接続系のcanvas/anchor:

- fence: `64x64`, anchor `32,48`
- wall: `64x72`, anchor `32,56.16`
- dry moat: `64x32`, anchor `32,16`
- water moat: `64x32`, anchor `32,16`

見た目の整合性を優先し、単体assetと接続assetで高さ、厚み、接地位置、影方向がずれないようにする。

## 品質チェック

- 透明背景である
- 指定canvasサイズに一致する
- anchorが接地点として自然に見える
- 左上光源、右下影が全assetで揃っている
- 町区画、武家屋敷、市場、兵舎、蔵はシルエットで見分けられる
- 道路、土橋、木橋は通行可能な床面として見える
- 堀と橋の見た目が矛盾しない
- 柵、城壁、堀の接続パターンは隣接時に線が途切れない
- 天守はテスト用1パターンでよいが、日本城郭として読めること

## 完了時の返答

完了したら次に報告ファイルを作る。

```text
requests/img2main/2026-06-15-production-raster-art-batch-1-ready.md
```

報告には次を含める。

- production化したassetId一覧
- 追加・更新したsource PNG一覧
- `assets/definitions/production-assets.json` に追加した件数
- 実行したコマンドと結果
- 未対応assetIdと理由
- 目視確認で気になる点

