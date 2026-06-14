# Architecture

## MVP技術方針

MVPは、ローカルNode.jsサーバー上で動くWebアプリとして実装します。

- 言語: TypeScript
- アプリ基盤: Vite
- UI: React
- 描画: PixiJS
- シミュレーション: Web Worker
- サーバー: Node.js
- テスト: Vitest

Electron等のデスクトップパッケージ化はMVP後に検討します。MVPでは、ローカルサーバーを起動してChromium系ブラウザでプレイできる状態を完成条件にします。

## レイヤー構成

```text
apps/game/
  client/
    ui/
    renderer/
    worker-client/
  server/
packages/
  simulation/
  content/
  shared/
  asset-tools/
```

### client/ui

ReactでHUD、パネル、メニュー、警告、保存画面を扱います。

UIはシミュレーション状態の表示とプレイヤー入力の発行だけを担当し、ゲームルールを直接変更しません。

### client/renderer

PixiJSでマップ、建物、ユニット、オーバーレイを描画します。

描画層はシミュレーションのスナップショットを読み取り、補間と表示順制御を行います。戦闘判定、経路探索、勝敗判定は持ちません。

### client/worker-client

メインスレッドとWeb Workerの通信をラップします。

UI・描画層からは、WorkerのpostMessageを直接呼ばず、この層のAPIを経由します。

### server

ローカルファイル保存、定義データ配信、アセット配信を担当します。

外部公開はしません。開発中も本番相当もlocalhostで動かします。

### packages/simulation

ゲームルール本体です。

PixiJS、React、DOM、Node.js APIへ依存しません。入力コマンド、定義データ、シナリオ、乱数seed、現在状態から次状態を決定します。

### packages/content

兵種、建物、地形、攻城作業、シナリオ定義を保持します。

初期形式はJSONCにします。実装側では起動時にスキーマ検証した後、型付きデータとして扱います。ビルド後または配信時はコメントを含まないJSONとして扱って構いません。

### packages/shared

ID型、座標型、通信メッセージ型、保存形式型など、複数レイヤーで共有する純粋な型と小さなユーティリティを置きます。

## 依存方向

```text
ui -> worker-client -> shared
renderer -> shared
worker -> simulation -> content -> shared
server -> shared
```

禁止する依存:

- `simulation` から `ui`、`renderer`、`server` への依存
- `simulation` からDOM、PixiJS、Reactへの依存
- 定義IDによる特別分岐の乱立

## 状態管理

権威状態はWeb Worker内のWorldだけです。

メインスレッドは表示用スナップショットを保持できますが、ゲーム進行の正本にはしません。UI操作は必ずコマンドとしてWorkerへ送ります。

## ID方針

- 定義ID: 人間が管理する安定ID
- 実体ID: セーブ内で一意な永続ID
- 表示名: 変更可能で、IDとして使わない

実体IDはセーブ・ロード後も変化させません。

## 最初の縦切り

Phase 1からPhase 3の途中までを、次の縦切りで実装します。

1. 128x128の固定マップを表示する
2. セル選択とカメラ操作ができる
3. Worker内でtickが進む
4. 1体のユニットを選択して移動命令を出せる
5. 簡易A*で地形コストを反映する
6. スナップショット経由でユニット位置を描画する
7. セーブ用Worldスナップショットを生成できる

この縦切りでは、戦闘、内政、AI、正式アセットは実装しません。

## 制約

- `../01_overview/design-principles.md`に従う
- `../10_development/mvp-scope.md`の範囲を超えない
- 未確定事項は`../10_development/unresolved-issues.md`へ記録する
