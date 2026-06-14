# 技術設計

この章はMVPの技術方針を定義します。

ここで決めた内容は、MVP実装の初期方針です。性能・保守性・実装負荷の問題が明確になった場合は、該当文書を更新してから実装を変更します。

## 既定方針

- TypeScript
- Web技術によるローカルPCゲーム
- Chromium系最新版を基準
- Vite
- PixiJS系2D描画
- React系UI
- シミュレーションは描画・DOMから分離
- Web Workerでシミュレーション実行
- ローカルNode.jsサーバー
- FastifyによるローカルAPI
- 実ファイルへのセーブ
- JSON + gzip形式の`.jcastle`セーブ
- Blenderアセット生成パイプライン
- Vitestによる自動テスト

## 文書

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
