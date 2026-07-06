# Request: Scenario selection via __asamaTest bridge

**From:** UI/基盤エージェント (agent/ui)
**To:** シミュレーションエージェント (agent/sim or main)
**Priority:** Medium — required to unlock autoplay tests for scenarios B and C

## Background

The autoplay E2E runner (`apps/game/e2e/autoplay.test.ts`) drives `PlaythroughScript`
instances from `@asama/content` through the game at 4x speed. Each script targets
a specific scenario by `scenarioId`. Currently the game always loads the default
scenario (`concentricCastleScenario`) at startup, making it impossible to run
scripts for `linear-fortress` or `riverside-defense` without navigating to a
different URL or adding a bridge API.

## Requested change

Add a `loadScenario(scenarioId: string): Promise<void>` method to `AsamaTestBridge`
(defined in `apps/game/src/client/testBridge.ts`):

```ts
export interface AsamaTestBridge {
  // … existing methods …
  /**
   * Resets the simulation to the beginning of the named scenario.
   * Only available in DEV mode (import.meta.env.DEV).
   * Resolves once the first snapshot of the new scenario is received.
   */
  loadScenario(scenarioId: string): Promise<void>;
}
```

## Implementation hints

1. `apps/game/src/client/ui/App.tsx` initialises the `SimulationClient` in a `useEffect`.
   The easiest approach is to expose a `loadScenario` function that:
   a. Calls `simulationRef.current?.dispose()` (or sends a reset message to the worker).
   b. Passes `scenarioId` when creating a new `SimulationClient` (or adds a
      `resetScenario(scenarioId)` method to `SimulationClient`).
   c. Waits for the first snapshot from the new simulation instance.

2. `packages/simulation/` worker would need to support a `{ type: "resetScenario", scenarioId }` 
   `MainToWorkerMessage` variant, or the worker can be replaced entirely via a new
   `createSimulationClient(scenarioId)` call.

3. `@asama/content` exports `scenarios: readonly ScenarioDefinition[]` which the
   simulation worker can use to look up the correct scenario by id.

## How the autoplay runner will use it

```ts
// Before opening the game page:
await page.evaluate(
  (id) => window.__asamaTest?.loadScenario(id),
  script.scenarioId
);
// Then proceed with runPlaythrough(page, script) as usual.
```

## Unblocked tests

Once this is implemented, remove the `it.skip` in `e2e/autoplay.test.ts` for
scenarios B (linear-fortress) and C (riverside-defense) and add proper
`beforeAll` blocks that call `loadScenario`.
