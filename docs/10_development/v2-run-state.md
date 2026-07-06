# 2.0 ラン状態(生きた文書 — 統括が常に最新化する)

> セッション断絶からの回復手順: このファイルと `release-2.0-scope.md` を読む → 「進行中」の項目を確認 → 未完了ブランチ/PRの状態を `gh pr list` と `git branch -a` で照合 → 走行を再開。ユーザーへの中間確認は不要(契約済み)。

## 現在のフェーズ

- **P1 描画コア**: 進行中(ブランチ agent/v2-render-core)
- **P2 アニメ基盤**: スパイク進行中(ブランチ agent/v2-anim-pipeline — リグ付き歩行サイクル→スプライトシートの成立検証)

## 進行中の作業

| 作業 | ブランチ | 状態 |
|---|---|---|
| 60fps ticker + 補間 + 保持型シーングラフ + マップ初回送信化 | agent/v2-render-core | 実装完了・PR提出済み(typecheck/lint/unit/E2E全緑。ヘッドレスSwiftShaderでは1280x800でfill-rate律速~10fps=main同等、実GPUで60fps想定。fps計測は `__asamaTest.getFps()`) |
| アニメパイプライン・スパイク(足軽歩行 8方向×8フレーム) | agent/v2-anim-pipeline | エージェント実装中 |

## 完了済みマイルストーン

- 2026-07-07: v1.0 タグ凍結(667cb5a)、2.0スコープ合意・文書化

## 次のアクション(キュー)

1. P1 PR のレビュー・E2E裏取り・マージ
2. P2 スパイク結果の評価 → 方式確定(リグ vs プロシージャル)→ 本パイプライン化
3. P4 sim側(elevation型・A*・崖坂)を P2/P3 と並行でレーン起動
4. マイルストーンごとに非ブロッキング報告(画像付き)を出す

## 運用メモ

- コミット規約: `v$(date +%y%m%d%H%M)` スナップショット、PRはCI green条件付きマージ
- E2E はポート5179専有 → 直列実行。ゾンビ vitest は `pkill -f "[v]itest"`
- 実画面スクショはシーン構築 ~15秒待ち必須(waitForTimeout(18000))
- Blender: `ASAMA_BLENDER_BIN=/nix/store/s0jp4xvpkzc3j00xf7m4d5j385k487lj-blender-5.1.1/bin/blender`
- registry.py を変更すると全レンダーキャッシュ無効化 → 触るときは覚悟を決めてから
- 上限例外: codex/claude のサブスク上限に達しそうな場合のみユーザーに相談(それ以外は止まらない)
