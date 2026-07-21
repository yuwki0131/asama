# ハイブリッド 2.5D レンダラー試作

> Three.js による 3D 地形・城郭ジオメトリと、既存 2D スプライトの共存を評価する
> **実験** レイヤーの設計・実装記録。プロダクション移行の意思決定材料。

## 1. 目的

日本城郭の以下のような形状を、16 方向タイルマスクに頼らず表現できるかを検証する:

- 曲がった曲輪縁
- 傾斜する石垣・多方向の折れ
- 標高段差(平山城の高低差)
- 曲がった堀
- 直交しない壁ライン

同時に、既存のシミュレーション/コンテンツ定義/React UI/ PixiJS レンダラーは **一切壊さない**。

## 2. アーキ概要

```
apps/game/src/client/
├── main.tsx                    -- rendererMode を見て App / App3d を切替
├── rendererMode.ts             -- ?renderer=2d|3d 解析
├── ui/App.tsx                  -- 既存 (PixiJS) - 変更なし
├── ui/App3d.tsx                -- 新規: 3D 試作用の最小 App シェル
├── renderer/                   -- 既存 PixiJS 一式 - 変更なし
└── renderer3d/                 -- 新規: Three.js 試作
    ├── ThreeGameCanvas.tsx     -- React ラッパ (canvas mount / RAF / 入力)
    ├── ThreeScene.ts           -- Scene/Renderer/Camera 構成
    ├── camera.ts               -- 固定オブリーク直交カメラ + pan/zoom
    ├── coord.ts                -- cellToThreeWorld / threeWorldToCell 等
    ├── terrainMesh.ts          -- 標高付き地形メッシュ生成
    ├── features.ts             -- LinearFeature / AreaFeature 型定義
    ├── featureMesh.ts          -- 石垣 / 白壁 / 木柵 / 土塁 / 堀 のプロシージャル生成
    ├── billboards.ts           -- 建物/ユニットスプライトを3Dシーンにマウント
    ├── picker.ts               -- ポインタ raycast → cell
    ├── assets.ts               -- manifest.json 経由で Three.Texture ロード
    ├── trialFeatures.ts        -- 試作シナリオ用の手書き feature 定義
    └── ThreeScene.ts           -- 上記の統合
```

- **既存 PixiJS レンダラーは一切書き換えていない**。
- URL パラメータ `?renderer=3d` を付けたときだけ `App3d` が起動する (`main.tsx`)。
- `App3d` は最小限の HUD しか持たず、ゲームプレイ用ボタンは省略。
- 試作シナリオ (`hybrid-renderer-trial`) は 3D モード時のみ選択肢に現れる (`ScenarioSelectScreen.tsx`)。

## 3. 座標マッピング

シミュレーションは整数セル座標 `{x, y}` (東 = +x, 南 = +y) を保つ。3D 側は次の写像で World 空間に変換する:

```ts
worldX = cell.x * CELL_SIZE           // 東
worldZ = cell.y * CELL_SIZE           // 南 (Three.js Z 軸)
worldY = elevation * ELEVATION_HEIGHT // 上方向
```

- `CELL_SIZE = 1` (Three world unit ≈ 1 cell)
- `ELEVATION_HEIGHT = 0.3` (1 段差 = 0.3 world units)
- 2D レンダラーの 24 px/段差と視覚的重みを揃えた
- ビルボード建物は footprint の中心に立つ (`buildingAnchorToThreeWorld`)

**Three.js のベクトル型はシミュレーション state に決して混入させない**。逆方向 (world → cell) も専用ヘルパ `threeWorldToCell` `threeWorldToCellFloat` を使う。

ユニットテスト: `renderer3d/coord.test.ts` が写像の可逆性・整数丸め・建物 anchor の中心配置を確認。

## 4. 追加データモデル (試作限定)

3D レイヤーのみで使う手続き的ジオメトリ用の型を導入した。**シミュレーション state には入れない**。

### 4.1 `LinearFeature`

