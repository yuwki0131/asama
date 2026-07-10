# 高低差コントラクト (Elevation Contract)

2.0 P4「高低差」の共通規約。P4a(sim基盤・本書と同時に実装済み)、P4b(レンダラー)、P4c(傾斜・崖タイルアセット)、P5(山城マップ)はすべて本書に従う。正典は `docs/10_development/release-2.0-scope.md` の合意(離散4段 / 崖=通行不可 / 坂のみ通行 / 登坂コスト / 高所の射程・ダメージボーナス)。

数値の実装上の正体: `packages/simulation/src/elevation.ts` の `ELEVATION_BALANCE`。型は `packages/shared/src/index.ts`。

## 1. セルモデル

`TerrainCellSnapshot` / sim内部 `TerrainCellState` に以下を**追加的に**持つ(既定値で従来と完全互換):

| フィールド | 型 | 既定値 | 意味 |
|---|---|---|---|
| `elevation` | `number` (整数 0..3) | `0` | セル表面の離散高さ。`MAX_ELEVATION = 3` |
| `slope` | `"N" \| "E" \| "S" \| "W" \| null` | `null` | 坂マーカー。非nullならこのセルは「`toward` 方向へ +1段上がるスロープ」 |
| `elevationSkin` | `"cliff" \| "ishigaki"` | `"cliff"` | このセル周りの崖面・坂タイルのスキン(自然=岩肌 / 城郭=石垣) |

方向はセル座標系のカーディナル: **N = -y, E = +x, S = +y, W = -x**。

### 坂(slope)の表現

坂は**セル属性**。`slope: D` のセル(基準高さ `L = elevation`)は:

- `D` 方向のエッジ表面高 = `L + 1`(上端)
- `D` の反対方向のエッジ表面高 = `L`(下端)
- **側面2方向のエッジは崖**(通行不可)。坂は軸方向にしか出入りできない
- 連続した坂を縦に並べると多段ランプになる(例: `elevation=0, slope=N` の北隣に `elevation=1, slope=N` → 0→2 の二段登り)
- 坂セルの `elevation` は**低い側**の値。戦闘判定でも坂上のユニットは低い側の段として扱う

## 2. 通行規則(エッジ判定)

移動可否は**セル単独の passable ではなく隣接ペアのエッジ**で決まる。実装: `canStep(world, from, to, perspective)` = 従来の `isPassable(to)` **かつ** `canTraverseElevation(from, to)`。

`canTraverseElevation`: 各セルは方向ごとにエッジ表面高 `edgeHeight(cell, dir)` を持つ(平坦セルは全方向 `elevation`、坂セルは上記)。**両セルの向かい合うエッジ高が一致するときのみ通行可**。

帰結:

- 同 `elevation` の平坦セル同士 → 通行可(従来どおり)
- `elevation` 差 ≥ 1 の非坂境界 = **崖** → 通行不可(1段差でも不可)
- 段差1は**向きの整合する坂セル経由でのみ**通行可(下段平地 → 坂の下端 → 坂の上端 → 上段平地)
- 坂の側面から入る/出る → 不可
- **水は段0のみ**。elevationパッチは水セルをスキップし常に0に保つ(水に隣接する段1以上の陸地は自動的に崖岸になる)。水堀・川を高台に置きたい場合は将来課題
- この規則は **A\*経路・敵AI・兵糧接続BFS・市場接続BFS すべてに適用**(supply perspective の門通過抽象化はそのまま重ねて適用)

## 3. 登坂コスト

上り(surface level が増えるステップ。坂に上がる/坂から上段へ出る、の各ステップ)に対して:

| 定数 | 値 | 作用 |
|---|---|---|
| `climbCostPerStep` | **+2** | A* の g コストに加算(経路選択が坂登りを重く見る)。1段登り = 2ステップ = 合計 +4 |
| `climbExtraTicksPerStep` | **+3 tick** | 実移動時間。上りステップ所要 tick = `ticksPerStep + 3`(足軽6→9、約1.5倍遅) |

