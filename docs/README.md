# 日本城郭RTS 仕様書

## 目的

本ディレクトリは、Stronghold風の操作感を基礎とし、日本の応仁の乱期から江戸時代初期までを題材にした、ローカル実行型シングルプレイヤーRTSの仕様をまとめたものです。

主なゲーム要素は次のとおりです。

- 日本城郭の築城
- 城下町の造営
- 人口・徴税・徴兵
- 兵糧備蓄と補給
- 攻城・籠城・野戦
- 個兵単位のリアルタイム操作

本作は完全な史実再現ではなく、当時の施設・兵種・城郭・都市要素を組み合わせた「歴史風ゲーム」です。

## 文書の優先順位

仕様が矛盾した場合は、次の順序で解釈します。

1. `10_development/mvp-scope.md`
2. 各機能の詳細仕様
3. `01_overview/design-principles.md`
4. `10_development/unresolved-issues.md`

未確定事項をCoding Agentが独自判断で恒久仕様化してはいけません。暫定実装が必要な場合は、調整可能なパラメータとして実装し、`unresolved-issues.md`へ記録してください。

## 章構成

- [01_overview](./01_overview/): 企画概要、設計原則、用語
- [02_game-rules](./02_game-rules/): 時間、勝敗、人口、兵糧、建築、収穫
- [03_combat](./03_combat/): 操作、戦闘、経路探索、攻城
- [04_content](./04_content/): 兵種、建物、城郭、天守、資源
- [05_map-and-art](./05_map-and-art/): マップ、アート、アセット生成
- [06_ui](./06_ui/): HUD、パネル、オーバーレイ、操作
- [07_scenarios](./07_scenarios/): シナリオ、MVP、AIプロファイル
- [08_data-model](./08_data-model/): 概念モデル、セーブ、定義データ
- [09_technical-design](./09_technical-design/): 技術設計。現時点では雛形
- [10_development](./10_development/): MVP範囲、ロードマップ、テスト、未解決事項

## Coding Agent向け推奨読書順

1. 本ファイル
2. `10_development/mvp-scope.md`
3. `01_overview/design-principles.md`
4. 実装対象機能の詳細仕様
5. `10_development/unresolved-issues.md`

## 現在の確定事項

- シングルプレイヤー専用
- ローカルPCで実行し、インターネット公開しない
- Web技術を利用するローカルゲーム
- 1プレイ約90分相当
- 固定アイソメトリック視点
- 個兵単位の操作
- 住民は自律行動し、直接操作不可
- 本丸が防衛側の最終目標
- 天守は任意の大型防御施設
- 兵糧が攻城戦の主要制約
- MVPでは梯子、門破壊、堀埋めのみ実装
- MVPでは火災、大筒、大砲、Fog of Warを実装しない
