# P2 スパイク報告: リグ+キーフレーム → 8方向スプライトシート焼き出し

2026-07-07 / ブランチ `agent/v2-anim-pipeline` / テクニカルアート担当

## 結論(先出し)

**リグ方式で成立する。代替は不要。** リグ付き足軽(アーマチュア7ボーン+剛体ペアレントの箱プリミティブ)の8フレーム歩行サイクルを、既存の等角カメラ+ペインタリーspecそのままで 8方向×8フレーム=64枚 焼き出せた。レンダー時間は**1フレームあたり実測 0.028秒**(Cycles CPU 32サンプル、96x128 supersample 2、22コア機)。量産規模でもレンダー時間は完全に無視できる。ボトルネックはレンダーではなく**モデリング/アニメの制作工数とキャッシュ設計**になる。

## 成果物

| ファイル | 内容 |
|---|---|
| `assets/source/blender/scripts/spike_anim_walk.py` | スパイクスクリプト(モデル構築+リグ+歩行キーフレーム+64枚レンダー)。registry.py 非改変 |
| `assets/intermediate/spike/anim-walk-ashigaru-sheet.png` | シート 384x512(8列=フレーム × 8行=方向、各48x64) |
| `assets/intermediate/spike/anim-walk-comparison.png` | 既存静止スプライトとの比較 |
| `assets/intermediate/spike/anim-walk-preview-s.gif` / `-ne.gif` | 歩行ループのアニメGIF確認用 |
| `assets/intermediate/spike/anim-walk-frames/` | 生フレーム96x128 + `timing-report.json` |
| `assets/intermediate/spike/anim-walk-frames-48/` | 48x64 縮小済みフレーム |

再現手順:

```bash
"$ASAMA_BLENDER_BIN" --background --factory-startup \
  --python assets/source/blender/scripts/spike_anim_walk.py -- \
  --output-directory assets/intermediate/spike/anim-walk-frames --supersample 2
# 縮小 + シート合成 (ImageMagick)
for f in anim-walk-frames/walk-*.png; do magick "$f" -resize 50% "anim-walk-frames-48/$(basename "$f")"; done
magick montage <dir順S,SE,E,NE,N,NW,W,SW × f1..f8> -tile 8x8 -geometry +0+0 -background none PNG32:sheet.png
```

## 方式の検証内容

- **リグ**: アーマチュア7ボーン(hips / spine / head / leg.l / leg.r / arm.l / arm.r)。メッシュは units.py と同じ箱プリミティブ語彙で、`parent_type='BONE'` の剛体ペアレント(変形メッシュ・ウェイト塗り不要)。ボーンペアレントがtail基準になる問題は `matrix_parent_inverse` で吸収(スクリプト内 `attach()`)。
- **歩行サイクル**: 8フレームループ。脚±26°/腕∓18°のカウンタースイング、槍手は±7°で静か、胴の捻り±6°+前傾4°、腰ボブ(大股時に最下)。全フレームを直接キー打ちするので補間器の性質に依存しない。
- **8方向**: カメラ・太陽は固定し、アーマチュアオブジェクトをZ軸45°刻みで回転。ペインタリーシェーディングはワールド法線基準なので、方向ごとにライティングが物理的に一貫する(北西向き=順光で明るく、南東向き=逆光で陰る)。行順は **S, SE, E, NE, N, NW, W, SW**(マップコンパス、N=mapY-1方向)。
- **持ち物**: 槍(柄+穂先)を右腕ボーンに剛体接続、背に指物(旗指し)をspineに接続 — 胴の捻りで旗が自然に揺れる。
- **質感**: materials.py の流儀(make_noise_material / make_plank_material / make_material + painterly finish)をそのまま再利用。既存Blenderペインタリー(engineer)と完全に同系statement。

## 実測レンダー時間と量産予測

実測(`timing-report.json`、Blender 5.1.1、Cycles CPU、22コア):

