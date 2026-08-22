---
name: art-review
description: ビジュアルQAゲート(L1機械lint+L2 VLMセルフレビュー)をアセット変更に適用し、ユーザー提示前に合否判定する
---

# art-review — ビジュアルQAゲート実行手順

アセット(PNG/manifest/レンダリング)を変更したら、**ユーザーに見せる前・PR作成前**にこのゲートを通す。
運用原則: **一度指摘されたことは二度とユーザーに指摘させない。**

判定基準の正典: `docs/05_map-and-art/art-rulebook.md`(ルールID付き)。
様式語彙は `docs/05_map-and-art/art-direction.md` が正。

## L1: 機械lint(必須)

```bash
pnpm assets:lint:art
```

- 新規違反0で合格。既知違反は `assets/definitions/art-lint-baseline.json` で管理
- 自分の変更で違反を修正したら baseline から該当エントリを削除する
- baseline に新規エントリを足すのは「既存アセットの棚卸し」のみ。**自分が今作った違反を baseline に隠すのは禁止**

## L1.5: コンポジットlint(マップスケール、必須)

アセット単体では正常でも組み合わせで壊れる欠陥(穴あき空間・黒穴・繰り返し感)を実ゲーム画面で機械検査する。
判定基準は rulebook の COMP-01〜03。

```bash
# dev server (apps/game, port 5196) 起動が前提
cd apps/game && node qa/composite-lint.mjs --scenario <name>   # 例: ogaki-castle
```

- 標準6ビュー(`assets/definitions/composite-views.json`: first/center/nw/ne/sw/se)を撮影し GAP/VAL/REP を検査
- **error 0で合格**(infoは既知の設計負債: wall/road直線辺のバリアントプール未整備 → COMP-03)
- レポート/スクショ/クロマキー画像は `artifacts/composite-lint/<scenario>/` に出力。error時は近傍assetId帰属付き
- 対象: レンダラー(sceneLayer/terrainLayer)変更、connected系アセット追加・変更、シナリオマップ変更

## L2: VLMセルフレビュー(必須)

1. 定点スクショを撮る。プリセットは `assets/definitions/review-shots.json`:

```bash
node apps/game/qa/shot.mjs --preset <ishigaki|tenshu|farm|gate>
```

   - dev server が必要(プリセット記載のポート)。chromium launch args は変更しない(`--disable-gpu` が正、swiftshader系は黒キャンバス)
   - 対象アセットにプリセットがなければ、該当シナリオの実在セル座標でショットを追加してから撮る(review-shots.json に追記)

2. **作成者と別コンテキストのエージェント**(Agent tool、汚染防止のため作成会話の文脈を持たないこと)にレビューを委任する。プロンプトに含めるもの:
   - スクリーンショットのファイルパス
   - `docs/05_map-and-art/art-rulebook.md` を読む指示
   - 対象アセット種別に該当するルールID一覧(例: 田畑なら FARM-01〜06, TONE-02/03)
   - 出力様式: ルールIDごとに 合/否/対象外 + 画像内の根拠(位置・見え方)を1行

3. 1件でも否があれば修正して再ゲート。合格するまでユーザーに提示しない。

## 不合格サイクルのクローズ条件(PROC-01)

ユーザーから新規指摘が出たら、修正だけで終わらせない:

- 機械化可能(アセット単体) → `packages/asset-tools/src/artLint/checks.ts` にチェッカー追加(+テスト)
- 機械化可能(組み合わせ・マップスケール) → `apps/game/qa/composite-lint.mjs` に検査追加(+標準ビュー調整)
- 審美判断 → `art-rulebook.md` の該当セクションに1行追加

ルール追加までがサイクルのクローズ条件。

## 定期知覚検査(visual-patrolスキル)

L1/L1.5/L2は「既知の測り方」のゲート。まだ測り方を知らない違和感は **visual-patrol** スキル
(ランダムビュー撮影→別コンテキストVLM抽出→`docs/05_map-and-art/visual-patrol-ledger.md` 台帳化→
修正→同一seed再パトロール)で拾い、理解できた時点でここ(L1 lint / composite-lint / rulebook)に昇格させる。

## 適用範囲

- 対象: `public/assets/generated/` に入るPNG、manifest、Blender/rasterパイプライン、レンダラーの見た目に効く変更
- アート反復ループ(同一アセットの連続修正)は統括が直接実施(PROC-03: 1ラウンド1変数)
