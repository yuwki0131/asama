# Persistence

## 基本方針

セーブはローカルNode.jsサーバーを介して実ファイルへ保存します。

MVP初期形式:

```text
JSON + gzip
extension: .jcastle
```

保存形式は内部的にはJSONオブジェクトとし、書き込み時にgzip圧縮します。

## 保存フロー

1. メインスレッドがWorkerへ保存要求を送る
2. Workerがtick境界でWorldスナップショットを作る
3. メインスレッドがローカルサーバーへ送る
4. サーバーが一時ファイルへ書く
5. サーバーが読み戻してJSONとメタデータを検証する
6. 正式ファイルへ置換する

シミュレーション中のWorldをメインスレッド側で組み立て直して保存してはいけません。

## 保存対象

`../08_data-model/save-data.md` の保存対象に従います。

特に次の状態は必須です。

- currentTick
- 乱数状態
- 次回周期処理tick
- 実体ID採番状態
- ユニットの命令・経路
- シナリオイベントの発火済み状態

## 保存ファイル

ファイル構造:

```text
{
  "formatVersion": 1,
  "gameVersion": "...",
  "metadata": {},
  "contentVersions": {},
  "world": {}
}
```

`contentVersions` には、使用した定義データとシナリオのバージョンまたはハッシュを保存します。

## 読み込み

読み込み時は次の順に処理します。

1. gzip展開
2. JSON parse
3. formatVersion確認
4. マイグレーション
5. スキーマ検証
6. 定義ID存在チェック
7. WorkerへWorldを渡す

読めないセーブはUIに明示し、失敗した理由を保存ログに残します。

## オートセーブ

オートセーブは `saves/autosave/` に保存し、MVP初期は5世代ローテーションにします。

保存タイミング:

- 5分ごと
- 攻城戦開始直前
- 攻城戦終了直後

## IndexedDB

IndexedDBはMVPでは必須にしません。必要になった場合も、セーブ正本ではなく一時キャッシュ用途に限定します。

## 制約

- `../01_overview/design-principles.md`に従う
- `../10_development/mvp-scope.md`の範囲を超えない
- 未確定事項は`../10_development/unresolved-issues.md`へ記録する