| 指標 | 値 |
|---|---|
| 1フレーム(96x128, 32サンプル) | 平均 **0.028s**(min 0.022 / max 0.085) |
| 64フレーム レンダー計 | 1.78s |
| プロセス全体 wall(Blender起動+ビルド+64枚) | **2.7s** |

量産予測(6ユニット種 × 4アクション × 8方向 × 8フレーム = **1,536枚**):

- 純レンダー: 1,536 × 0.028s ≈ **43秒**
- 現実的な単位は「1ユニット種×1アクション=1 Blenderプロセス(64枚)」≈ 2.7s wall。24プロセス直列でも **約65秒**。
- supersample 2→3(144x192)やサンプル64に上げても数分オーダー。**レンダー時間は意思決定要因から除外してよい。**
- 律速は (a) ユニット種ごとのモデル+リグ構築、(b) アクションごとのキーフレーム調整、(c) レビューサイクル。1種あたりモデル半日+4アクション調整半日と見て、6種で **実働3〜6日** が制作工数の見積り。

## 品質評価

`anim-walk-comparison.png` 参照(左から: AI静止画prod、AI歩行src、現行Blenderエンジニア、スパイク4フレーム)。

- **既存Blenderペインタリー(engineer)とは完全に同質**。同じマテリアル工場・同じ照明・同じカメラなので、フィールドに混ぜても浮かない。エンジニア静止画より情報量はむしろ多い(指物・槍・具足の切り分け)。
- **AI静止画(spear-ashigaru idle-south)との比較**では、AI画の方が色数・シルエットの有機性で勝る。スパイク品は「画質7割」の合格ラインで、箱体型の硬さは残る。量産時の引き上げ余地: 部位数を増やす(脛・前腕・草摺の分割)、面取り(bevel)、肌・具足のコントラスト調整、袖の二次揺れ。ペインタリーランプ自体は同一なので質感の乖離は起きない。
- **アニメの読み**: 48x64でも歩行は明瞭(GIF確認)。8フレームで十分滑らか。前向き(SE行)は逆光で暗くなる — ワールド固定光として正しいが、視認性のためにカメラ側フィルライトを僅かに足す判断はあり得る(全方向一括で効くので回帰は起きない)。

## 本パイプライン化の提案

### 1. production-assets JSON スキーマ拡張(案)

既存の unit エントリ(単発PNG)と後方互換を保ちつつ、`animation` ブロックを追加:

```jsonc
{
  "assetId": "unit.spear_ashigaru.walk",
  "kind": "unit",
  "output": "unit-spear-ashigaru-walk-sheet.png",   // シート1枚
  "source": {
    "type": "blender-animation",                     // 新 source type
    "script": "spike_anim_walk.py の本番版",          // registryは触らない別entry point
    "model": "unit-spear-ashigaru-rigged",
    "action": "walk",
    "renderSpec": "painterly",
    "supersample": 2
  },
  "geometry": { "canvasWidth": 48, "canvasHeight": 64, "anchorX": 24, "anchorY": 52.48 },
  "animation": {
    "frames": 8,
    "fps": 10,                                       // 再生速度(歩行10fps ≈ 0.8s/ループ)
    "loop": true,                                    // death は false
    "directions": ["s","se","e","ne","n","nw","w","sw"],
    "layout": { "columns": "frames", "rows": "directions" }  // 列=フレーム, 行=方向
  }
}
```

- 全セル同寸・同アンカー(現行unit規約と同じ)なので、フレーム矩形は `(col*48, row*64, 48, 64)` の純計算。個別rectのJSON列挙は不要。
- direction→row の対応表をスキーマに明示することで、シム側の向き(移動ベクトル)→行 のマッピングをデータ駆動にする。
- 静止画しかないユニットは `animation` 無しのまま動く(後方互換)。移行期は idle=既存静止画、walk=シート、が混在できる。

### 2. クライアント再生系(Pixi)設計案