下り・平坦はペナルティなし。スナップショットの `UnitSnapshot.ticksPerStep` は**現在ステップの実効値**(登坂込み)を返すため、クライアント補間は無変更で同期する。

## 4. 戦闘(高所ボーナス)

判定はユニットの居るセルの `elevation`(坂上は低い側)。

| 状況 | 効果 |
|---|---|
| 攻撃側 elevation **>** 対象 elevation | 射程 **+1**、与ダメージ **×1.25**(相性倍率と乗算後に四捨五入、最低1) |
| 攻撃側 elevation ≤ 対象 elevation(低所→高所含む) | **ペナルティなし**(等倍・素の射程)。3.0の射線遮蔽導入まで低所ペナルティは設けない |

- 段差の大きさ(1段差でも3段差でも)によらず一律 +1 / ×1.25
- **建物への攻撃も対象**。建物の elevation = **アンカーセル(position)の elevation**。建物フットプリントは常に単一 elevation(下記の配置規則で保証)なので曖昧さはない
- 建物配置規則: フットプリント全セルが同一 elevation かつ坂セルを含まないこと(`canPlaceBuilding` が拒否。シナリオ初期配置も同じ検証を通る)。橋は例外(水=段0を渡るので常に段0)
- 移動(攻撃対象への接近)は素の射程で計算する。高所に着いた時点で実効射程が伸びる分には早く攻撃が始まるだけで矛盾しない

## 5. 描画契約(P4b向け)

