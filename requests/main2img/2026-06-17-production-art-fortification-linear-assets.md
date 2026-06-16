# Production Fortification Linear Assets Request

## 目的

城壁、柵、空堀、水堀の描写をproduction品質へ更新する。

現状は接続マスク対応済みだが、sourceが `approved-ai/production/batch-1` と `batch-2-connected` のproduction-candidateで、天守・蔵・市場などのapproved-production系アートに比べて質感、接続感、接地感が弱い。

## 現行実装

対象はすべて論理footprint `1x1` のまま維持する。

接続マスクは4bitで、bit順は実装上次の通り。

```text
N,E,S,W
```

例:

- `0000`: 接続なし
- `1000`: 北
- `0100`: 東
- `0010`: 南
- `0001`: 西
- `1010`: 北南の直線
- `0101`: 東西の直線
- `1111`: 十字接続

ゲーム側は次のassetIdへ自動切り替えする。

```text
building.fence.wood.connected.<mask>
building.wall.plaster.connected.<mask>
building.dry_moat.connected.<mask>
building.water_moat.connected.<mask>
```

## 重要制約

- 既存 `assetId` を変更しない
- 既存 `output` を変更しない
- 既存canvas、anchor、footprintを変更しない
- すべて透明背景PNG
- `postprocess.trim` は `false`
- `resizeMode` は `exact`
- 単体4件と接続64件を同じ見た目のルールで揃える
- runtime manifestへそのまま差し替え可能なsourceとして作る

## 出力先

```text
assets/source/raster/approved-production/fortification-linear/
```

## 対象1: 柵

```text
base assetId: building.fence.wood
connected prefix: building.fence.wood.connected
canvas: 64x64
anchor: 32,48
footprint: 1x1
output base: building-fence-wood.png
output connected: building-fence-wood-connected-<mask>.png
```

要件:

- 木製の簡易柵として読める
- Stronghold風の小スケールRTSで視認できる太さ
- 端、角、T字、十字で支柱と横木が自然につながる
- 門と接続したときに高さ・素材感が破綻しない
- 過剰な黒輪郭を避ける

## 対象2: 城壁

```text
base assetId: building.wall.plaster
connected prefix: building.wall.plaster.connected
canvas: 64x72
anchor: 32,56.16
footprint: 1x1
output base: building-wall-plaster.png
output connected: building-wall-plaster-connected-<mask>.png
```

要件:

- 日本城郭の塀・城壁として読める
- 白漆喰、瓦笠木、石/土台の素材感
- 1セルでも薄すぎず、横に並べた時に城郭線として見える
- 角、端、T字、十字のつながりが自然
- 普通の塀上に兵士や余計な足場を追加しない
- 中国風の城壁にしない

## 対象3: 空堀

```text
base assetId: building.dry_moat
connected prefix: building.dry_moat.connected
canvas: 64x32
anchor: 32,16
footprint: 1x1
output base: building-dry-moat.png
output connected: building-dry-moat-connected-<mask>.png
```

要件:

- 掘り下げた土の溝として読める
- 地形面に自然に馴染む
- 接続時に溝の底・斜面・影が連続する
- 1セル孤立でも「穴」ではなく短い堀として読める
- 橋や土橋と並んでも高さ関係が破綻しない

## 対象4: 水堀

```text
base assetId: building.water_moat
connected prefix: building.water_moat.connected
canvas: 64x32
anchor: 32,16
footprint: 1x1
output base: building-water-moat.png
output connected: building-water-moat-connected-<mask>.png
```

要件:

- 水面と土/石の縁が分かる水堀
- 河川タイルとは区別できる人工的な堀
- 接続時に水面と岸線が途切れない
- 濃すぎる青や高彩度を避ける
- 水面ハイライトは控えめ

## 必要ファイル

単体:

```text
building-fence-wood.png
building-wall-plaster.png
building-dry-moat.png
building-water-moat.png
```

接続:

```text
building-fence-wood-connected-0000.png
...
building-fence-wood-connected-1111.png

building-wall-plaster-connected-0000.png
...
building-wall-plaster-connected-1111.png

building-dry-moat-connected-0000.png
...
building-dry-moat-connected-1111.png

building-water-moat-connected-0000.png
...
building-water-moat-connected-1111.png
```

合計68件。

補助レビュー画像:

```text
contact-sheet.png
connection-preview.png
generation-report.md
asset-map.json
validation-summary.json
```

`connection-preview.png` には、各ファミリーについて直線、角、T字、十字、門との接続例を含める。

## 品質チェック

- canvas寸法が既存runtimeと一致
- alpha channelあり
- transparent corners
- 64x32/64x64/64x72内でanchorに自然に接地
- 同一ファミリー内の高さ、厚み、色、影方向が揃う
- `N,E,S,W` のmask解釈が正しい
- 10セル以上つなげても隙間・段差・途切れが目立たない

## 完了報告

完了したら次を作成する。

```text
requests/img2main/2026-06-17-production-art-fortification-linear-assets-ready.md
```

報告には次を含める。

- production化したassetId一覧
- 出力ファイル一覧
- canvas、anchor、footprint
- mask `N,E,S,W` の確認結果
- 実行した検証
- connection-previewで見つかった懸念点

