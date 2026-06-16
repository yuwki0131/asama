# Connected Fence and Wall Rendering Correction

## 配置先

```text
requests/main2img/2026-06-17-connected-fence-wall-rendering-fix.md
```

Codexには次のように依頼してください。

```text
AGENTS.mdと以下の修正依頼を読んで実装してください。

requests/main2img/2026-06-17-connected-fence-wall-rendering-fix.md
```

---

# 目的

柵および城壁を複数セルに連続配置したとき、Stronghold風のRTSとして自然な一本の連続構造に見えるよう、接続スプライト生成と接続判定を修正する。

本タスクは色や装飾を増やすだけの修正ではない。

以下を解消する。

- 各セルが独立した菱形オブジェクトに見える
- 直線配置でもセル中央に大きな節・柱・屋根キャップが繰り返される
- 柵が日本の防御柵ではなく、農場用の横木柵に見える
- 城壁が連続した塀ではなく、小さな建物や箱の連続に見える
- 隣接セルの接続点が合っていない
- 柵・城壁の間に隙間や重複が見える
- 角、端、T字、十字の表現が不自然
- セルごとの楕円影や菱形背景が繰り返し模様として見える

---

# 作業前に確認するファイル

```text
AGENTS.md
docs/05_map-and-art/art-direction.md
docs/05_map-and-art/asset-pipeline.md
docs/05_map-and-art/map-specification.md

packages/asset-tools/src/templates.ts
packages/asset-tools/src/generateGeneratedAssets.ts
packages/simulation/src/index.ts
apps/game/src/client/renderer/GameCanvas.tsx
public/assets/generated/manifest.json
```

---

# 現在の問題

## 1. 接続形状がハブ方式になっている

現在のconnected fence / wallは、セル中央から接続方向へ枝を伸ばしている。

この方式では、直線の柵・城壁でも各セルに中央接合部が現れる。

直線配置では、一本の構造がセル境界を越えて連続して見える必要がある。

中央に毎セル大きな柱、六角形キャップ、屋根付き接合部を置いてはならない。

## 2. 描画中心とanchorが一致していない

接続構造の地面基準点は、PNGのanchor位置でなければならない。

現在のようにcanvas内の任意の`center`座標を基準にしてはならない。

接続点は、アイソメタイルの隣接セル間の中点から計算する。

## 3. 柵の形式が不適切

柵は日本の戦国期城郭・陣地にある木柵、逆茂木、簡素な防御柵に近づける。

横木が中心の西洋農場柵にしない。

MVPでは、縦の丸太・杭を連続させた木柵として表現する。

## 4. 城壁の形式が不適切

城壁は、白漆喰または板張りの連続した塀と、その上の瓦・板葺きの笠部分として表現する。

セルごとに小屋、箱、櫓、六角柱のような塊を置かない。

---

# 接続マスク仕様

既存の4bit maskを維持してよい。

bit順は次で固定する。

```text
N E S W
```

```text
N = grid ( 0,-1) = screen NE
E = grid (+1, 0) = screen SE
S = grid ( 0,+1) = screen SW
W = grid (-1, 0) = screen NW
```

16種類すべてを正しく描画する。

| mask | 種別 |
|---|---|
| `0000` | isolated |
| `1000` | end N |
| `0100` | end E |
| `0010` | end S |
| `0001` | end W |
| `1010` | straight N-S |
| `0101` | straight E-W |
| `1100` | corner N-E |
| `0110` | corner E-S |
| `0011` | corner S-W |
| `1001` | corner W-N |
| `1110` | T N-E-S |
| `0111` | T E-S-W |
| `1011` | T N-S-W |
| `1101` | T N-E-W |
| `1111` | cross |

---

# 接続座標

接続点はanchorを基準に計算する。

```ts
interface ConnectedSpriteGeometry {
  canvasWidth: number;
  canvasHeight: number;
  anchorX: number;
  anchorY: number;
  tileWidth: number;
  tileHeight: number;
}
```

地面基準点:

```ts
const groundCenter = {
  x: anchorX,
  y: anchorY
};
```

隣接セルとの接続ソケットは、セル中心間距離の半分とする。

```ts
const sockets = {
  n: {
    x: groundCenter.x + tileWidth / 4,
    y: groundCenter.y - tileHeight / 4
  },
  e: {
    x: groundCenter.x + tileWidth / 4,
    y: groundCenter.y + tileHeight / 4
  },
  s: {
    x: groundCenter.x - tileWidth / 4,
    y: groundCenter.y + tileHeight / 4
  },
  w: {
    x: groundCenter.x - tileWidth / 4,
    y: groundCenter.y - tileHeight / 4
  }
};
```

64x32タイルの場合:

```text
N = anchor + ( 16, -8)
E = anchor + ( 16, +8)
S = anchor + (-16, +8)
W = anchor + (-16, -8)
```

隣接する2つのスプライトの対応ソケットは、ワールド座標上で完全に一致しなければならない。

許容誤差:

```text
1px以下
```

magic numberで`center = {x:32,y:34}`等を定義してはならない。

---

# 柵の描画仕様

## 基本形状

柵は、接続方向に沿って並ぶ縦杭・丸太の列として描画する。

- 3〜5本程度の縦杭を1セル区間に配置
- 杭の上端は軽く尖らせてよい
- 杭の高さに少量のばらつきを付けてよい
- 横方向の結束材は補助的に使用可能
- 横木だけの農場柵にしない
- 接地影は構造に沿った細い影とする
- セル全体を覆う楕円影を置かない
- 菱形の地面板を置かない

## straight

`1010`と`0101`は、ソケット間を一本の連続した柵として描画する。

- 中央に大型の柱を置かない
- 中央で太さを変えない
- 中央に扇状の分岐を作らない
- 直線のシルエットを維持する

## end

一方向接続では、非接続側に小さな終端杭を付ける。

終端を櫓・門・太い柱のようにしない。

## corner

角では、2本の柵が1本の角杭で自然に接続する。

角杭を過剰に大型化しない。

## T / cross

T字・十字はMVP用に簡素な接合杭を許容する。

ただし、星型・扇型・大きなハブに見せない。

---

# 城壁・塀の描画仕様

## 基本形状

城壁オブジェクトは、MVPでは日本城郭の連続した塀として表現する。

- 白漆喰壁または下見板張り
- 細い瓦または板葺きの笠
- 低く横長の構造
- 壁面と屋根が連続して見える
- セル単位の小建物にしない
- 各セル中央に屋根付きキャップを置かない
- 櫓のようにしない
- 兵士を上に配置しない

## straight

`1010`と`0101`は、壁面・基部・屋根の稜線がソケットからソケットまで連続する。

隣接セル間で次が一致すること。

- 壁基部
- 壁上端
- 屋根の高さ
- 屋根の幅
- 陰影
- 外形線

## end

終端には薄い小口面または柱を付ける。

終端を小屋や塔にしない。

## corner

角では、壁体と屋根を自然に折り曲げる。

角部分に六角形キャップや小天守状の塊を置かない。

## T / cross

MVPでは簡素な接合部でよい。

ただし、T字・十字専用の小建物に見せない。

---

# 影と背景

削除するもの:

- 各セルの大きな楕円影
- 各セルの菱形背景ポリゴン
- セル単位で繰り返される濃い接地板
- 接続形状と無関係な装飾

影は構造の形状に沿って右下へ落とす。

隣接セル間で影が極端に重ならないようにする。

---

# anchor修正

connected fenceとconnected wallは、base assetと同じanchor規則を使用する。

anchorは可能な限りピクセル位置が整数になる値にする。

例:

```text
fence 64x64:
anchor pixel = 32,48
normalized = 0.5,0.75
```

wall 64x72では、`0.78`のような中途半端な値を無条件に使わず、実際の接地pixelを定義する。

例:

```text
anchor pixel = 32,56
normalized y = 56 / 72
```

base assetと16 connected assetsでanchorを完全に統一する。

---

# 接続判定

