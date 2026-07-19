# Workflow — 浅間の開発の進め方

このリポジトリでの開発フロー全体像。個別の規約詳細は `AGENTS.md`、アート判定基準は
`docs/05_map-and-art/art-rulebook.md` が正典。本書は「どう回すか」の一覧。

## 全体の流れ

```
タスク受領
  → featブランチ作成
  → 実装(必要なら並列エージェント委任)
  → 検証(typecheck / test / アートならビジュアルQAゲート)
  → スナップショットコミット
  → PR作成 → CI green確認 → マージ
  → ユーザー指摘があればルール化してクローズ
```

## ブランチ・コミット・PR

- `main` はブランチ保護あり。**直接pushは不可**。必ず `feat/...` / `fix/...` ブランチ → PR → CI green → マージ。
- コミットメッセージは `v$(date +%y%m%d%H%M)` スナップショット形式 + 日本語サマリ。
  例: `v2607191342 L2レビュー指摘対応: ...`
- CI確認は `gh pr checks <PR番号> --watch` 等で**exit codeを潰さずに**行う
  (パイプに流すと失敗を見落とす)。green を明示確認してからマージ。
- 「作った」と「配線した」は別。機能を追加したら、実際に使われる経路まで通っていることを確認する。

## エージェント委任体制

- **統括**(メインのClaude Codeセッション)は方針決定・指示・レビュー・最終チェックに集中する。
- 大きめの独立タスクは `codex exec` / Copilot / サブエージェントに委任し、並列に進める。
- **例外: アート反復ループ**(同一アセットの連続修正)は委任せず統括が直接実施する。
  1ラウンド1変数(PROC-03)で回す。フィードバックの解釈がぶれるため。
- 調査・検索はExploreサブエージェント、レビューは**作成コンテキストを持たない別エージェント**に出す。

## ビジュアルQAゲート(アセット・レンダリング変更時は必須)

対象: `public/assets/generated/` のPNG、manifest、Blender/rasterパイプライン、
レンダラーの見た目に効く変更。**ユーザーに見せる前・PR作成前**に通す。
手順の正典は `.claude/skills/art-review/SKILL.md`。

1. **L1: 機械lint** — `pnpm assets:lint:art`。新規違反0で合格。
   既知違反は `assets/definitions/art-lint-baseline.json` で管理。
   **自分が今作った違反をbaselineに隠すのは禁止**。修正した違反はbaselineから削除する。
2. **L2: VLMセルフレビュー** — `node apps/game/qa/shot.mjs --preset <name>` で定点スクショ
   (プリセットは `assets/definitions/review-shots.json`、要dev server)。
   作成者と**別コンテキストのエージェント**に、スクショ + `art-rulebook.md` + 対象ルールID一覧を
   渡してレビューさせる。1件でも否なら修正して再ゲート。
   - chromium launch argsは変更しない(`--disable-gpu` が正。swiftshader系は黒キャンバスになる)。
   - レビュアーのピクセル数値主張は鵜呑みにせず、sharpのrawバッファ等で自分で検証してから採否判断。
3. **CI** — PRのチェックが最終ゲート。

## フィードバックのルール化(PROC-01)

運用原則: **一度指摘されたことは二度とユーザーに指摘させない。**

ユーザーから新規指摘が出たら、修正だけで終わらせない:

- 機械化できる指摘 → `packages/asset-tools/src/artLint/checks.ts` にチェッカー追加(+テスト)
- 審美判断 → `docs/05_map-and-art/art-rulebook.md` の該当セクションに1行追加

ルール追加までがサイクルのクローズ条件。

## テスト・検証

- `pnpm run typecheck` / `pnpm test`(Vitest)。
- E2Eは `window.__asamaTest` ブリッジ + playwright-core + システムchromium。
  QAプローブは `apps/game/qa/` に `*.tmp.mjs` で書き、コミット前に削除する。
- UI/レンダリング変更は実際にスクリーンショットで見た目を確認してから完了とする。

## ドキュメントの正典

| 内容 | 場所 |
|---|---|
| リポジトリ規約(構成・コマンド・スタイル) | `AGENTS.md` |
| アート判定基準(ルールID付き) | `docs/05_map-and-art/art-rulebook.md` |
| 様式語彙・アートディレクション | `docs/05_map-and-art/art-direction.md` |
| 仕様書の読み順 | `docs/README.md` |
| ビジュアルQAゲート手順 | `.claude/skills/art-review/SKILL.md` |

## その他の約束事

- `future/` ディレクトリは未確定の構想置き場。読まない・編集しない・タスクの根拠にしない。
- 本番アセットポリシー(`AGENTS.md` 参照): 一括再生成 `generateGeneratedAssets` は本番ラスター画を
  破壊するため、対象を絞ったスタンドアロン生成スクリプトで差し替える。
