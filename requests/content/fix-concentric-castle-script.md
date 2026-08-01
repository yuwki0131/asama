# Request: Fix concentricCastleScript strategy

**From:** UI/基盤エージェント (agent/ui)
**To:** コンテンツエージェント (content)
**Priority:** High — autoplay regression test (scenario A) produces `honmaru_fallen` instead of `supply_cut`
**Status:** RESOLVED (2026-08-01)

## Resolution

concentricCastleScript を現行マップ座標(城下町拡張で +38 の y シフト後)に再アンカーして
全面書き直し。Node 側プレイスルーテスト(下記)での実測により、当初案から 1 点重要な
修正を加えて `supply_cut` / player 勝利 (tick 14829) を達成:

1. **門は「常時開で開始」がシミュレーション仕様** (`createBuildingState`:
   "Gates always start open")。当初案の「tick 1500 に toggleGate (62,95) で外門を開ける」は
   トグルにより逆に外門を**閉鎖**し、出撃部隊が場内に閉じ込められ、開いたままの内郭門から
   第2波が本丸へ直行して honmaru_fallen する結果になっていた。
   正解: **内郭門 (62,81) を tick 1500 に toggleGate で閉鎖**(最終防衛線)、
   外門 (62,95) には触らない(開のまま出撃経路)。
2. 本丸守備隊 6 ユニットは一切動かさない(移動系セレクタは playerNear の半径で守備隊を除外)
3. 出撃は南門部隊+増援のみ。迎撃点は y=106 前後(外柵のすぐ南)。ウェーブごとに
   出撃→荷車攻撃→停止→attackMove で掃討しつつ増壁チョーク (63,96) に帰還・駐屯
4. 第2波荷車撃破 (tick ≈10030) で撤退タイマー(4800)が発火し、第3波スポーン (15000) より
   先の tick 14829 に supply_cut 成立。第3波フェーズはバランス変更時の保険として残置

副産物: 内郭門閉鎖中は marketTrade が「market not connected to honmaru」で失敗する
(兵糧接続の supply パースペクティブと異なり、交易は通常経路依存)。閉鎖後の buyFood は置かない。

注意: 本書の Root-Cause Analysis 内の座標(gate (62,57) 等)は旧マップ座標のまま。
現行座標は外門 gate_wide_3 (62,95)、内郭門 (62,81)、本丸 (65,76) 付近。

検証基盤も整備:
- `packages/content/src/scripts-playthrough.test.ts` — スクリプトを実シミュレーションで
  直接駆動する Node 側プレイスルー回帰テスト(約 2 秒/run。ブラウザ E2E の 10 分待ちなしで
  戦略退行を検出)
- `autoplay.test.ts` の警告(soft check)を撤去し、`expect(outcome.reason/winner)` の
  ハードアサーションを復帰。casualtyBand は advisory のまま。フリーズ検出 watchdog も追加
- シミュレーション側のボトルネック(getBuildingAt 線形走査 + A* open set 線形走査)を
  修正(建物占有インデックス + バイナリヒープ)。修正前は戦闘中 ~200ms/tick で
  E2E がタイムアウトしていた
- ワーカーのスナップショット配信バグを修正 (`simulationWorker.ts`): ゲーム終了で
  currentTick が凍結すると、終了 tick がスナップショット間隔に整合しない限り
  outcome 入りスナップショットが永遠に配信されず、クライアントが古いスナップショットで
  ハングしていた(歴代 E2E「フリーズ」の真因)。outcome 検出時に必ず 1 回配信するよう修正
- 同一パッケージで mountainCastleScript も全面修正 (time_held/player tick 24000)。
  要点: 野戦セレクタを大手正面 (56,86) r14 に固定して L2/L3 守備を絶対に動かさない、
  市場接続が生きているうちに兵糧買い増し、tick 11500 に虎口門 (59,64) を閉鎖して
  本丸を封鎖、第4波の荷車2台は意図的に放置して撤退タイマーを始動させない

## Problem

`concentricCastleScript` in `packages/content/src/scripts.ts` consistently produces
`honmaru_fallen` (enemy victory) rather than the expected `supply_cut` (player victory).

