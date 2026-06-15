# Production Art Pipeline Migration Request for Codex

## 配置先

このファイルは、リポジトリ内の次のパスへ配置してください。

```text
requests/main2img/2026-06-15-production-art-pipeline-migration.md
```

Codexへ作業を依頼するときは、このファイルのパスを明示してください。

例:

```text
AGENTS.mdと以下の依頼書を読んで実装してください。

requests/main2img/2026-06-15-production-art-pipeline-migration.md
```

---

## 目的

現在のTypeScript + SVG + Sharp方式を、プレースホルダー生成専用として明確化し、本番アートとしてBlenderおよび承認済みラスター画像を利用できるパイプラインへ拡張する。

既存の以下の仕組みは維持する。

- `assetId`
- PNG出力
- canvasサイズ
- anchor
- runtime manifest
- validation
- 再生成性
- ゲーム本体との互換性

本タスクは、既存のアセット基盤を破棄するものではない。

問題は、プレースホルダー生成方式と本番アート制作方式が同一視されていることである。

---

## 作業前に読む文書

Codexは実装前に、必ず以下を読むこと。

```text
AGENTS.md
docs/README.md
docs/05_map-and-art/art-direction.md
docs/05_map-and-art/asset-pipeline.md
docs/05_map-and-art/map-specification.md
docs/10_development/mvp-scope.md
docs/10_development/unresolved-issues.md
```

本依頼書と既存仕様が矛盾する場合は、`docs/README.md`に定義された文書優先順位に従うこと。

未確定事項を独自判断で恒久仕様化してはならない。

暫定判断が必要な場合は、次を行う。

1. データ駆動で変更可能にする
2. `docs/10_development/unresolved-issues.md`へ追記する
3. 完了報告に明記する

---

## 現在の問題

現在は、概ね次の方式でアセットを生成している。

```text
JSON定義
→ TypeScriptでSVG生成
→ SharpでPNG化
→ public/assets/generated/
→ manifest生成
→ validation
```

この方式は、以下には適している。

- 厳密なcanvasサイズ
- anchor
- assetId
- 透明背景
- 再生成性
- manifest整合性
- 仮アセット
- デバッグ表示

一方で、以下の本番品質を実現する方式としては不十分である。

- 日本城郭らしい立体構造
- 石、木、瓦、漆喰の素材感
- Stronghold風のプリレンダー感
- 日本戦国時代から江戸初期の兵士表現
- 樹木と森林の密度
- 地形の鮮明さ
- ユニットのキャラクタライズ
- 一貫したライティング
- 複数方向アニメーション

SVGテンプレートを複雑化し続けて、本番アートへ近づける方針は採用しない。

---

## 重要方針

### TypeScript + SVGの用途

現在のSVG生成コードは、以下に限定する。

- placeholder
- debug asset
- selection marker
- range overlay
- building footprint
- honmaru marker
- movement marker
- collision visualization
- temporary terrain
- temporary building
- temporary unit marker

以下の本番アートをSVGテンプレートだけで制作してはならない。

- 天守
- 櫓
- 門
- 石垣
- 塀
- 蔵
- 市場
- 兵舎
- 武家屋敷
- 町家
- 樹木
- 森林
- 足軽
- 侍
- 騎兵
- 工兵
- 補給荷車

### 本番アートの入力元

本番アートは、以下のいずれかを入力元とする。

```text
blender
raster
```

`raster`には以下を含む。

- 手描き画像
- 人間が修正した画像
- 承認済みAI生成画像
- 外部ツールで制作したPNG

ゲーム本体は、制作元を認識してはならない。

ゲーム本体が利用する形式は、従来どおり以下とする。

```text
PNGまたはPNG atlas
runtime manifest
```

---

## 必須アーキテクチャ

アセットソースを次の3種類へ分離する。

```ts
type AssetSource =
  | {
      type: "procedural-svg";
      pattern: string;
    }
  | {
      type: "blender";
      scene: string;
      collection?: string;
      renderSpec: string;
    }
  | {
      type: "raster";
      file: string;
    };
```

### procedural-svg

プレースホルダーおよびデバッグ用途。

### blender

建物、城郭、樹木、ユニット、荷車等のプリレンダー用途。

### raster

手描き、補正済みAI画像、外部制作画像等の入力用途。

