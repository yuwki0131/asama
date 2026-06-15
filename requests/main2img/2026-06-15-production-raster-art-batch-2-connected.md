# Production Raster Art Batch 2 Connected Construction Request

## 目的

Batch 1で未対応だった接続系建築アセットをproduction rasterへ移行する。

対象は、隣接状態に応じて見た目を切り替える以下4ファミリー、合計64件。

```text
building.fence.wood.connected.*
building.wall.plaster.connected.*
building.dry_moat.connected.*
building.water_moat.connected.*
```

既存runtime互換性を維持し、Batch 1で投入済みの単体アセットと見た目がつながるようにする。

## 作業前に読むもの

```text
AGENTS.md
docs/README.md
docs/05_map-and-art/art-direction.md
docs/05_map-and-art/asset-pipeline.md
requests/main2img/2026-06-15-production-raster-art-batch-1.md
requests/img2main/2026-06-15-production-raster-art-batch-1-ready.md
assets/definitions/production-assets.json
public/assets/generated/manifest.json
```

## 重要制約

- 既存 `assetId` を変更しない
- 既存 `output`, canvas, anchorを変更しない
- `assets/definitions/production-assets.json` は上書きせず、Batch 1の28件を残したまま64件を追加する
- TypeScript/SVGテンプレートはplaceholder/debug用途のまま拡張しない
- 本番画像の制作元は `assets/source/raster/approved-ai/production/batch-2-connected/` に置く
- 最終出力は従来どおり `public/assets/generated/` に取り込む
- overlay/UX/debug assetは今回対象外

## 接続マスク仕様

接続マスクは4bit文字列で、bit順は実装上次の通り。

```text
N,E,S,W
```

例:

- `0000`: どの方向にも接続なし
- `1000`: 北だけ接続
- `0100`: 東だけ接続
- `0010`: 南だけ接続
- `0001`: 西だけ接続
- `1010`: 北と南に接続
- `0101`: 東と西に接続
- `1111`: 四方向すべて接続

画像側はこのbit順と必ず一致させること。

## アート方針

- Stronghold風の固定アイソメトリック2Dプリレンダー
- 日本の戦国時代から江戸初期
- 疑似ドット絵、減色調、低彩度
- 光源は左上、影は右下
- 透明背景PNG
- Batch 1の単体アセットと同じ高さ、厚み、色、接地位置に揃える
- 隣接セル同士で線が途切れず、角やT字・十字の接続が自然に見える
- 柵と城壁は高さ方向の接地感を保つ
- 空堀と水堀は64x32の接地面内で連続した溝として読める

## postprocess指定

接続位置のズレを避けるため、各production定義には原則として次を付ける。

```json
"postprocess": {
  "trim": false,
  "resizeMode": "exact",
  "sharpen": {
    "sigma": 0.35
  }
}
```

城壁・柵で輪郭が弱い場合のみ `sigma` を `0.4` まで上げてよい。canvas内の配置を変えるtrimは使わない。

## 出力先

source PNG:

```text
assets/source/raster/approved-ai/production/batch-2-connected/
```

ready報告:

```text
requests/img2main/2026-06-15-production-raster-art-batch-2-connected-ready.md
```

## production定義の例

```json
{
  "assetId": "building.fence.wood.connected.1010",
  "kind": "building",
  "output": "building-fence-wood-connected-1010.png",
  "source": {
    "type": "raster",
    "file": "assets/source/raster/approved-ai/production/batch-2-connected/building-fence-wood-connected-1010.png"
  },
  "geometry": {
    "footprintWidth": 1,
    "footprintHeight": 1,
    "canvasWidth": 64,
    "canvasHeight": 64,
    "anchorX": 32,
    "anchorY": 48
  },
  "category": "building",
  "postprocess": {
    "trim": false,
    "resizeMode": "exact",
    "sharpen": {
      "sigma": 0.35
    }
  }
}
```

## 対象ファミリー

全ファミリーでmaskは `0000` から `1111` まで16件すべて用意する。

### 柵

```text
assetId prefix: building.fence.wood.connected
output prefix: building-fence-wood-connected
canvas: 64x64
anchor: 32,48
footprint: 1x1
category: building
```

