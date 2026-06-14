# Simulation Loop

## 基本方針

シミュレーションは固定tickで進めます。描画フレームレートとは分離し、同じ入力、同じ定義データ、同じseedで同じ結果になることを優先します。

## tick

MVP初期値:

```text
20 ticks / second
1 tick = 50 ms
```

この値は技術未確定事項から外し、MVPの初期実装値とします。将来変更できるよう、`SIM_TICKS_PER_SECOND` のような設定値として集中管理します。

20tpsを採用する理由:

- 90分プレイでもtick数が過剰にならない
- RTSの移動、攻撃間隔、攻城作業を十分表現できる
- セーブデータとリプレイ検証の扱いが単純
- Workerとメインスレッド間のスナップショット転送負荷を抑えやすい

## 時間変換

`docs/02_game-rules/game-flow-and-time.md` の暦時間は次のtick数へ変換します。

| 単位 | 1倍速秒数 | tick数 |
|---|---:|---:|
| 1か月 | 75秒 | 1,500 |
| 1季節 | 225秒 | 4,500 |
| 1年 | 900秒 | 18,000 |
| 6年 | 5,400秒 | 108,000 |

ゲーム速度はtick処理の進行量で表現します。

- 一時停止: 0倍
- 1倍: 実時間1秒あたり20tick
- 2倍: 実時間1秒あたり40tick
- 4倍: 実時間1秒あたり80tick

## ループ

Workerは蓄積時間方式でtickを進めます。

```text
receive commands
accumulate elapsed time * speed
while accumulated >= tickDuration:
  apply queued commands for currentTick
  update simulation one tick
  currentTick += 1
  accumulated -= tickDuration
publish snapshot
```

ブラウザタブが停止・低頻度化した場合は、1フレームで処理する最大tick数を制限します。制限を超えた分は次フレームへ持ち越し、UIに処理遅延を表示できるようにします。

## tick内処理順

1. 入力コマンド適用
2. シナリオイベント発火
3. 経路・命令更新
4. 移動
5. 攻撃・射撃・建物攻撃
6. 攻城作業
7. 建物破壊・ユニット死亡処理
8. 本丸占領判定
9. 兵糧・接続などの周期処理
10. 暦・内政の周期処理
11. 勝敗判定
12. スナップショット更新

同tick内の同種処理は、永続IDの昇順で解決します。

## コマンド

プレイヤー操作は、即時状態変更ではなくコマンドとして扱います。

MVP初期コマンド:

- selectUnits
- moveUnits
- attackMove
- holdPosition
- placeBuilding
- demolishBuilding
- openGate
- closeGate
- setTaxRate
- recruitUnit
- buyFood
- saveRequested

コマンドには `issuedAtTick` と `clientSequence` を含めます。MVPはシングルプレイヤーなのでネットワーク遅延補償は行いません。

## 乱数

乱数はseed付きの疑似乱数を `simulation` 内に閉じ込めます。

乱数状態はセーブ対象です。接続判定の揺らぎ、AIの軽微な選択、シナリオイベントのばらつきに使います。

## 周期処理

周期処理は `nextTick` をWorldに保存し、条件を満たしたtickで実行します。

- 本丸と蔵の接続判定: 8〜12秒相当のseed付き揺らぎ
- 兵糧消費: 接続判定周期に合わせる
- 月次内政: 1,500tickごと
- 季節変更: 4,500tickごと
- 収穫: 秋終了時

周期処理の次回tickはセーブ対象です。

## 制約

- `../01_overview/design-principles.md`に従う
- `../10_development/mvp-scope.md`の範囲を超えない
- 未確定事項は`../10_development/unresolved-issues.md`へ記録する