---

## geometry定義

論理占有範囲と画像サイズを分離する。

```ts
interface AssetGeometry {
  footprintWidth: number;
  footprintHeight: number;

  canvasWidth: number;
  canvasHeight: number;

  anchorX: number;
  anchorY: number;
}
```

### footprint

ゲーム上で占有するグリッド範囲。

### canvas

出力PNGの実ピクセルサイズ。

### anchor

ゲーム内座標と画像上の接地点を対応させる位置。

`64x32`はアイソメトリック1タイルの接地面基準であり、建物画像そのものの最大サイズではない。

建物や樹木を64x32の画像内へ押し込めてはならない。

例:

```json
{
  "assetId": "building.yagura.small",
  "kind": "building",
  "source": {
    "type": "blender",
    "scene": "assets/source/blender/scenes/yagura-small.blend",
    "collection": "YaguraSmall",
    "renderSpec": "iso-building-default"
  },
  "geometry": {
    "footprintWidth": 2,
    "footprintHeight": 2,
    "canvasWidth": 192,
    "canvasHeight": 176,
    "anchorX": 96,
    "anchorY": 156
  },
  "variants": [
    "normal",
    "occupied-cutaway"
  ]
}
```

---

## 推奨ディレクトリ構成

既存構成との互換性を優先しつつ、次に相当する構造を用意する。

```text
assets/
├── definitions/
│   ├── buildings.json
│   ├── units.json
│   ├── terrain.json
│   └── effects.json
├── source/
│   ├── procedural-svg/
│   ├── blender/
│   │   ├── scenes/
│   │   ├── models/
│   │   ├── materials/
│   │   ├── rigs/
│   │   ├── scripts/
│   │   └── render-specs/
│   ├── raster/
│   │   ├── hand-authored/
│   │   ├── approved-ai/
│   │   └── textures/
│   └── references/
├── intermediate/
│   ├── raw-renders/
│   ├── trimmed/
│   └── processed/
└── generated/
    ├── sprites/
    ├── atlases/
    └── manifest.json
```

実際の最終出力先は、既存仕様に合わせて次を維持してよい。

```text
public/assets/generated/
public/assets/generated/manifest.json
```

Blenderファイル、生レンダー、編集用画像を`public/`へ配置してはならない。

---

## Phase 1: プレースホルダー方式の明確化

次を実施する。

- 現在のSVG生成コードをplaceholder generatorとして明確化する
- 型名、関数名、コメント、READMEをplaceholder用途へ整理する
- 既存runtime互換性を維持する
- 既存assetIdを無断変更しない
- 本番品質改善のためにSVGテンプレートを追加しない
- 既存の仮画像生成を壊さない

`packages/asset-tools/src/templates.ts`は、プレースホルダー用コードとして維持する。

必要であれば、より明確なファイル名へ段階的に移行してよい。

例:

```text
templates.ts
→ placeholder-templates.ts
```

ただし一度の変更で大規模な破壊的リネームを行わない。

---

## Phase 2: raster import pipeline

承認済みPNGを入力として取り込めるようにする。

最低限、以下の処理を実装する。

```text
input PNG
→ metadata read
→ trim
→ resize
→ canvas placement
→ sharpen
→ alpha validation
→ PNG output
→ manifest output
```

必要な設定例:

```ts
interface RasterImportSpec {
  sourceFile: string;
  outputFile: string;
  canvasWidth: number;
  canvasHeight: number;
  anchorX: number;
  anchorY: number;
  trim: boolean;
  resizeMode: "contain" | "cover" | "exact";
  sharpen?: {
    sigma: number;
  };
}
```

後処理パラメータは、最低限次の種別ごとに分けられるようにする。

- terrain
- building
- unit
- vegetation
- effect

---

## Phase 3: Blender adapter

Blenderをheadless実行できるアダプターを追加する。

最低限、以下を指定可能にする。

- `.blend`ファイル
- collection
- camera
- output directory
- resolution
- transparent background
- frame
- direction
- animation
- render seed

例:

```text
blender --background scene.blend   --python render_asset.py   --   --collection YaguraSmall   --camera IsoCameraNE   --output intermediate/raw-renders/yagura-small.png
```

Blenderがローカル環境に存在しない場合、CIやテストでは次まででよい。

