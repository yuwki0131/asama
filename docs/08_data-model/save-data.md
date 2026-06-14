# セーブデータ

## 保存先

ローカルNode.jsサーバーを介して実ファイルへ保存します。

```text
saves/manual/
saves/autosave/
saves/quicksave/
```

IndexedDBは補助キャッシュ用途です。

## 保存形式

独自拡張子例:

```text
.jcastle
```

初期版は圧縮JSONで構いません。

## 必須メタデータ

- formatVersion
- gameVersion
- saveId
- saveName
- createdAt
- updatedAt
- scenarioId
- playTime
- currentTick

## 保存対象

- マップ地形・改変
- 本丸
- 建物
- ユニット
- 経路・命令状態
- 蔵と兵糧
- 荷車
- 人口・支持率・徴兵枠
- 資源
- 暦・季節
- シナリオ進行
- seed付き乱数状態
- 次回接続判定時刻

## 保存方法

- tick境界でスナップショット作成
- 一時ファイルへ書き込み
- 読み戻し・検証
- 正式ファイルへ置換

## オートセーブ

- 5分ごと
- 攻城戦開始前
- 攻城戦終了後
- 3〜5世代ローテーション

## 互換性

- マイグレーション関数をバージョンごとに用意
- 永続IDを表示名から分離
- 読めないセーブは明示的にエラー表示
