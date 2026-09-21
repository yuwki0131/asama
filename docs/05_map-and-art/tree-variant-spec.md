# 樹木バリアント仕様(V-07 樹木コピペ感の根治用)

パトロール全サイクルで最頻出の反復族「樹木コピペ」(V-07 deferred、Astra全面
スイープでも7シナリオ・8件の高)の根治には**新しいシルエットの絵**が必要。
調査の結果(台帳サイクル11参照)、供給経路は既存のpaintover→ai-intakeが唯一
実用水準のため、本書は paintover 制作の受け入れ仕様をまとめる。

## 必要ファイル(assets/source/raster/ 直下に配置)

| 入力ファイル名 | assetId | canvas | anchor | 内容要件 |
|---|---|---|---|---|
| `deco-tree-pine-3__paintover.png` | deco.tree.pine.3 | 64x112 | 32,96 | 赤松。既存2本と**逆方向のS字幹**+雲形パッドの段数を変える(既存: 右曲がり8パッド) |
| `deco-tree-pine-4__paintover.png` | deco.tree.pine.4 | 64x112 | 32,96 | 二又(株立ち)の松。低め・横広がり |
| `deco-tree-cedar-2__paintover.png` | deco.tree.cedar.2 | 64x128 | 32,112 | 杉。既存より若く太い円錐・段差浅め |
| `deco-tree-cedar-3__paintover.png` | deco.tree.cedar.3 | 64x128 | 32,112 | 杉。細身で頂部がわずかに曲がる老木 |
| `deco-tree-broadleaf-2__paintover.png` | deco.tree.broadleaf.2 | 64x112 | 32,96 | 欅系。幹が傾き樹冠が片側に流れる |
| `deco-tree-broadleaf-3__paintover.png` | deco.tree.broadleaf.3 | 64x112 | 32,96 | 横に低く広がる樹冠(田畑際の一本木) |
| `deco-bush-2__paintover.png` | deco.bush.2 | 64x56 | 32,40 | 低木。既存と輪郭・房割りを変える |

## 様式制約(既存承認版との整合)

- **光源は画面左上固定**(TONE-03)。左上面にハイライト、右下に陰。
- **実測トーンターゲット**(不透過平均、既存承認版):
  松 (78,73,53) / 杉 (72,75,53) / 広葉樹 (75,76,52) / 低木 (73,74,50)。
  ±10以内に収めること(LUM系lintの床値も自動検査される)。
- シルエェット差分は**幹の曲がり・枝ぶり・根元の形**で付けること(Astraが
  クローン認識する識別子はこの3点。樹冠の色替えだけでは不可 — VAR-02)。
- 根元は既存同様、草タフト+落葉+小石の接地表現を含める(接地感watch対策)。
- 縁のマットフリンジ・スペックル禁止(NOISE-01/02、intake時に機械検査)。

## 取り込み手順(絵が揃ったら)

1. 上記ファイルを `assets/source/raster/` に配置。
2. `assets/definitions/ai-intake.json` の `entries` に下記を追記:

```json
{ "input": "deco-tree-pine-3__paintover.png", "assetId": "deco.tree.pine.3",
  "output": "deco-tree-pine-3.png", "canvas": {"width":64,"height":112}, "anchor": {"x":32,"y":96} },
{ "input": "deco-tree-pine-4__paintover.png", "assetId": "deco.tree.pine.4",
  "output": "deco-tree-pine-4.png", "canvas": {"width":64,"height":112}, "anchor": {"x":32,"y":96} },
{ "input": "deco-tree-cedar-2__paintover.png", "assetId": "deco.tree.cedar.2",
  "output": "deco-tree-cedar-2.png", "canvas": {"width":64,"height":128}, "anchor": {"x":32,"y":112} },
{ "input": "deco-tree-cedar-3__paintover.png", "assetId": "deco.tree.cedar.3",
  "output": "deco-tree-cedar-3.png", "canvas": {"width":64,"height":128}, "anchor": {"x":32,"y":112} },
{ "input": "deco-tree-broadleaf-2__paintover.png", "assetId": "deco.tree.broadleaf.2",
  "output": "deco-tree-broadleaf-2.png", "canvas": {"width":64,"height":112}, "anchor": {"x":32,"y":96} },
{ "input": "deco-tree-broadleaf-3__paintover.png", "assetId": "deco.tree.broadleaf.3",
  "output": "deco-tree-broadleaf-3.png", "canvas": {"width":64,"height":112}, "anchor": {"x":32,"y":96} },
{ "input": "deco-bush-2__paintover.png", "assetId": "deco.bush.2",
  "output": "deco-bush-2.png", "canvas": {"width":64,"height":56}, "anchor": {"x":32,"y":40} }
```

3. 統括に「樹木paintoverを置いた」と伝える。以後は自律で: intake実行→
   vegetation.json/manifest追記→scatterDecorationsのプール拡張
   (松1..4/杉1..3/広葉1..3/低木1..2、**隣接セル同一アセット禁止の
   アンチクラスタ選択**を同時導入)→VAR-01実効差分・artLint→撮影→
   L2/Astra審査→台帳V-07クローズ。

## 代替案(不採用の記録)

- **Blender既存ビルダーの再登板**: tree-pine/cedar/broadleafのビルダーは
  現存・レンダ可能だが、ファセットの立った低ポリ調で承認済みラスタの
  ペインタリー水準に未達(サイクル11コンタクトシート)。パリティ到達は
  多回イテレーションの大型アート案件で、優先度判断はユーザー預かり。
- **ミラー反転バリアント**: 光源左上固定(TONE-03)に反するため不可。
- **スケールジッタのみ**: 「大きさを変えた同一画像」はAstraが名指しで
  指摘済みの不合格パターン。
