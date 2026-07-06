# アニメーションパイプライン仕様 (P2)

2026-07-07 確定。P2「アニメ基盤」の量産系。スパイク報告
(`assets/intermediate/spike/anim-pipeline-report.md`) の提案を本実装したもの。
クライアント再生系(P2の残り)と P3 量産はこの契約に従うこと。

## 全体像

```
assets/definitions/production-assets/unit-animations.json   … 定義(animations 配列)
  └─ pnpm assets:render:anim
       ├─ render_anim_asset.py … 1ユニット×1アクション=1 Blenderプロセス
       │    (8方向 × 全フレームを supersample 解像度で個別PNG出力)
       ├─ spriteSheet.ts       … sharp で縮小+シート合成(シャープは各セル単位)
       ├─ キャッシュ           … assets/intermediate/render-cache/anim/(シート単位 SHA256)
       └─ 出力                 … public/assets/generated/<unit>-<action>-sheet.png
                                  + manifest.json の animations セクション
```

静的アセット系(render_asset.py / registry.py / render_asset_lib 直下)は
**不変**。アニメ用コードは `render_asset_lib/anim/` と `render_anim_asset.py`
に隔離してあり、静的 387 アセットのキャッシュ鍵に入らない(core.py /
materials.py を変更した場合は両方無効化される。これは正しい挙動)。

## 定義スキーマ(production-assets JSON の `animations` 配列)

既存リーダーは `assets` しか読まないため、同じファイル群に追加しても
後方互換。現在は `unit-animations.json` に集約。

```jsonc
{
  "version": 1,
  "assets": [],                          // 既存リーダー互換のため必須(空でよい)
  "animations": [
    {
      "assetId": "unit.spear_ashigaru",  // ユニット単位のID
      "kind": "unit",
      "model": "unit-spear-ashigaru-rigged",  // anim/registry.py の ANIM_MODEL_REGISTRY キー
      "renderSpec": "painterly",
      "supersample": 2,
      "directions": 8,                   // 現状 8 固定(バリデーションあり)
      "frameCanvas": { "width": 48, "height": 64, "anchorX": 24, "anchorY": 52.48 },
      "postprocess": { "sharpen": { "sigma": 0.45 } },
      "actions": [
        { "name": "walk",   "frames": 8, "fps": 10, "loop": true },
        { "name": "idle",   "frames": 6, "fps": 6,  "loop": true },
        { "name": "attack", "frames": 8, "fps": 12, "loop": true },
        { "name": "death",  "frames": 3, "fps": 8,  "loop": false }
      ]
    }
  ]
}
```

## シートのレイアウト契約

- 1アクション = 1枚のシートPNG。**列 = フレーム(1..N 左→右)、行 = 方向**。
- 行順は固定: **S, SE, E, NE, N, NW, W, SW**(マップコンパス、N = mapY-1 方向。
  +45°刻みのターンテーブル順)。
- 全セル同寸・パディング無し。フレーム矩形は純計算
  `(col * frameW, row * frameH, frameW, frameH)`。
- アンカーはセル内正規化座標(静的アセットと同じ規約)。
- ライティングはワールド固定なので方向ごとに明暗が物理的に変わる(北西向きが
  順光、南東向きが逆光)。仕様であり回帰ではない。

## manifest.json の `animations` セクション(追加的・後方互換)

既存クライアントは `assets` のみ読むため無影響。`assets:validate` が
寸法・行順・グリッド整合を検証する。

```jsonc
{
  "version": 1,
  "assets": [ /* 既存のまま */ ],
  "animations": [
    {
      "assetId": "unit.spear_ashigaru.anim.walk",
      "unitAssetId": "unit.spear_ashigaru",
      "action": "walk",
      "kind": "unit",
      "file": "generated/unit-spear-ashigaru-walk-sheet.png",
      "sheet": { "width": 384, "height": 512 },
      "frame": { "width": 48, "height": 64 },
      "frames": 8,
      "fps": 10,
      "loop": true,
      "directions": ["s","se","e","ne","n","nw","w","sw"],
      "layout": { "columns": "frames", "rows": "directions" },
      "anchor": { "x": 0.5, "y": 0.82 }
    }
  ]
}
```

## キャッシュ

- ディレクトリ: `assets/intermediate/render-cache/anim/`(専用 index.json。
  静的キャッシュの index.json とは完全分離)。
- 鍵 = SHA256(render_anim_asset.py + render_asset_lib/anim/*.py + core.py +
  materials.py + 全レンダーパラメータ)。1シート = 1鍵。
- fps / loop は画素に影響しないが鍵に含める(定義変更で manifest も確実に
  更新させるため)。

## コマンド

```bash
pnpm assets:render:anim         # 定義 → シート生成(キャッシュ利用)+ manifest 反映
pnpm assets:anim:contact-sheet  # レビュー用 3倍拡大コンタクトシート → assets/intermediate/spike/
pnpm assets:validate            # 静的 + アニメの manifest 検証
pnpm assets:all                 # 既存チェーンに anim レンダーを追加済み
```

## モデル/アクションの追加手順(P3)

1. `render_asset_lib/anim/<unit>.py` にリグ+メッシュのビルダーを書く
   (`anim/rig.py` のヘルパー: 剛体ボーンペアレント attach / bevel / slab / cone)。
2. `anim/registry.py` の `ANIM_MODEL_REGISTRY` に登録。
3. ヒト型ならアクションは `anim/actions.py` の walk/idle/attack/death を流用可
   (ボーン名契約: `HUMANOID_BONES`)。非ヒト型は専用キーフレーマーを追加して
   `ACTIONS` に登録(アクション名は定義JSONと一致させる)。
4. `unit-animations.json` にエントリ追加 → `pnpm assets:render:anim`。

非ヒト型の方針案:
- **騎馬**: 馬体(胴/首/頭/尾 + 4脚を各2節)+ 騎手(HUMANOID簡約版)の複合リグ。
  歩様は 8f のトロット(対角2拍)が最小成立。attack は騎手の槍/刀のみ動かし
  馬は歩様維持。death は横倒れ 3f。actions.py とは別テーブルで
  `ACTIONS` に horse 用を追加する。
- **荷車**: ボーン3本(車体 / 車輪L / 車輪R)。walk = 車輪の Y軸回転
  (45°刻みで8f ループ、スポークを4本にすると8fで完全ループ)+ 車体の微揺れ。
  idle = 揺れのみ、attack 無し(定義から外せばよい)、death = 荷崩れ1〜2f。
