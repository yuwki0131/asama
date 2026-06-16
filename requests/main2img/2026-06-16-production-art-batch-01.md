# Production Art Batch 01

## 配置先

このファイルは、リポジトリ内の次のパスへ配置してください。

```text
requests/main2img/2026-06-16-production-art-batch-01.md
```

画像生成エージェントには、次の2ファイルを同時に読ませてください。

```text
requests/main2img/production-art-generation-agent-prompt.md
requests/main2img/2026-06-16-production-art-batch-01.md
```

---

# 目的

本バッチでは、Asamaの本番アート品質を確認するための最小垂直スライスを制作する。

全アセットを量産することが目的ではない。

以下を実際のゲーム画面に配置し、Stronghold風の日本戦国RTSとして成立するかを確認する。

- 草地
- 土道
- 森林クラスタ
- 蔵
- 城門
- 小櫓
- 有人小櫓の透過差分
- 槍足軽
- 工兵
- 補給荷車

代表アセットの品質が承認されるまでは、方向差分や大量バリエーションを増やさないこと。

---

# 共通仕様

## 視点

- 固定アイソメトリック
- 正投影
- Stronghold風の斜め上視点
- カメラ回転なし
- 全アセットで同じ角度
- 光源は画面左上
- 影は画面右下
- 昼間
- 透明背景

## 色調

- 自然な土、木、瓦、石、漆喰、森林色
- 中程度の彩度
- モバイルゲーム風の派手な彩度は禁止
- ネオン色、強い発光は禁止
- 全体を茶色一色にしない
- 小さく表示しても形が読めるコントラストを持たせる

## 画風

- Stronghold風のプリレンダーRTS
- 写実一辺倒ではなくゲーム上の識別性を優先
- 単純SVG、polygon、circle、lineによる仮画像は禁止
- UIアイコン風の極端な簡略化は禁止
- コンセプト画像の一部を切り抜いただけの画像は禁止
- 同一バッチ内で画風、光源、輪郭、素材感を統一する

---

# 出力先

```text
assets/source/raster/approved-production/batch-01/
```

出力構成:

```text
assets/source/raster/approved-production/batch-01/
├── terrain-grass-base.png
├── building-road-dirt.png
├── vegetation-forest-cluster-01.png
├── building-storehouse.png
├── building-gate-wood-closed.png
├── building-yagura-small-normal.png
├── building-yagura-small-occupied-cutaway.png
├── unit-ashigaru-spear-idle-ne.png
├── unit-ashigaru-spear-walk-ne.png
├── unit-engineer-idle-ne.png
├── unit-supply-cart-idle-ne.png
├── contact-sheet.png
├── in-game-composite-preview.png
└── generation-report.md
```

---

# アセット一覧

## 1. terrain.grass.base

| 項目 | 値 |
|---|---|
| assetId | `terrain.grass.base` |
| file | `terrain-grass-base.png` |
| kind | terrain |
| canvas | 64x32 |
| footprint | 1x1 |
| anchor | 32,16 |
| background | transparent |

### 見た目

- 自然な草地
- 地表の明暗は弱め
- 複数枚並べても反復が強く見えない
- 大きな石、花、丸い点を毎タイルに置かない
- 菱形の境界線を濃く描かない
- ぼかさない
- 水彩風にしない

### 不合格

- 緑色の単純グラデーション
- 意味のない小さな点の散布
- 1枚ごとに目立つ模様
- タイル外周の白いフリンジ

---

## 2. building.road

| 項目 | 値 |
|---|---|
| assetId | `building.road` |
| file | `building-road-dirt.png` |
| kind | building |
| canvas | 64x32 |
| footprint | 1x1 |
| anchor | 32,16 |
| background | transparent |

### 見た目

- 日本の城下町・農村の土道
- 土、踏み固め、薄い轍
- 石畳にしすぎない
- 草地上に配置したとき自然
- 後から接続方向差分を作りやすいデザイン
- 単純な二本線だけで道路を表現しない

---

## 3. vegetation.forest.cluster.01

| 項目 | 値 |
|---|---|
| assetId | `vegetation.forest.cluster.01` |
| file | `vegetation-forest-cluster-01.png` |
| kind | vegetation |
| canvas | 192x160 |
| footprint | 2x2 |
| anchor | 96,136 |
| background | transparent |

### 見た目

- 杉、松、雑木を混ぜた3〜5本程度の森林クラスタ
- 樹冠、幹、接地影が明確
- 木が薄い背景模様に見えない
- 全体を半透明にしない
- 木ごとに適度な高さ差
- 地面に丸い点を大量配置しない
- 城、町、農地と並べても視認性を損なわない

