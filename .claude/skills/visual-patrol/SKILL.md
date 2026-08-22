---
name: visual-patrol
description: 実マップのランダムビューを撮影し、別コンテキストVLMで違和感を自動抽出→問題台帳化→修正→同一seed再パトロールで収束確認する知覚QAサイクルを回す
---

# visual-patrol — 知覚QAパトロールサイクル

composite-lint(L1.5)は「既に測り方を知っている欠陥」(GAP/VAL/REP)しか検出できない。
このサイクルは**まだ測り方を知らない違和感**(バリアントプールをすり抜ける反復感・
高低差接合部のアーティファクト・描画順の破綻など)を拾うための知覚検査。

台帳の正典: `docs/05_map-and-art/visual-patrol-ledger.md`。
ルール化の正典: `docs/05_map-and-art/art-rulebook.md`(art-reviewスキル参照)。

## 1. 撮影(random capture)

```bash
# dev server (apps/game, port 5196) 起動が前提
cd apps/game && node qa/visual-patrol.mjs --scenario ogaki-castle --count 12 --seed <n>
```

- 出力: `artifacts/visual-patrol/<scenario>/<run>/shot-NN.png` + `index.json`(各ビューのcell/zoom記録)
- **seedは必ず記録する**: 同一seed⇒同一ビュー。修正後に同じ絵で収束確認するための鍵
- ビュー中心は建物位置からサンプリング(空き草原は情報ゼロ)。高低差エッジ・マップ端の検査には
  バイアスが不足するので、必要なら該当座標のビューを固定追加する
- launch argsは `["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]` 厳守(swiftshader系は黒キャンバス)
- Debugオーバーレイは起動時ONなのでツールがOFFにする(スクショに残っていたら不良)

## 2. 違和感抽出(別コンテキストVLM)

撮影者と**別コンテキストのエージェント**(Agent tool)に3-4枚ずつ渡して並列レビュー。
プロンプトに含めるもの:
- スクショのファイルパス(絶対パス)
- 「ゲーム画面として違和感のある箇所を、先入観なしに全て挙げよ」(ルールブックは読ませない —
  既知ルールへの誘導は新種の違和感を殺す)
- 出力様式: 箇所(画像内位置)+ 何が変か + 深刻度(高/中/低)を1行ずつ

## 3. 台帳化(triage)

`docs/05_map-and-art/visual-patrol-ledger.md` に V-nn 採番で記録:
- 状態: open / fixing / fixed(検証待ち) / closed(ルール化済み) / deferred
- **ユーザー直接指摘は無条件P0**
- 複数レビュアーが独立に挙げた項目は優先度を上げる
- 各項目に「どのrun・どのshotで見えるか」を記録(再現手順)

## 4. 修正 → ルール化

- 修正は根本原因の特定まで下る(例: V-01は「水面の反復感」ではなく「Holdoutスカートの影+
  位相バリアント画素同一」が原因だった)
- 検出をすり抜けた理由も直す(検出機構へのフィードバック節に記録し、lint側にルール追加)
- ルール化の行き先は art-review スキルの「不合格サイクルのクローズ条件」に従う
- アセット再レンダーはキャッシュキー影響を必ず確認: core.py/materials.py は全アセットのキーに
  入るため触らない。修正は分離レジストリ(`render_asset_lib/<registry>/`)で行う

## 5. 収束確認(同一seed再パトロール)

```bash
cd apps/game && node qa/visual-patrol.mjs --scenario ogaki-castle --count 12 --seed <元のseed>
```

- 該当shotの前後比較を別コンテキストVLMに渡し「前回指摘した違和感が解消しているか」だけを問う
- 解消 → 台帳を fixed(検証待ち) → closed(ルール化済み) に進める
- 新しい違和感が出たら V-nn 追加でサイクル継続。**open のP0/高が尽きるまで回す**

## サイクルのクローズ条件

1周 = 撮影→抽出→台帳化→修正→ルール化→収束確認。
台帳の該当項目が closed(ルール化済み) になるまでが1件の完了。修正だけで終わらせない。