- 入力定義のvalidation
- コマンド引数の組み立て
- パス解決
- mock実行
- fixtureによる後処理テスト

Blender実レンダーを通常のunit test必須条件にしない。

---

## Phase 4: 共通後処理

Blenderとraster入力は、共通の後処理を通す。

```text
raw render / raster source
→ trim
→ resize
→ canvas placement
→ sharpen
→ color adjustment
→ alpha check
→ output PNG
→ atlas
→ manifest
```

注意:

- 強すぎるsharpenを避ける
- alpha premultiplicationを確認する
- atlas bleedを防ぐ
- paddingを設定可能にする
- anchorの接地点を維持する

---

## 必須コマンド

以下に相当するコマンドを用意する。

```text
pnpm run assets:generate:placeholder
pnpm run assets:render:blender
pnpm run assets:import:raster
pnpm run assets:postprocess
pnpm run assets:atlas
pnpm run assets:validate
pnpm run assets:all
```

既存コマンドが利用されている場合は、移行期間中のaliasを用意する。

例:

```text
generate:main2img
generate:assets
validate:generated-assets
validate:assets
```

既存利用者を一度に壊さない。

---

## ビジュアル要件

### 全体

- Stronghold風の固定アイソメトリックRTS
- 日本の戦国時代から江戸初期
- PC向けクラシックRTS
- 写実一辺倒ではなく視認性を優先
- 地形、建物、ユニットを明確に区別する
- ぼかしすぎない
- 過剰な色ノイズを避ける

### 櫓

- 実在の日本城郭の櫓に近い簡素な構造
- 小天守化しない
- 中国風楼閣にしない
- 外部足場を追加しない
- バルコニーを追加しない
- 露台を追加しない
- 普通の塀上へ兵士を配置しない

櫓は通常時、不透明表示とする。

櫓内部にユニットが存在する場合のみ、`occupied-cutaway`を使用する。

`occupied-cutaway`では構造を改変しない。

- 手前側の屋根・壁を半透明化する
- 内部の単層空間を表示する
- 内部ユニットを表示する
- 新しい足場や開口部を作らない

推奨出力:

```text
building-yagura-small-normal.png
building-yagura-small-occupied-cutaway.png
```

### ユニット

兵士は日本戦国時代から江戸初期の意匠を使用する。

使用する要素:

- 陣笠
- 兜
- 桶側胴
- 具足
- 指物
- 槍
- 刀
- 弓
- 火縄銃
- 工兵用具

禁止:

- 中国戦国時代風の甲冑
- 中国武将風の兜
- 中国風長柄武器
- 中国風旗
- 西洋騎士風甲冑
- ファンタジー武将風の過剰装飾

視認性のため、次は現実より少し誇張してよい。

- 頭部
- 陣笠
- 槍
- 弓
- 火縄銃
- 指物
- 馬

所属色は全身を単色にせず、指物や装備の一部で表現する。

### 地形

地形は次の3層で構成する。

```text
base tile
transition tile
decoration decal
```

禁止:

- 意味のない丸や点の散布
- 均一な反復ノイズ
- 過剰なぼかし
- タイル境界が判別不能になる表現
- 地形種別を見分けられない近似色

### 樹木・森林

最低限、以下を想定する。

- 杉
- 松
- 雑木
- 低木
- 枯れ木

単体木だけで森林を構成しない。

以下のクラスタも想定する。

- 単体
- 3本
- 5本
- 林縁
- 密集森林

木は次を持つ。

- 明確な樹冠
- 幹
- 接地影
- 立体感
- 種類ごとの差

---

## PixiJS表示品質

元PNGだけでなく、PixiJS表示時のぼやけも確認する。

確認項目:

- renderer resolution
- devicePixelRatio
- canvas内部解像度
- CSS表示サイズ
- 小数ピクセル座標
- camera zoom
- texture scaleMode
- atlas padding
- texture bleed

推奨:

- 1倍表示を主要品質基準にする
- スプライト位置をpixel snapする
- 固定ズーム段階を使う
- 中途半端な縮小率を避ける
- 画像を最終表示サイズに近い解像度で生成する

固定ズーム例:

```text
0.5x
1x
2x
```