必要ファイル:

```text
building-fence-wood-connected-0000.png
building-fence-wood-connected-0001.png
building-fence-wood-connected-0010.png
building-fence-wood-connected-0011.png
building-fence-wood-connected-0100.png
building-fence-wood-connected-0101.png
building-fence-wood-connected-0110.png
building-fence-wood-connected-0111.png
building-fence-wood-connected-1000.png
building-fence-wood-connected-1001.png
building-fence-wood-connected-1010.png
building-fence-wood-connected-1011.png
building-fence-wood-connected-1100.png
building-fence-wood-connected-1101.png
building-fence-wood-connected-1110.png
building-fence-wood-connected-1111.png
```

### 城壁

```text
assetId prefix: building.wall.plaster.connected
output prefix: building-wall-plaster-connected
canvas: 64x72
anchor: 32,56.16
footprint: 1x1
category: building
```

必要ファイル:

```text
building-wall-plaster-connected-0000.png
building-wall-plaster-connected-0001.png
building-wall-plaster-connected-0010.png
building-wall-plaster-connected-0011.png
building-wall-plaster-connected-0100.png
building-wall-plaster-connected-0101.png
building-wall-plaster-connected-0110.png
building-wall-plaster-connected-0111.png
building-wall-plaster-connected-1000.png
building-wall-plaster-connected-1001.png
building-wall-plaster-connected-1010.png
building-wall-plaster-connected-1011.png
building-wall-plaster-connected-1100.png
building-wall-plaster-connected-1101.png
building-wall-plaster-connected-1110.png
building-wall-plaster-connected-1111.png
```

### 空堀

```text
assetId prefix: building.dry_moat.connected
output prefix: building-dry-moat-connected
canvas: 64x32
anchor: 32,16
footprint: 1x1
category: building
```

必要ファイル:

```text
building-dry-moat-connected-0000.png
building-dry-moat-connected-0001.png
building-dry-moat-connected-0010.png
building-dry-moat-connected-0011.png
building-dry-moat-connected-0100.png
building-dry-moat-connected-0101.png
building-dry-moat-connected-0110.png
building-dry-moat-connected-0111.png
building-dry-moat-connected-1000.png
building-dry-moat-connected-1001.png
building-dry-moat-connected-1010.png
building-dry-moat-connected-1011.png
building-dry-moat-connected-1100.png
building-dry-moat-connected-1101.png
building-dry-moat-connected-1110.png
building-dry-moat-connected-1111.png
```

### 水堀

```text
assetId prefix: building.water_moat.connected
output prefix: building-water-moat-connected
canvas: 64x32
anchor: 32,16
footprint: 1x1
category: building
```

必要ファイル:

```text
building-water-moat-connected-0000.png
building-water-moat-connected-0001.png
building-water-moat-connected-0010.png
building-water-moat-connected-0011.png
building-water-moat-connected-0100.png
building-water-moat-connected-0101.png
building-water-moat-connected-0110.png
building-water-moat-connected-0111.png
building-water-moat-connected-1000.png
building-water-moat-connected-1001.png
building-water-moat-connected-1010.png
building-water-moat-connected-1011.png
building-water-moat-connected-1100.png
building-water-moat-connected-1101.png
building-water-moat-connected-1110.png
building-water-moat-connected-1111.png
```

## 実行コマンド

この環境では必要に応じて `nix-shell --run` を使う。

```text
nix-shell --run 'pnpm run assets:import:raster'
nix-shell --run 'pnpm run assets:validate'
nix-shell --run 'pnpm run validate:generated-assets'
nix-shell --run 'pnpm run typecheck'
nix-shell --run 'pnpm test'
```

## 完了時の報告

`requests/img2main/2026-06-15-production-raster-art-batch-2-connected-ready.md` に次を記載する。

- production化したassetId一覧
- 追加したsource PNG一覧
- `assets/definitions/production-assets.json` に追加した件数
- 実行したコマンドと結果
- 未対応assetIdと理由
- 接続マスク `N,E,S,W` に沿って確認した内容
- 目視確認で気になる点