---

## 4. building.storehouse

| 項目 | 値 |
|---|---|
| assetId | `building.storehouse` |
| file | `building-storehouse.png` |
| kind | building |
| canvas | 192x160 |
| footprint | 2x2 |
| anchor | 96,136 |
| background | transparent |

### 見た目

- 日本の土蔵または板蔵
- 厚い壁
- 瓦屋根または板葺き
- 一般住宅と明確に区別可能
- 小さく表示しても「蔵」と読める
- 荷物や俵は少量なら可
- 西洋倉庫にしない
- 中国風建築にしない

---

## 5. building.gate.wood.closed

| 項目 | 値 |
|---|---|
| assetId | `building.gate.wood.closed` |
| file | `building-gate-wood-closed.png` |
| kind | building |
| canvas | 192x176 |
| footprint | 2x1 |
| anchor | 96,152 |
| background | transparent |

### 見た目

- 日本城郭の木造城門
- 門扉が閉じた状態
- 城壁、塀、石垣と接続できる
- 豪華な楼門にしすぎない
- 破風、瓦屋根、木部を抑制的に表現
- 中国風楼閣にしない
- 西洋城門にしない

---

## 6. building.yagura.small.normal

| 項目 | 値 |
|---|---|
| assetId | `building.yagura.small.normal` |
| file | `building-yagura-small-normal.png` |
| kind | building |
| canvas | 224x208 |
| footprint | 2x2 |
| anchor | 112,184 |
| background | transparent |

### 見た目

- 実在の日本城郭の小櫓に近い
- 簡素で実用的
- 小天守化しない
- 白漆喰、下見板、瓦屋根
- 外部足場なし
- 外部バルコニーなし
- 露台なし
- 普通の塀上に兵士を置かない
- 無人状態なので完全に不透明
- 門や塀と組み合わせても不自然にならない

---

## 7. building.yagura.small.occupied-cutaway

| 項目 | 値 |
|---|---|
| assetId | `building.yagura.small.occupied-cutaway` |
| file | `building-yagura-small-occupied-cutaway.png` |
| kind | building |
| canvas | 224x208 |
| footprint | 2x2 |
| anchor | 112,184 |
| background | transparent |

### 必須条件

`building.yagura.small.normal`と、外形、接地位置、屋根、壁、影を一致させる。

別建物として再設計しない。

### 透過表現

- 内部に兵士がいる場合だけ使う
- 手前側の屋根・壁を半透明化
- 建物の構造は変更しない
- 外部足場を追加しない
- バルコニーを追加しない
- 壁を完全に消去しない
- 内部は単層
- 内部に2〜3人の日本戦国期の守備兵を配置
- 兵士は櫓の内部にいる
- 屋外の足場に立たせない
- 断面模型のような大きな空洞を作らない

---

## 8. unit.ashigaru.spear.idle.ne

| 項目 | 値 |
|---|---|
| assetId | `unit.ashigaru.spear.idle.ne` |
| file | `unit-ashigaru-spear-idle-ne.png` |
| kind | unit |
| canvas | 64x80 |
| footprint | 1x1 |
| anchor | 32,68 |
| direction | NE |
| state | idle |
| background | transparent |

### 見た目

- 日本戦国期の槍足軽
- 陣笠
- 軽装具足
- 指物
- 長槍
- 少し大きめでキャラクタライズ
- 小さく表示しても兵種が読める
- 中国武将風にしない
- 全身を収める
- 槍をキャンバス外へ切らない
- 接地影あり

---

## 9. unit.ashigaru.spear.walk.ne

| 項目 | 値 |
|---|---|
| assetId | `unit.ashigaru.spear.walk.ne` |
| file | `unit-ashigaru-spear-walk-ne.png` |
| kind | unit |
| canvas | 64x80 |
| footprint | 1x1 |
| anchor | 32,68 |
| direction | NE |
| state | walk |
| background | transparent |

### 必須条件

`idle.ne`と同一人物・同一装備・同一縮尺にする。

- 歩行中と分かる姿勢
- 槍の長さと装備を変更しない
- 顔、体型、指物を変更しない
- カメラ角度と光源を変更しない

本バッチでは歩行アニメーションの代表1フレームとして扱う。

---

## 10. unit.engineer.idle.ne

| 項目 | 値 |
|---|---|
| assetId | `unit.engineer.idle.ne` |
| file | `unit-engineer-idle-ne.png` |
| kind | unit |
| canvas | 64x80 |
| footprint | 1x1 |
| anchor | 32,68 |
| direction | NE |
| state | idle |
| background | transparent |