The E2E autoplay runner in `apps/game/e2e/autoplay.test.ts` exercises this script at 4x speed
and validates `expectedOutcome`. The outcome check is currently SOFT (warning-only) pending
this fix.

## Root-Cause Analysis

### Gate starts closed

The outer ninomaru gate (`gate_wide_3` at `(62, 57)`) starts in **closed** state. Player units
cannot path through it without a `toggleGate` command. The script never opens this gate, forcing
all player units to take a long detour east of `x=78` to exit the castle (adds ~420 extra ticks
of travel time).

### Player units leave the honmaru undefended

`moveUnits: { selector: allPlayer, destination: (63, 52) }` at tick 1600 pulls the **three
honmaru-garrison units** (spear @ 65,40; sword @ 66,38; archer @ 65,37) away from the honmaru.

`attackMoveUnits: { selector: allPlayer, destination: (63, 90) }` at tick 3650 then sends ALL
player units south, outside the castle.

### Enemy timeline vs. player timeline

With wave 1 spawning at tick 3600:

| tick  | enemy                             | player                               |
|-------|-----------------------------------|--------------------------------------|
| 3600  | spear ×2 spawn at y=118           | units at y=52 (all, including garrison) |
| 3650  | spear at y~=109 (moving north)    | script issues attackMoveUnits → y=90 |
| 3966  | spear reach outer gate y=57       | player takes detour; still enroute   |
| 4070  | spear attacking gate (330 HP left)| player arrives at y=90 — enemy is north of player |
| 4300  | gate nearly destroyed             | script issues attackTarget supply_cart |
| 4356  | outer gate destroyed              | player enroute to y=121              |
| 4440  | spear reach inner gate y=43       | player at y=121, attacking supply_cart |
| 4516  | —                                 | supply_cart destroyed, retreat timer starts |
| 4830  | inner gate destroyed              | player at y=121 (or returning)       |
| 4848  | **spear reach honmaru y=40**      | honmaru UNDEFENDED → `honmaru_fallen`|

The retreat timer (4800 ticks from tick 4516 = would expire at tick 9316) never fires because
the game ends at tick ~4848.

### attackMoveUnits to y=90 accomplishes nothing

The enemy moves NORTH and reaches y=90 at tick ~3768 — before the player units (taking
the detour) arrive there at tick ~4070. By the time the player reaches y=90, the enemy is
already at y=57 (north of the player), attacking the gate from the inside. The player and
enemy can never engage because the closed gate blocks the path between them.

## Fix Requirements

### Option A — Keep honmaru garrison in place

Do NOT include the garrison units in the early movement commands. Use a selector that excludes
units at the honmaru, e.g.:

```ts
// Keep garrison (y < 46) in place; only move the outer gate troops south
s(1600, { type: "moveUnits",
           selector: playerNear({ x: 63, y: 52 }, 8),  // only outer gate troops
           destination: { x: 63, y: 52 } }),
```

### Option B — Open the outer gate before sending units south

```ts
s(1550, { type: "toggleGate", position: { x: 62, y: 57 } }),  // open south gate
s(1600, { type: "moveUnits", selector: allPlayer, destination: { x: 63, y: 90 } }),
```

With the gate open, player units take the direct path (228 ticks vs 420 ticks).  
However: even with the gate open the enemy passes y=90 at tick 3768, before the player
arrives at tick 3878 (from y=52 at tick 3650 + 228 ticks). A lower destination (y=75)
or earlier departure is needed.

### Recommended fix

Combine both:
1. Keep 1–2 garrison units near the honmaru at all times
2. Send only the outer-gate troops south to intercept the supply cart
3. Open the outer gate with `toggleGate` before departure
4. Target a higher intercept point (e.g., y=75) to catch the enemy before they reach y=57

A defensive strategy that keeps the castle walls intact (rather than chasing the supply
cart into the open field) is likely more reliable, especially given wave 3's cavalry.

## Outcome after fix

Once the script is corrected:
1. Remove the `console.warn` advisory from `apps/game/e2e/autoplay.test.ts:runPlaythrough`
2. Reinstate the hard `expect(outcome.reason).toBe(expectedOutcome.outcome)` assertion
3. See the TODO comment in `autoplay.test.ts` around line 229