```ts
interface LinearFeature {
  id: string;
  kind: "stone_wall" | "plaster_wall" | "wood_fence" | "earthwork" | "dry_moat" | "water_moat";
  path: readonly CellCoord[]; // ≥2 点のポリライン
  width: number;              // 直交方向の幅 (cell 単位)
  height: number;             // 縦方向の高さ (elevation 単位)
  baseElevation?: number;     // 立ち上がる基準面
  materialId?: string;        // 将来拡張 (未使用)
}
```

### 4.2 `AreaFeature`

```ts
interface AreaFeature {
  id: string;
  kind: "bailey" | "courtyard" | "raised_ground" | "water" | "slope_area";
  polygon: readonly CellCoord[]; // CCW ポリゴン
  elevation: number;
  materialId?: string;
}
```

- `features.ts` に `validateLinearPath` / `validateAreaPolygon` があり、退化ケース(1点以下、重複頂点)を拒否する。ユニットテスト付き。

## 5. 手続き生成の実装 (`featureMesh.ts`)

各種類ごとに専用のジオメトリビルダを持つ:

| kind | 実装 | 見た目 |
|---|---|---|
| `stone_wall` (石垣) | `buildRibbon` (台形断面、外側にバッター) | 反りある傾斜面 + 上端平坦 |
| `plaster_wall` (白壁) | `buildRibbon` (幅細・ほぼ垂直) | 白壁 body + 黒瓦上端 |
| `wood_fence` (木柵) | 上端リボン + 1cell間隔で立方体柱 | 柱と横木 |
| `earthwork` (土塁) | `buildRibbon` (幅広ベース) | なだらかな土手 |
| `dry_moat` (空堀) | `buildTrenchGeometry` | 掘り込み台形断面 |
| `water_moat` (水堀) | 空堀 + `buildWaterSurfaceGeometry` (半透明) | 水面ジオメトリ追加 |

- 全てポリラインから **1つの `BufferGeometry`** を組み立てる。フェンスだけ柱と横木で 2 メッシュ。
- **stone 1個ずつのモデル化はしない**。バッター(下広・上狭)を持たせるだけで石垣らしく読める。
- 折れ点でセグメント間の頂点を共有するので継ぎ目は自然。ただし急角度では法線が不連続になる → 実運用時はコーナー丸めが要検討。

## 6. 地形メッシュ (`terrainMesh.ts`)

- WorldSnapshot の `map.cells` を走査し、セルごとに1つの平坦四角ポリゴンを配置。
- 標高差がある近傍セル間には東/南の垂直崖ポリゴンを追加(北・西は隣接セルが同処理するので二重にならない)。
- 頂点カラーで grass / cliff / water を色分け。テクスチャは使わない (トライアル)。
- Snapshot 到着時に `rebuild(snapshot)` 全再構築。試作サイズ (128×128) では十分。実プロダクションはチャンク化が必要。

## 7. カメラ (`camera.ts`)

- `OrthographicCamera` 固定。回転不可、パン + 段階ズームのみ。
- カメラ方向は `(+1, +1.4, +1)` のオブリーク見下ろし。既存2Dアイソメの読みに近づけている。
- ZOOM 段階: `[40, 30, 24, 18, 14, 10, 7, 5]` (world units of viewport height)。
- `panByScreen(dxPx, dyPx, viewportHeight)` で地上面の射影に沿ってパン。
- ホイールで段階ズーム。マウスホイールの規約は 2D と同じ (上=ズームイン)。

## 8. ビルボード (`billboards.ts`)

- **固定カメラなので、毎フレームカメラを向く必要がない**。1つの固定 quaternion を全ビルボードで共有 (`BILLBOARD_QUATERNION`)。
- `MeshBasicMaterial` + `alphaTest: 0.5` + `depthWrite: true` + `depthTest: true`。
- ジオメトリはアンカー (`asset.anchor.y`) が地上接触点に来るよう Y シフト。
- **手続き ジオメトリで再現する建物 (壁・柵・堀・道・橋) のビルボードはスキップ** (`PROCEDURAL_BUILDING_TYPES`)。ビルボードとメッシュの二重描画を避ける。
- ユニット `selected` 時は Basic マテリアルを clone してカラーを黄色寄せ。