Stronghold風プリレンダー画像へ、無条件に`nearest`を設定しない。

---

## Vertical Slice

全アセットを一度に本番化してはならない。

最初に以下だけを、本番品質候補として通せる状態にする。

### 地形

```text
terrain.grass
terrain.road.dirt
terrain.rice-field
terrain.water-moat
terrain.forest.cluster
```

### 建築

```text
building.stone-wall
building.plaster-wall
building.gate.wood
building.yagura.small.normal
building.yagura.small.occupied-cutaway
building.storehouse
building.town-house
```

### ユニット

```text
unit.ashigaru.spear
unit.engineer
unit.supply-cart
```

### アニメーション

```text
idle
walk
attack
work
```

本番モデルが存在しない場合は、以下を実装する。

- 明確な入力スロット
- fixture
- importer
- validator
- manifest生成
- ゲーム表示確認

SVGを本番アート代替として追加してはならない。

---

## テスト要件

最低限、以下をVitest等でテストする。

- source type validation
- procedural SVGの後方互換性
- raster import
- 不正な入力パス
- canvasサイズ
- anchor範囲
- footprint validation
- 透明背景
- manifest生成
- 同じ入力から同じ出力になること
- Blenderコマンド引数生成
- postprocess
- atlas padding
- unknown source type rejection

---

## validation要件

最低限、以下を実行する。

```text
pnpm run typecheck
pnpm test
pnpm run assets:generate:placeholder
pnpm run assets:validate
```

新規コマンドも、ローカル環境で可能な範囲まで実行する。

Blenderがない場合は、その事実と未実行範囲を完了報告に書く。

---

## 完了条件

### パイプライン

- [ ] procedural SVGがplaceholder用途として明確化されている
- [ ] blender sourceを定義できる
- [ ] raster sourceを定義できる
- [ ] 共通postprocessが存在する
- [ ] runtime manifest形式が維持されている
- [ ] assetIdが維持されている
- [ ] canvasとanchorが検証される
- [ ] footprintとcanvasが分離されている
- [ ] ゲーム本体がsource typeへ依存していない

### 品質

- [ ] 地形がぼやけていない
- [ ] 地表に意味のない点がない
- [ ] 樹木に密度と立体感がある
- [ ] 足軽が日本戦国期の意匠である
- [ ] 中国風武将デザインがない
- [ ] 普通の塀上に兵士がいない
- [ ] 櫓に外部足場がない
- [ ] 櫓は小天守化していない
- [ ] 有人櫓のみ透過表示される
- [ ] 無人櫓は不透明表示される
- [ ] 城内防衛ユニットが戦闘・防戦状態に見える
- [ ] anchorずれや浮遊感がない
- [ ] 1倍ズームで鮮明に表示される

---

## 禁止事項

Codexは次を行ってはならない。

- `templates.ts`へ本番アート用SVGを追加し続ける
- placeholderをproduction artとして扱う
- assetIdを無断変更する
- canvasサイズを無断変更する
- anchorを無断変更する
- footprintとcanvasを同一視する
- runtimeへBlender固有処理を入れる
- validationを迂回する
- 生成済みPNGだけを直接編集する
- 元データを残さず完成扱いにする
- 全アセットを一括置換する
- 参考画像の見た目だけを真似し、仕様を無視する
- 未確定仕様を隠れた定数として実装する

---

## 完了報告

完了時は、次のパスへMarkdownを作成する。

```text
requests/img2main/2026-06-15-production-art-pipeline-migration-ready.md
```

以下を記載する。

- 変更ファイル
- 追加した型
- 追加したコマンド
- 既存コマンドとの互換性
- asset manifestの変更有無
- 実行したテスト
- validation結果
- Blenderが必要な未実行処理
- raster importの使用方法
- 本番アートへ置換済みのassetId
- placeholderのまま残るassetId
- 未解決事項
- ゲーム内スクリーンショットのパス

---

## Codexへの実行指示

本依頼を実行するときは、次の方針で進める。

1. 既存実装を調査する
2. 現在のasset schemaとmanifestを把握する
3. 破壊的変更を避けた移行案を決める
4. 小さな単位で実装する
5. テストを追加する
6. validationを実行する
7. 完了報告を作る

大規模な一括書き換えより、既存互換性を保った段階的移行を優先する。
