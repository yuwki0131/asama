# 2.0 ラン状態(生きた文書 — 統括が常に最新化する)

> セッション断絶からの回復手順: このファイルと `release-2.0-scope.md` を読む → 「進行中」の項目を確認 → 未完了ブランチ/PRの状態を `gh pr list` と `git branch -a` で照合 → 走行を再開。ユーザーへの中間確認は不要(契約済み)。

## 現在のフェーズ

- **完了してmainに統合済み**: P1描画コア(#23)、P4a高低差sim(#24)、P2アニメパイプライン+足軽4アクション(#25)、トーンC実装(#26)
- **進行中**: P4bレンダラー高低差 / P4c段差タイル / P5山城シナリオ / P6a戦闘イベント配信

## 進行中の作業

| 作業 | ブランチ | 状態 |
|---|---|---|
| P4b: レンダラー高低差(24px/段オフセット、崖・坂合成、段対応ヒット判定、タイル未達時はポリゴン代替) | agent/v2-elevation-render | エージェント実装中 |
| P4c: 段差タイル制作(岩肌/石垣の崖面S,E・SE角・土坂/石段、registry.py非改変の隔離パターン) | agent/v2-elevation-tiles | エージェント実装中 |
| P5: 山城シナリオ(縄張り設計文書+content実装、論理成立まで) | agent/v2-yamajiro | エージェント実装中 |
| P6a: 戦闘イベント配信(attack_melee/ranged・damage・unit_died・building_destroyed をスナップショットへ) | agent/v2-combat-events | エージェント実装中 |

## 完了済みマイルストーン

- 2026-07-07: v1.0 タグ凍結(667cb5a)、2.0スコープ合意・文書化
- 2026-07-07: 補足合意5件(カメラ固定※回転は3.0筆頭候補/架空の城/サウンドなし・BGM最下位/**トーン=渋く重厚**)を scope に追記
- 2026-07-07: **P2スパイク成立**(agent/v2-anim-pipeline, 0502b05)。リグ+キーフレーム→8方向シート方式を採用確定。実測0.028s/フレーム、全量産1,536枚≒1分強、律速はモデリング工数。残リスク: 騎馬(四足歩様)・荷車はヒト型リグ流用不可
- 2026-07-07: **P1 描画コア完了**(PR#23)。60fps Pixi ticker、補間の純関数化(`interpolation.ts`、アンチポップ=乖離≤0.75pxスナップ/≥96px即スナップ/中間は指数収束τ=30ms)、保持型シーン(`RetainedScene`: ユニットMap保持+毎フレームY-sortのみ、建物・植生はシグネチャ変化時のみ再構築、isoSort無変更)、`__asamaTest.getFps()`。テスト313+E2E16全緑。マップ初回のみ送信はmain実装済みと判明。**注意**: ヘッドレスSwiftShaderは~10fps(環境要因、main同等)→60fps受け入れ判定は実GPUで
- 2026-07-07: **P2本実装完了**(PR#25)。unit-animations.json スキーマ(actions/frames/fps/loop/directions)、シート=列フレーム×行方向(S,SE,E,NE,N,NW,W,SW固定)、manifest animationsセクション(後方互換)、専用render-cache/anim/。既存387アセットはキャッシュ無傷(rendered 0)。足軽4アクション(walk8f/idle/attack槍突き/death)×8方向を量産品質(部位分割+bevel+陣笠)で出荷。騎馬=複合リグ・荷車=車輪ボーンの展開案は docs/10_development/animation-pipeline.md
- 2026-07-07: **トーンC実装完了**(PR#26)。toneGrade.ts(合成済み20要素行列、filter.matrix直代入。filterArea設定は禁物=ローカル座標の罠)、aerialOverlay.ts(スクリーン固定霞)、__asamaTest.setTone。E2Eは期待色をC行列+霞ブレンドで事前計算する方式に更新(トーンONの画のまま全緑)。**潜在バグ修正**: parsePngがRGBA前提でPlaywrightのRGB(colortype2)スクショのピクセル判定が実質無効化していた→RGB/RGBA両対応
- 2026-07-07: **ルック開発完了**。4案比較(assets/intermediate/spike/lookdev/)→ **C案採用**: sat0.70・gain(1.03,1.0,0.95)・contrast1.10・offset(−0.010,−0.005,+0.012)。単一4x5マトリクスで表現可(合成済み係数は lookdev-report.md。Pixiのsaturate()プリセット不使用、行列直代入)。空気遠近=スクリーン固定グラデSprite(#c7cdd6、上端20%→高さ55%で0%)をワールド上・UI下に。敵tint赤・選択リング金の視認性は検証済みほぼ無傷。夜/雨を将来重ねる時は contrast→1.06 の逃げ道

## 次のアクション(キュー)

1. 進行中4レーンのPRを順次レビュー・検品・マージ(P4b+P4c+P5が揃ったら山城の実画面統合検証)
2. P4bマージ後: クライアントのアニメ再生系(状態機械 idle/walk/attack/death、方向規約S,SE,E,NE,N,NW,W,SW、位相オフセット)→ P3量産(残り5ユニット種+建物の旗・煙)
3. P6aマージ後: P6bエフェクト描画(矢の軌跡・鉄砲煙/閃光・ヒット・死亡演出)
4. 残: 植生・水面アニメ(シェーダー実験)、ローディング表示、シナリオ選択UI、P7総合エンハンス+受け入れ判定(60fpsは実GPUで)
5. マイルストーンごとに非ブロッキング報告(画像付き)

## 運用メモ

- コミット規約: `v$(date +%y%m%d%H%M)` スナップショット、PRはCI green条件付きマージ
- E2E はポート5179専有 → 直列実行。ゾンビ vitest は `pkill -f "[v]itest"`
- 実画面スクショはシーン構築 ~15秒待ち必須(waitForTimeout(18000))
- Blender: `ASAMA_BLENDER_BIN=/nix/store/s0jp4xvpkzc3j00xf7m4d5j385k487lj-blender-5.1.1/bin/blender`
- registry.py を変更すると全レンダーキャッシュ無効化 → アニメ基盤は別レジストリ/ドライバに隔離する方針
- 上限例外: codex/claude のサブスク上限に達しそうな場合のみユーザーに相談(それ以外は止まらない)