## 9. ピッキング (`picker.ts`)

- `Raycaster` + 標高ごとの水平面インターセクト。
- 高い標高から順に試し、そのセルが対応する elevation を持てば採用。
- fallback: y=0 平面。
- テスト無し(WebGL 依存でユニットテスト難)。手動確認 QA プリセットで代替。

## 10. 試作シナリオ

`packages/content/src/hybrid-renderer-trial.ts` にシナリオ定義を追加した。

- 128×128 の標準マップだが、興味深いジオメトリは **cells 42..62, 46..60 の 20×15 窓** に集約。
- 標高: `patches: [rect(46,47, 12x8) → level 1, skin=ishigaki]`
- スロープ: `slopes: [{position:(52,57), toward:N, length:2}]`
- 建物: 壁9・門1・柵5・空堀4・水堀4・橋1・矢倉1・蔵1
- ユニット: プレイヤー3体・敵1体
- シナリオ配列 `scenarios` には入れず、`trialScenarios` として分離。`allScenarios = [...scenarios, ...trialScenarios]` を worker が参照。

3D レイヤーは追加で `renderer3d/trialFeatures.ts` から手書きの `LinearFeature[]` `AreaFeature[]` を読んでプロシージャル形状をオーバーレイする。**シミュレーションはこれらを知らない**。

## 11. レンダラー切替

```
http://127.0.0.1:5173/                        → 既存 2D
http://127.0.0.1:5173/?renderer=3d            → 3D 試作 (Scenario 選択 → trial 込み)
http://127.0.0.1:5173/?renderer=3d&scenario=hybrid-renderer-trial → 3D 直接起動
```

- 既定値は `2d`。既存の起動フロー・ E2E テスト・ CI に影響なし。
- 3D モードでは `App3d` が起動し、React ツリー全体が別実装になる。DEV `__asamaTest` ブリッジは 3D 側でも同じ API を提供 (テスト書き換え不要)。

## 12. 依存

- `three@0.171.0` (production)
- `@types/three@0.171.0` (dev)
- 追加バンドルサイズ: `+~500KB` gzip 前 (メインチャンクに含まれる)。試作段階なので code-split 未実施。

## 13. 既知の制限・問題

1. **石垣リボンの折れ角処理**: 鋭角では法線が不連続。丸め or 三角形帯挿入が要検討。
2. **バイビュー水面**: `MeshStandardMaterial` を半透明化しただけ。反射・波・シェーダなし。
3. **地形メッシュを毎スナップショット再構築**: 128×128 全再ビルドは正常時 <5ms だが、terrainRevision を見て差分更新するのが望ましい。
4. **ビルボードのアンカー計算**: 見た目良好だが、大きな footprint (町区画 6×6) は未検証。
5. **選択リング**: 単色黄色プレーン。tint 適用しか用意しておらず、既存の光る効果は未再現。
6. **ユニットアニメ**: idle スプライトの1フレーム目のみ使用。sprite-sheet アニメは未対応。
7. **ゲート開閉状態**: `gateState` を反映しない。閉じ差分アセットへの assetId 差し替えは実装内。
8. **ピッキング精度**: 単純な水平面インターセクト。斜面上のセルは坂の外扱い(誤りうる)。
9. **配線UI (build/recruit/save)**: App3d では省略。トライアルなので既存 App の HUD は使わない設計。
10. **e2e テスト**: 3D 経路の E2E は追加していない。トライアル完了時に判断。

## 14. パフォーマンス観察 (試作シナリオ)

Chromium (Linux, no GPU) headless での実測:

| 指標 | 値 |
|---|---|
| 初期ロード | ~ 2s (アセット読込込み) |
| 地形メッシュ vertex 数 | ~65k (128×128 平地 + 崖) |
| Feature メッシュ数 | 7 (bailey + pond + 5 linears) |
| RAF ループ | 30〜60fps (headless) |
| バンドルサイズ増加 | +~500KB gzip 前 |

