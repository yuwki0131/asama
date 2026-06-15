# アセット生成パイプライン

## 方針

ゲーム本体とは別に、再生成可能なアセットビルド環境を持ちます。

現在のTypeScript/SVG/Sharp生成は、placeholderおよびdebug asset用です。本番アートはBlenderまたは承認済みraster入力から取り込みます。

```text
Blenderモデル・定義JSON
→ Blender Python / Geometry Nodes
→ 固定カメラでレンダリング
→ トリミング・減色・ピクセル化
→ アトラス化
→ メタデータ生成
→ ゲーム配布アセット
```

移行期間中もruntime形式は維持します。

```text
public/assets/generated/*.png
public/assets/generated/manifest.json
```

ゲーム本体は、アセットがprocedural SVG、Blender、rasterのどれに由来するかを認識しません。

## 入力ソース

```text
procedural-svg: placeholder/debug専用
blender: 建物、城郭、樹木、ユニット等のプリレンダー
raster: 手描き、補正済みAI画像、外部制作PNG
```

production定義では、論理footprint、PNG canvas、anchorを分離して扱います。`64x32`は1タイル接地面の基準であり、建物や樹木をそのcanvasへ押し込める意味ではありません。

## コマンド

```text
pnpm run assets:generate:placeholder
pnpm run assets:render:blender
pnpm run assets:import:raster
pnpm run assets:postprocess
pnpm run assets:atlas
pnpm run assets:validate
pnpm run assets:all
```

既存の`generate:assets`、`generate:main2img`、`validate:assets`、`validate:generated-assets`は移行期間中の互換コマンドとして維持します。

## AIの役割

- Blender Pythonスクリプト生成
- Geometry Nodes設計補助
- 建物パラメータ案
- バッチレンダリング
- 画像後処理スクリプト
- 命名・アトラス生成自動化

AIに一品ずつ自由造形させるのではなく、ルールと部品をコード化させます。

## 人間の役割

- アートディレクション
- 建築様式監修
- 縮尺・光源・カメラ固定
- 代表モデルの修正
- 天守等ヒーローアセットの仕上げ

## ディレクトリ例

```text
assets-src/
  blender/
  definitions/
  textures/
  palettes/
assets-build/
  renders/
  pixelized/
assets-dist/
  atlases/
  metadata/
```

## 最小検証セット

- 草地
- 道路
- 石垣
- 塀
- 門
- 櫓
- 町家
- 蔵
- 歩兵1種
- 小型天守1種

## 再現性

- seed固定
- Blenderバージョン固定
- カメラ・ライト固定
- 出力解像度固定
- 同じ入力から同じ出力

## 安全性

AI生成スクリプトは、ファイル削除・外部コマンド・ネットワークアクセスを確認してから実行します。
