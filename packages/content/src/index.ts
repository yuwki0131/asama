import type { ScenarioDefinition } from "@asama/shared";

/**
 * MVP defense scenario (docs/07_scenarios/mvp-scenario.md).
 * Wave timings and compositions are provisional balance values.
 */
export const mvpDefenseScenario: ScenarioDefinition = {
  id: "mvp-defense",
  name: "MVP防衛戦",
  initialBuildings: [
  { type: "tenshu", position: { x: 54, y: 54 } },
  { type: "honmaru", position: { x: 62, y: 58 } },
  { type: "yagura", position: { x: 50, y: 58 } },
  { type: "storehouse", position: { x: 47, y: 62 } },
  { type: "market", position: { x: 52, y: 66 } },
  { type: "barracks", position: { x: 60, y: 66 } },
  { type: "samurai_residence", position: { x: 68, y: 55 } },
  { type: "town_block", position: { x: 70, y: 64 } },
  { type: "farm", position: { x: 50, y: 72 } },
  { type: "farm", position: { x: 55, y: 72 } },
  { type: "road", position: { x: 61, y: 64 } },
  { type: "road", position: { x: 62, y: 64 } },
  { type: "road", position: { x: 63, y: 64 } },
  { type: "road", position: { x: 64, y: 65 } },
  { type: "road", position: { x: 65, y: 65 } },
  { type: "road", position: { x: 67, y: 65 } },
  { type: "road", position: { x: 68, y: 65 } },
  { type: "road", position: { x: 69, y: 65 } },
  { type: "fence", position: { x: 52, y: 50 } },
  { type: "fence", position: { x: 53, y: 50 } },
  { type: "fence", position: { x: 54, y: 50 } },
  { type: "fence", position: { x: 55, y: 50 } },
  { type: "wall", position: { x: 56, y: 50 } },
  { type: "wall", position: { x: 57, y: 50 } },
  { type: "wall", position: { x: 58, y: 50 } },
  { type: "wall", position: { x: 59, y: 50 } },
  { type: "gate_wide_3", position: { x: 60, y: 50 } },
  { type: "gate_wide_3", position: { x: 64, y: 74 } },
  { type: "dry_moat", position: { x: 80, y: 58 } },
  { type: "dry_moat", position: { x: 80, y: 59 } },
  { type: "dry_moat", position: { x: 80, y: 60 } },
  { type: "water_moat", position: { x: 82, y: 58 } },
  { type: "water_moat", position: { x: 82, y: 59 } },
  { type: "water_moat", position: { x: 82, y: 60 } },
  { type: "earth_bridge", position: { x: 61, y: 44 } },
  { type: "wood_bridge", position: { x: 62, y: 45 } },
  { type: "gate_wide_3", position: { x: 84, y: 65 }, owner: "enemy" }
  ],
  initialUnits: [
    { type: "spear_ashigaru", position: { x: 62, y: 58 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 62, y: 59 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 63, y: 57 }, owner: "player" },
    { type: "archer", position: { x: 63, y: 58 }, owner: "player" },
    { type: "archer", position: { x: 64, y: 59 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 86, y: 66 }, owner: "enemy" },
    { type: "archer", position: { x: 87, y: 66 }, owner: "enemy" }
  ],
  waves: [
  {
    tick: 2400,
    spawns: [
      { type: "spear_ashigaru", position: { x: 86, y: 63 } },
      { type: "spear_ashigaru", position: { x: 87, y: 68 } }
    ]
  },
  {
    tick: 7200,
    spawns: [
      { type: "spear_ashigaru", position: { x: 86, y: 63 } },
      { type: "sword_ashigaru", position: { x: 86, y: 66 } },
      { type: "archer", position: { x: 87, y: 68 } }
    ]
  },
  {
    tick: 12000,
    spawns: [
      { type: "spear_ashigaru", position: { x: 86, y: 63 } },
      { type: "spear_ashigaru", position: { x: 86, y: 66 } },
      { type: "sword_ashigaru", position: { x: 87, y: 64 } },
      { type: "archer", position: { x: 87, y: 68 } }
    ]
  }
  ],
  victory: {
    // Hold the honmaru for 20 minutes (well past the final wave) to win by
    // endurance; annihilating every wave also wins.
    holdTicks: 24000
  }
};

export const scenarios: readonly ScenarioDefinition[] = [mvpDefenseScenario];
