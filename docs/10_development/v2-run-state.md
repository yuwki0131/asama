# 2.0 ラン状態(生きた文書 — 統括が常に最新化する)

> セッション断絶からの回復手順: このファイルと `release-2.0-scope.md` を読む → 「進行中」の項目を確認 → 未完了ブランチ/PRの状態を `gh pr list` と `git branch -a` で照合 → 走行を再開。ユーザーへの中間確認は不要(契約済み)。

## 現在のフェーズ

- **2.0 完了 + 2.1 拡張対応中**
- 完了してmainに統合済み: P1〜P7全17PR(#23〜#36) + 追加修正 #37・#38・#41

## 進行中の作業 (2026-07-11現在)

| PR | 内容 | 状態 |
|---|---|---|
| #39 feat/gate-wide-3 | 門1×3・中央セルのみ通行可 | E2E修正中(fix agent走行) |
| #40 fix/blender-asset-quality | 坂タイル土質感・天守二重描画解消・背景黒化 | CI再走行中(rebase済) |
| #42 docs/readme-game-showcase | README ゲーム紹介ページ化 | CI待ち |
| #43 feat/terrain-building | 盛土/削土/坂設置/坂撤去コマンド+UI(Stronghold方式) | CI待ち |
| (PR未) free-play scenario | 無制限リソース・ゲームオーバーなしサンドボックス | agent走行中 |

## 完了済みマイルストーン

- 2026-07-07: v1.0 タグ凍結(667cb5a)、2.0スコープ合意・文書化
- 2026-07-07: 補足合意5件(カメラ固定※回転は3.0筆頭候補/架空の城/サウンドなし・BGM最下位/**トーン=渋く重厚**)を scope に追記
- 2026-07-07: P1〜P6a 全完了(PR#23〜27)。高低差4段(sim/描画/タイル)、アニメパイプライン基盤、トーンC、戦闘イベント配信
- 2026-07-07: **P4b/P4c 完了**(#28・#29)。石垣/岩肌 34タイル量産・Yオフセット描画・ヒット判定対応・E2E5テスト全緑
- 2026-07-07: **P5 山城シナリオ完了**(#30)。霞ヶ峰城(三段石垣曲輪・大手/搦手/虎口坂路・4波ウェーブ・holdTicks=24000)。全129コンテンツテスト緑
- 2026-07-07: **P2+ アニメ再生クライアント完了**(#31)。RetainedScene状態機械(idle位相オフセット/walk/attack1サイクル/deathフェードアウト)・8方向量素・dyingVisuals処理・fallback=静的スプライト継続。unit.assetIdは `*.idle.south` サフィックス形式(注意点)
- 2026-07-07: **P3 全6種アニメ量産完了**(#32)。弓(弓引き)・鉄砲(発砲+反動)・騎馬(19骨格コンパウンドリグ/対角対トロット)・工兵(オーバーヘッドスラム)・荷車(車輪ボーン)。22スプライトシート(37K〜145K)、manifest.json 22エントリ更新
- 2026-07-07: **P6植生・建物アニメ完了**(#33)。deco.tree.*+deco.bamboo.*揺れ(sin波・位相ハッシュ)、yagura/tenshu/honmaruに旗ペナントFlutter(Graphics)。水面シマーはterrain層の構造上skipped
- 2026-07-07: **1.0残課題UI完了**(#34)。ローディング画面(点滅アニメ・日本語ステータス)・シナリオ選択UI(4シナリオカード・山城GOLD枠NEW)。DEV_SCENARIO_IDバイパス健在
- 2026-07-07: **P6b戦闘エフェクト完了**(#35)。EffectsLayer(矢軌跡400ms/鉄砲閃光+煙700ms/ヒットスパーク250ms/建物崩壊煙600ms)。GameCanvas.tsx merge時コンフリクト解消(timeSec+effectsLayer両立)
- 2026-07-07: **P7 最終受け入れパス完了**(#36)。E2E全25テスト緑(7ファイル)・山城シナリオautoplay holdTicks=24000 time_held勝利確認・4シナリオ視覚回帰スクリーンショット取得・フォールバックスプライト0確認。DEVオーバーレイ誤検知バグ修正(Debug toggle事前クリック)
- 2026-07-10: **シナリオ選択バグ修正**(#37)。scenarioForId が全IDを DEFAULT_SCENARIO に落としていた。scenarios.find() に修正。content tsconfig.json から test.ts を除外
- 2026-07-10: **高低差レンダラー品質改善**(#38)。ELEVATION_PIXELS_PER_LEVEL 24→40px。NW/NE 上辺キャップ線(dark brown 2px)追加。elevation.test.ts座標更新
- 2026-07-10: **歩行アニメーション実装**(#41)。sceneLayer.ts walk state 遷移修正(unit.type キー修正)・アニメ6箇所のシートキー参照を正しいパターンに統一

## 次のアクション(キュー)

1. PR #39 E2E 修正 → merge
2. PR #40 CI pass → merge
3. PR #42, #43 CI pass → merge
4. free-play agent 完了後 PR 作成 → merge
5. 全PR統合後 v2-run-state.md 最終更新

## 運用メモ

- コミット規約: `v$(date +%y%m%d%H%M)` スナップショット、PRはCI green条件付きマージ
- E2E はポート5179専有 → 直列実行。ゾンビ vitest は `pkill -f "[v]itest"`
- 実画面スクショはシーン構築 ~15秒待ち必須(waitForTimeout(18000))
- Blender: `ASAMA_BLENDER_BIN=/nix/store/s0jp4xvpkzc3j00xf7m4d5j385k487lj-blender-5.1.1/bin/blender`
- registry.py を変更すると全レンダーキャッシュ無効化 → アニメ基盤は別レジストリ/ドライバに隔離する方針
- 上限例外: codex/claude のサブスク上限に達しそうな場合のみユーザーに相談(それ以外は止まらない)
