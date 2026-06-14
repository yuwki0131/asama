# Worker Communication

## 基本方針

Web Workerをシミュレーションの実行場所とします。メインスレッドはUI入力、PixiJS描画、ローカルサーバーとの通信を担当します。

通信形式は、MVPではTypeScriptの判別可能unionを使った構造化メッセージにします。転送量が問題になるまで、独自バイナリ形式は採用しません。

## メッセージ分類

### Main to Worker

- init
- loadScenario
- loadSave
- setSpeed
- enqueueCommand
- requestSnapshot
- requestSaveSnapshot
- pause
- resume

### Worker to Main

- ready
- snapshot
- event
- commandRejected
- saveSnapshot
- error
- metrics

## スナップショット

スナップショットは、描画とUIに必要な読み取り専用データです。

MVP初期では、毎描画フレームではなくWorker側で間引いて送信します。

```text
targetSnapshotRate = 10 snapshots / second
```

重要イベント、選択結果、勝敗状態の変化は、次の定期スナップショットを待たずに送れます。

## コマンド拒否

不正な操作はWorker内で拒否し、`commandRejected` を返します。

例:

- 建築不可セルへの建築
- 存在しないユニットへの命令
- 資源不足
- 敵付近建築禁止
- 既に破壊された建物への操作

UI側でも事前表示は行いますが、最終判定はWorker側です。

## エラー

復旧可能なエラーは通常イベントとして扱います。シミュレーション継続不能なエラーだけ `error` として扱い、ゲームを停止します。

## 型共有

メッセージ型は `packages/shared` に置きます。Worker固有の内部状態型は共有しません。

## 将来拡張

通信量が問題になった場合は、差分スナップショット、TypedArray、座標配列の転送へ移行します。MVP初期からその形式を前提にしません。

## 制約

- `../01_overview/design-principles.md`に従う
- `../10_development/mvp-scope.md`の範囲を超えない
- 未確定事項は`../10_development/unresolved-issues.md`へ記録する