体感上は問題ないが、GPU 実機・より大きなマップでの検証は未実施。

## 15. 全面移行への影響見積り

**移行するなら:**

- 既存 PixiJS レンダラー削除で:
  - ~ 2000 行の `renderer/` コードが消える (`GameCanvas.tsx` 613 行 + サブモジュール)
  - PixiJS 依存 (~300KB gzip 前) が消える
- 追加が必要:
  - スプライトシートアニメの Three 移植 (unit walk/attack/death 各種)
  - 屋外エフェクト (arrow / smoke / muzzle flash) の Three 移植
  - ミニマップ (WebGL テクスチャで別レンダー) の Three 移植
  - トーングレード (post-processing pass)
  - HUD 座標変換 (React ↔ WebGL 座標)
  - 全既存シナリオの縄張りジオメトリを AreaFeature/LinearFeature に書き直す (ビルドツール要検討)
- 建物ビルボードのアンカー・スケール調整で微調整が数十時間分
- E2E テスト書き直し (window.__asamaTest 経由は継続可能だが座標系変換が変わる)

**推定工数**: 全機能パリティで 4〜6 週間。1名フルタイム相当。

## 16. 勧告

**当面は 2D 継続、ただし path-based ジオメトリ生成 (Blender手続き) の拡充を推奨。**

理由:
- 3D レンダラーは目的 (曲がった縄張り表現) を **実現可能** と示せた。技術リスクは低い。
- しかしプロダクション移行の工数は大きい (~1ヶ月+)。それに見合う **ゲームプレイ価値** は、現行の 2D アイソメで十分に読み取れる範囲内。
- 手続き的 Blender 生成の充実 (現状の generateHonmaruTiles や generateDirectionalWallGates 系) で、
  同じ「非直交壁・曲線縄張り」の表現力を 2D レンダラーの範囲で拡張できる余地がまだある。
- ハイブリッド 3D は 「石垣・水堀・高低差ショーケース」など特定シナリオ限定の演出モードとして温存する価値はある。

**次のアクション候補**:

1. 本試作を `?renderer=3d` の DEV 専用パスとして温存し、v3.0 検討時に再評価
2. 2D レンダラー側で `renderGeometry.ts` に polyline → tile mask コンパイラを追加し、非直交壁の表現力を拡張
3. Blender で非直交石垣タイルセットを一括生成するパイプラインを整備

10 の評価質問(3D 試作 request 第 25 章)への回答:

1. **必要なアセット数は減るか?** ✅ 大幅に減る (方向別スプライト不要、1メッシュジェネレータで全形状表現)
2. **不規則な城郭表現は自然になるか?** ✅ ポリラインで自由に配置可能
3. **2D 建物スプライトは 3D 地形に対して許容できるか?** ⚠️ 見た目は成立するが、光源方向がスプライトと 3D で不一致 (2Dは左上光源固定、3Dは動的光源)
4. **透明ビルボードの depth 問題は制御可能か?** ✅ `alphaTest: 0.5` + `depthWrite: true` で概ね解決
5. **ジェネリック低品質 3D 城ゲー感を回避できたか?** ⚠️ 部分的成功。マテリアル調整とライティング抑制で及第点だが、テクスチャ導入で更に改善余地
6. **固定オルソカメラで戦闘の読みは保てるか?** ✅ 2D と同水準の読み(オブリーク角度が近い)
7. **現行 WorldSnapshot で足りるか?** ✅ 追加の LinearFeature/AreaFeature を **レンダリング側だけ** で持てば足りる
8. **既存アセットパイプラインは継続使用可能か?** ✅ 建物/ユニット PNG はそのまま使えた
9. **全面移行の見積コスト** → 上記 §15 (4〜6 週間)
10. **推奨アクション** → 上記 §16 (継続 2D + パス系ジオメトリ生成の拡充)