既存の`connectionMask()`を維持してよいが、以下をテストする。

- fence同士
- wall同士
- fenceとgate
- wallとgate
- wide gateのfootprint端
- 建築追加後の再計算
- 解体後の再計算
- 破壊後の再計算

## fenceとwallの直接隣接

現時点で専用transition assetを実装しない場合、fenceとwallを同一線上に直接隣接させたデモ配置を避ける。

初期配置では、fenceサンプルとwallサンプルの間を最低1セル空ける。

別案としてfence-wall transitionを実装する場合は、通常のsame-type maskへ無理に混ぜず、明示的なtransition variantを用意する。

本タスクでは、初期配置を分離する方法でよい。

---

# 生成方式

connected fence / wallは現在placeholder/debug生成でよい。

ただし構造的に正しい接続表現にする。

本タスクでSVGを過剰に装飾し、本番アートへ見せかける必要はない。

将来のproduction raster / Blender assetも、同じsocket、mask、anchor契約を利用できる設計にする。

接続座標計算を、SVG内に埋め込んだmagic numberとして残さない。

共通helperへ抽出する。

推奨例:

```text
packages/asset-tools/src/connectedGeometry.ts
```

---

# テスト

## unit test

最低限、以下をテストする。

1. mask bit orderがN,E,S,Wである
2. 16 maskが生成される
3. straight maskが正しい2方向を持つ
4. corner maskが正しい2方向を持つ
5. T maskが正しい3方向を持つ
6. crossが4方向を持つ
7. 隣接セルの対応socketが1px以内で一致する
8. fence / wall / gateのmask再計算
9. 解体後にmaskが更新される
10. baseとconnected variantのanchorが一致する

## visual contact sheet

次を生成する。

```text
artifacts/connected-structures/
├── fence-masks.png
├── wall-masks.png
├── fence-runs.png
├── wall-runs.png
└── gate-connections.png
```

### fence-masks.png / wall-masks.png

16 maskをすべて一覧表示する。

各項目にmask文字列を表示する。

### fence-runs.png / wall-runs.png

以下を実際のアイソメ配置で表示する。

- 8セル直線 N-S
- 8セル直線 E-W
- 四角形
- 4種類の角
- 4種類のT字
- 十字
- isolated
- end

### gate-connections.png

- 1セル門 + fence
- 1セル門 + wall
- 2セル門 + wall
- 3セル門 + wall

接続点の隙間、重複、高さ差を確認できるようにする。

---

# 受け入れ条件

- [ ] 直線配置が一本の柵・塀に見える
- [ ] セル中央の大型ハブが繰り返されない
- [ ] 柵が日本の防御木柵に見える
- [ ] 柵が西洋農場柵に見えない
- [ ] 城壁が連続した日本の塀に見える
- [ ] 城壁が箱・小屋・小櫓の列に見えない
- [ ] 隣接セルの接続点に隙間がない
- [ ] 隣接セルの接続点が過剰に重複しない
- [ ] straightが屈曲して見えない
- [ ] cornerが自然に折れる
- [ ] endが過剰に大型化しない
- [ ] T / crossが星型のハブに見えない
- [ ] 各セルの菱形背景が見えない
- [ ] 各セルの大きな楕円影が見えない
- [ ] anchorが整数pixel基準で揃っている
- [ ] 16 maskのcontact sheetが生成されている
- [ ] gate接続のcontact sheetが生成されている
- [ ] typecheckとtestが成功する
- [ ] runtime manifestのassetId互換性を壊していない

---

# 実行するコマンド

```text
pnpm run assets:generate:placeholder
pnpm run generate:main2img
pnpm run validate:generated-assets
pnpm run typecheck
pnpm test
```

追加したvisual contact sheet生成コマンドがある場合は、それも実行する。

---

# 完了報告

以下を記載する。

- 原因
- 修正した座標契約
- anchor変更
- mask判定変更
- 修正ファイル
- unit test結果
- contact sheet出力先
- fence-wall transitionを今回実装したか
- production asset化へ残る課題
