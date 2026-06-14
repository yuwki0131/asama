# 技術設計

この章は次の議論で確定します。現時点では、ゲーム仕様から導かれる制約だけを記載します。

## 既定方針

- TypeScript
- Web技術によるローカルPCゲーム
- Chromium系最新版を基準
- PixiJS系2D描画を第一候補
- React系UIを第一候補
- シミュレーションは描画・DOMから分離
- Web Workerでシミュレーション実行
- ローカルNode.jsサーバー
- 実ファイルへのセーブ
- Blenderアセット生成パイプライン

## 今後作成する文書

- `architecture.md`
- `simulation-loop.md`
- `rendering.md`
- `worker-communication.md`
- `persistence.md`
- `local-server.md`
- `asset-tooling.md`

## 技術設計時の注意

- 仕様を技術都合で無断変更しない
- シミュレーション層をPixiJS・Reactへ依存させない
- 兵種・建物・シナリオはデータ駆動
- セーブ互換性を初期から考慮
- アセット生成物とソースを分離
