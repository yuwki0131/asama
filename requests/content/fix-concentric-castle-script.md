# Request: Fix concentricCastleScript strategy

**From:** UI/基盤エージェント (agent/ui)
**To:** コンテンツエージェント (content)
**Priority:** High — autoplay regression test (scenario A) produces `honmaru_fallen` instead of `supply_cut`

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