- シートPNGを `Texture` 1枚でロードし、`new Texture({source, frame: rect})` で 64 個のサブテクスチャを事前スライス(アトラス化はビルド時に既存 atlas-plan に統合してもよい)。
- ユニット表示は既存Spriteを流用し、**テクスチャ差し替えのみ**で再生(AnimatedSpriteは使わず自前状態機械が良い。理由: 方向切替時に「同じ位相を保ったまま行だけ変える」必要があるため)。
- 状態機械: `state = idle | walk | attack | death`、`direction = 0..7`。P1の描画ループ(ticker)から `elapsed` を受け、`frame = floor(elapsed * fps) % frames`。direction はシムの速度ベクトル `atan2` から45°量子化(ヒステリシス±10°程度入れると震えない)。
- 位相同期: 全ユニットが同位相だと軍隊が「行進」して不気味なので、unitId ハッシュで位相オフセットを付ける。
- death は `loop:false` で最終フレーム保持 → フェードは既存のalpha制御。

### 3. キャッシュ戦略

- **現行キャッシュは無傷**: registry.py・render_asset.py に触れない別entry point(`render_animation.py` 新設)にする。本スパイクで実証済み。
- キャッシュキー = `hash(script本文 + libソース + assetIdエントリJSON)` → シートPNG 単位でキャッシュ。1シート=1キー(64枚を個別キャッシュしない。1シート2.7秒なので粒度を細かくする価値がない)。
- リグモデルは units.py に足さず `render_asset_lib/rigged/` の新モジュール群に置く(既存410アセットのハッシュ連鎖に入れないため)。ライブラリ共通部(core/materials)を変更した場合はシートも当然無効化される — これは正しい挙動。
- 生フレーム(96x128)は intermediate に残し、シート合成(縮小+montage)はビルドスクリプト側(Node or ImageMagick)で行う。合成は決定的なのでキャッシュ対象はシートだけでよい。

## リスクと判断が必要な事項

1. **アート品質の最終判定が未実施**。本スパイクは「成立証明」であり、AI静止画クオリティ(現行idleスプライト)と並べたときの見劣りをどこまで詰めるかは実レンダー選定ゲート(アート方針)で判断が要る。判断者: 統括。選択肢: (a) 箱リグを部位分割+bevelで引き上げ (b) idleのみAI静止画を残しwalk以降をBlenderに寄せる(混在は質感差が出るため非推奨)。
2. **既存idleスプライトの置き換え問題**: 全アクションをリグ方式に揃えるなら、承認済みAI静止画(spear/sword/archer/musketeer/cavalry/cart)は捨てて6種すべてリグでモデリングし直すことになる。cavalry(馬)と supply-cart(車輪回転)はヒト型リグの流用が効かず、追加工数が最大。車輪はボーン回転で楽、馬の歩様は最難関。
3. **逆光方向の視認性**(SE向きが暗い)。ワールド固定光の帰結として正しいが、ゲームプレイ上の視認性優先でフィルライトを足すかはアート判断。
4. **direction順・fps等の規約確定**をP2実装前に(本報告の提案値: S起点時計回りでない「S,SE,E,NE,N,NW,W,SW」= +45°回転順、歩行10fps)。クライアント実装と量産スクリプトが同じ表を参照する形にすること。
5. **atlas統合**: 1シート384x512 × 24アクション ≈ 4096x4096 1枚に収まる。既存 atlas-plan.json への統合方法はP2実装時に決める(シート単体ロードでも当面性能問題なし)。
6. **supersample縮小のフィルタ**は本スパイクでは ImageMagick 既定(Lanczos系)。現行パイプラインの縮小実装と揃えること(異なると1px級のエッジ差が出る)。

## 補足(実装メモ)

- ボーン剛体ペアレントは `matrix_parent_inverse = (armature.matrix_world @ pose_bone.matrix @ Translation((0, bone.length, 0))).inverted()` で「ワールド配置のまま接続」できる。ウェイト塗り不要でユニットサイズ(30px)には十分。
- 真下向きボーンの local X 回転 = 矢状面スイング。ロール規約に悩む必要はなかった。
- 1プロセス64枚方式(シーン構築1回+`frame_set`+`write_still`ループ)が肝。1枚ごとにBlenderを起動すると起動コスト(~1s)が支配的になる。