### 見た目

- 日本戦国期の工兵・普請役
- 足軽系の装備
- 堀埋めや梯子設置に使う道具
- 槍足軽と一目で区別できる
- ファンタジー鉱夫にしない
- 近代作業員にしない
- 中国風兵士にしない

---

## 11. unit.supply-cart.idle.ne

| 項目 | 値 |
|---|---|
| assetId | `unit.supply-cart.idle.ne` |
| file | `unit-supply-cart-idle-ne.png` |
| kind | unit |
| canvas | 112x88 |
| footprint | 1x1 |
| anchor | 56,72 |
| direction | NE |
| state | idle |
| background | transparent |

### 見た目

- 日本中世〜近世初期の荷車
- 米俵、木箱、兵糧を積む
- 西洋馬車にしない
- 幌馬車にしない
- 必要なら人力または小型の牛馬利用
- 兵糧輸送ユニットとして一目で読める
- 画面上では人物より少し大きい
- footprintはゲーム仕様上1x1だが、画像は自然な大きさでよい

---

# 所属色

本バッチでは、味方差分を基準にする。

- 基調色: 青または紺
- 所属色は指物、紐、布の一部に限定
- 全身を青一色にしない
- 建物自体を青く染めない

敵軍はゲーム側のtintではなく、将来的には赤系指物差分を作る前提とする。

---

# contact-sheet.png

すべての単体アセットを、以下の条件で1枚に並べる。

- 明るい中立背景
- 暗い中立背景
- assetId表示
- canvas枠表示
- anchor位置表示
- footprintサイズ表示
- 1x表示
- 拡大表示

目的は、透明背景、余白、接地位置、画風統一を確認すること。

---

# in-game-composite-preview.png

以下を1枚の疑似ゲーム画面として合成する。

- 草地を複数枚
- 土道
- 森林クラスタ
- 蔵
- 城門
- normal櫓
- occupied-cutaway櫓
- 槍足軽
- 工兵
- 補給荷車

条件:

- UIは不要
- 1x表示を含む
- アイソメ配置
- 味方ユニットが城内防戦中に見える配置
- 普通の塀上に兵士を置かない
- 有人櫓だけ透過
- 地形をぼかさない
- anchorずれを確認できる

---

# generation-report.md

以下の形式で作成する。

```md
# Production Art Batch 01 Generation Report

## Generated Assets

| assetId | file | canvas | anchor | footprint | result |
|---|---|---:|---:|---:|---|

## Shared Style

- camera:
- projection:
- light direction:
- shadow direction:
- palette:
- outline:
- unit scale:

## Validation

- [ ] transparent background
- [ ] exact canvas size
- [ ] anchor checked
- [ ] no white fringe
- [ ] consistent lighting
- [ ] Japanese historical design
- [ ] no Chinese-style soldiers or architecture
- [ ] readable at 1x
- [ ] contact sheet generated
- [ ] composite preview generated

## Remaining Issues

- ...
```

---

# 受け入れ条件

以下をすべて満たすこと。

- [ ] 単純SVGプレースホルダーに見えない
- [ ] Stronghold風のプリレンダーRTSに見える
- [ ] 全アセットのカメラ角度が一致
- [ ] 全アセットの光源方向が一致
- [ ] 地形がぼやけていない
- [ ] 森林が薄い背景模様に見えない
- [ ] 足軽が日本戦国期の兵士に見える
- [ ] 中国武将風の甲冑がない
- [ ] 蔵が一般住宅と区別できる
- [ ] 門が日本城郭の城門に見える
- [ ] 櫓が小天守化していない
- [ ] 櫓に外部足場がない
- [ ] normal櫓は不透明
- [ ] occupied-cutaway櫓だけが透過
- [ ] 透過櫓の構造がnormal櫓と一致
- [ ] 普通の塀上に兵士がいない
- [ ] anchorずれがない
- [ ] 白いフリンジがない
- [ ] 1x表示で兵種と建物を判別できる

---

# 作業停止条件

次の場合は、残りを量産せず作業を止めて報告する。

- 透明背景を安定して生成できない
- 同一人物のidleとwalkを維持できない
- normal櫓とoccupied-cutaway櫓の外形を一致できない
- 日本の足軽ではなく中国武将風になる
- 指定canvasへ収めると識別性が失われる
- contact sheetで画風の不統一が明確
- composite previewでanchorずれが目立つ

品質が不十分な場合は、生成枚数を増やさず、代表1点の修正を優先する。