- **1段 = 画面Y 40px 上方オフセット**(`ELEVATION_PIXELS_PER_LEVEL = 40`。P4b実装時は24pxだったが、段差の読み取りやすさのためPR#38で40pxに変更し、タイル資産もこの高さでレンダーする)。セル・建物・ユニット・装飾すべて `screenY -= elevation * 40`
- 坂セル上のユニットは中間高さ `-(elevation + 0.5) * 40 = -20px` 追加を基準に、ステップ補間で滑らかに遷移
- **深度ソート(y-sort)はセル座標基準のまま変更しない**。elevation はソートキーに含めず、描画位置オフセットのみに作用する(等角固定カメラでは高いセルは常に画面上方へずれるだけで前後関係は変わらない)
- **崖面は「高いセル側」の持ち物**として描く。等角固定カメラで見えるのは高台の S エッジと E エッジのみ。隣接セルとの `elevation` 差 `h ≥ 1` があるエッジに崖面スプライトを置く
- sim はタイルの `assetId`(地表テクスチャ)を elevation で変更**しない**。レンダラーが `elevation` / `slope` / `elevationSkin` フィールドから崖面・坂タイルを合成する(既存スナップショット消費側は無変更で従来描画になる)

### アセットID命名規約(P4c向け)

スキン2系統: 自然=岩肌 `terrain.cliff.*`、城郭=石垣 `terrain.ishigaki.*`(曲輪の段差は `ishigaki`)。

| 種別 | ID | 例 |
|---|---|---|
| 崖面(直線) | `terrain.<skin>.face.<s\|e>.h<1..3>` | `terrain.cliff.face.s.h1`, `terrain.ishigaki.face.e.h2` |
| 崖面(外角: S面とE面が出会う角) | `terrain.<skin>.corner.se.h<1..3>` | `terrain.ishigaki.corner.se.h1` |
| 崖肩の縁飾り(上面と崖面の境界、任意) | `terrain.<skin>.rim.<n\|e\|s\|w>` | `terrain.cliff.rim.s` |
| 坂タイル | `terrain.slope.<skin>.<n\|e\|s\|w>` | `terrain.slope.ishigaki.n`(toward=N の坂) |
| 坂の側面(坂セル側縁の崖) | `terrain.slope.<skin>.<n\|e\|s\|w>.side.<s\|e>` | `terrain.slope.dirt.n.side.e` |

坂タイルの `<skin>` はアート名で付く: `cliff` スキンのセルは土の切り通し `terrain.slope.dirt.*`、`ishigaki` スキンは石段 `terrain.slope.ishigaki.*`(レンダラーの `slopeAssetSkin()` が対応付ける)。

`h<n>` は段差の大きさ(1段=40px、h2=80px、h3=120px の面)。バリエーション(`.v1` 等)は既存規約どおり末尾に付けてよい。

### 多段の描画順の考え方

1. 地形パス: 既存の等角走査順((x+y) 昇順、チャンク単位)で各セルの「崖面(あれば)→ 上面タイル」を描く。崖面は高いセルの描画の一部なので追加ソートは不要
2. エンティティパス: 既存 y-sort のまま。Yオフセットのみ適用
3. 崖面の h は「そのエッジの向こう側セルとの elevation 差」。坂セルの上端/下端エッジは崖面を描かない(坂タイル自体が接続面)

## 6. シナリオ記述の語彙(P5向け)

`ScenarioDefinition.elevation?: ScenarioElevationDefinition`(省略=全域フラット。**既存3シナリオは無変更**)。

```ts
elevation: {
  patches: [
    // 丘・段丘は「絶対レベルへの max 合成」。外側から順に重ねると段丘になる
    { area: { kind: "ellipse", cx: 64, cy: 40, rx: 18, ry: 12 }, level: 1 },              // 山裾(岩肌)
    { area: { kind: "rect", x: 56, y: 34, width: 16, height: 12 }, level: 2, skin: "ishigaki" }, // 二之丸(石垣)
    { area: { kind: "rect", x: 60, y: 36, width: 8, height: 6 }, level: 3, skin: "ishigaki" },   // 本丸
  ],
  slopes: [
    // position は坂の「下のセル」。toward の方向に +1 段上がる。width で多列(大手道)
    { position: { x: 63, y: 53 }, toward: "N", width: 2 }, // 0→1 登城路
    { position: { x: 63, y: 46 }, toward: "N", width: 2 }, // 1→2
    { position: { x: 63, y: 42 }, toward: "N" },           // 2→3 虎口(幅1で防衛チョークに)
  ],
}
```

規則:

- `patches` は宣言順に適用、各セルは `max(現level, patch.level)` (削る表現は無い。凹地は周囲を上げる)。`skin` 省略時 `"cliff"`。水セルはスキップ(常に段0)
- `slopes` の `position` は**低い側**のセル。適用後に検証が走り、上端が `level+1` の面に・下端が `level` の面に接続しない坂、水上の坂、`MAX_ELEVATION` を超える坂は**ブート時に throw**(コンテンツ制作エラーを即座に検出)
- `width` は toward が N/S のとき +x 方向、E/W のとき +y 方向に伸びる
- 建物はフットプリント全体が同一レベル・坂なしのセルにのみ置ける(違反はブート時エラー)

## 7. 実装マップ(P4aで完了した箇所)

| 場所 | 内容 |
|---|---|
| `packages/shared/src/index.ts` | セル/シナリオ語彙の型、`MAX_ELEVATION`、`UnitSnapshot.elevation?` / `BuildingSnapshot.elevation?`(追加的・省略可) |
| `packages/simulation/src/elevation.ts` | `ELEVATION_BALANCE`、エッジ判定、登坂コスト、`applyScenarioElevation` + 検証 |
| `packages/simulation/src/pathfinding.ts` | `canStep`(エッジ判定)、`movementCostForStep`(登坂コスト込み)、A* 適用 |
| `packages/simulation/src/combat.ts` | 高所射程 +1・ダメージ ×1.25(建物含む) |
| `packages/simulation/src/food.ts` / `economy.ts` | 接続BFSのエッジ判定化 |
| `packages/simulation/src/world.ts` | シナリオ elevation 適用、登坂の実時間化、スナップショット出力 |
| `packages/simulation/src/serialization.ts` | 旧セーブのフラット埋め |

## 8. P4c 実装ノート(タイルアセット、2026-07-07)

P4cで制作済みのタイル一式(定義: `assets/definitions/production-assets/elevation-terrain.json`、
34枚)。ビルダーは `assets/source/blender/scripts/render_asset_lib/elevation/` +
`render_elevation_asset.py` に隔離(anim/ と同じパターン。静的387アセットの
キャッシュ鍵に入らない。定義JSONの `source.registry: "elevation"` が隔離レジストリを指す)。

### キャンバスとアンカー(P4b はこの前提で合成する)

| 種別 | キャンバス | アンカー | 配置 |
|---|---|---|---|
| `terrain.<skin>.face.<s\|e>.h<n>` / `corner.se.h<n>` | 64 x (32+40n) | (32, 16) | **高いセル**の位置に、そのセルの `screenY -= elevation*40` を適用して描く。上面菱形は通常タイルと同位置(z=0面)で、崖面はその下に垂れる |
| `terrain.slope.<skin>.<dir>` / 同 `.side.<s\|e>` | 64 x 72 | (32, 56) | 坂セルの位置に低い側の elevation オフセットで描く。上 40px は高い側の縁の分の余白 |

### 描画セマンティクス

- **corner.se は face.s + face.e の置き換え**(完全な L 型ピース)。S/E 両エッジが同じ h で崖になるセルでは corner のみを描く。h が異なる場合は face.s と face.e を個別に描く(角の意匠は落ちるが破綻はしない)
- セル内の描画順は「崖面(corner または face)→ 坂サイド → 坂 or 上面タイル」。すべて既存の (x+y) 昇順走査に収まる(持ち上がるジオメトリは常に自セルか先に描かれたセルの領域にしか投影されない)
- **坂タイルは中身の詰まったソリッド**(石段・土手とも)。側面が露出したときは素の側壁が描かれるため、`slope.*.side.*` を描き忘れても穴は開かない。side タイルは草の縁・化粧を足した正装版で、坂セルの「側面が低地に面するエッジ」にのみ重ねる(可視なのは N/S 向き坂の E サイド、E/W 向き坂の S サイドのみ。他方向は自前ジオメトリが隠す)
- side タイルの想定は「隣接地が坂の基準レベルと同じ」。それ以上の段差が横に出るレイアウトでは高いセル側の face.h を併用する
- **石垣はベースがセル境界・天端が内側**(裾広がりの実形状だとキャンバス 64x(32+40n) を溢れるため)。天端の物理エッジは上面タイルに隠れる前提で、緑の縁草は見かけの縁(菱形エッジのすぐ下)に付けてある
- 内角(凹角)は専用アセット不要の判断: face の両端に +0.03 のブリードがあり、隣接面と高いセルの上面が継ぎ目を覆う

### 検証画像

`pnpm assets:elevation:contact-sheet` が
`assets/intermediate/spike/elevation-tiles-contact-sheet.png`(全タイル)と
`elevation-kuruwa-mock.png`(段2曲輪+石段+切通しの手動合成、描画規則どおりの実装例)
を再生成する。合成ロジックは `packages/asset-tools/src/generateElevationContactSheet.ts`
の `buildKuruwaMock` が P4b の参照実装を兼ねる。

## 9. 未解決事項(後続判断)

- **梯子と高低差**: 攻城梯子(壁越え)は現状 elevation を見ない。石垣段差そのものに梯子を掛ける仕様は P5 で必要になったら定義
- **崖の内角(concave corner)アセット**: 命名は `corner.se` の類推で拡張可能だが、実際に必要な角種は P4c のタイル制作時に確定
- **findPathToAttackRange と実効射程**: 接近計画は素の射程で行う(高所到達後にボーナスで早く攻撃開始)。厳密な「高所射撃位置を選ぶ」AI は将来課題
- **凹地(基準面より低い地形)**: 語彙は max 合成のみ。必要になれば `level: -1` 相当を追加検討
- **4方向カメラ回転(3.0)**: 崖面アセットは S/E 面のみ制作。回転導入時は N/W 面の追加レンダーが必要(命名規約は既に4方向対応)
