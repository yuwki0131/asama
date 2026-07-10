import type { ScenarioDefinition } from "@asama/shared";

/**
 * DEV-only scenario fixture for the P4b elevation renderer (booted with
 * `?scenario=elevation-fixture`; see docs/10_development/elevation-contract.md).
 *
 * It lives in apps/game — NOT packages/content — because the shipped scenario
 * roster is owned by the content workstream; this map exists purely so E2E
 * tests and manual verification can look at terraces, cliff faces, slopes and
 * units standing on high ground.
 *
 * Layout: a three-terrace hill around (40, 58) — rock-skinned level 1,
 * ishigaki levels 2 and 3 — with a straight climbing route on x=40/41:
 *   (40..41, 68) slope 0→1, (40..41, 63) slope 1→2, (40, 60) slope 2→3,
 *   plus a single W-facing slope (52, 56) climbing the terrace from the east.
 * The honmaru + storehouse sit on flat ground to the east so the game loop
 * (food, victory checks) behaves normally; a never-spawning far-future wave
 * keeps the "annihilation" victory from ending the session instantly.
 */
export const elevationFixtureScenario: ScenarioDefinition = {
  id: "elevation-fixture",
  name: "高低差検証フィクスチャ (dev)",
  initialBuildings: [
    { type: "honmaru", position: { x: 58, y: 62 } },
    { type: "storehouse", position: { x: 64, y: 62 } },
    // Yagura (2x2) on the level-2 terrace with its S edge flush against the
    // terrace rim (cliff cells at y=63): regression check that the cliff face
    // still covers the building base protruding past the rim.
    { type: "yagura", position: { x: 36, y: 61 } }
  ],
  initialUnits: [
    // Base of the hill, in front of the 0→1 slope.
    { type: "spear_ashigaru", position: { x: 40, y: 72 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 43, y: 71 }, owner: "player" },
    // On the level-1 terrace.
    { type: "spear_ashigaru", position: { x: 37, y: 65 }, owner: "player" },
    // On the level-3 summit (ishigaki).
    { type: "archer", position: { x: 39, y: 58 }, owner: "player" }
  ],
  waves: [
    // Far-future sentinel wave: with zero live enemies the sim would
    // otherwise declare "enemy_annihilated" on the first tick.
    { tick: 9_999_999, spawns: [{ type: "spear_ashigaru", position: { x: 4, y: 4 } }] }
  ],
  elevation: {
    patches: [
      // Level 1: natural rock hill.
      { area: { kind: "ellipse", cx: 40, cy: 58, rx: 12, ry: 9 }, level: 1 },
      // Level-1 tongue that carries the climbing route down to y=67 so the
      // 0→1 slope at y=68 connects (the ellipse edge falls just short).
      { area: { kind: "rect", x: 39, y: 64, width: 3, height: 4 }, level: 1 },
      // Level 2: ishigaki terrace (二之丸相当).
      { area: { kind: "rect", x: 35, y: 54, width: 10, height: 9 }, level: 2, skin: "ishigaki" },
      // Level 3: ishigaki summit (本丸相当).
      { area: { kind: "rect", x: 38, y: 56, width: 4, height: 4 }, level: 3, skin: "ishigaki" },
      // Unreachable rock outcrop east of the summit: rises 1 → 3 in one step,
      // exercising the h2 cliff faces (and their stacked joint lines).
      { area: { kind: "rect", x: 46, y: 55, width: 2, height: 2 }, level: 3 }
    ],
    slopes: [
      { position: { x: 40, y: 68 }, toward: "N", width: 2 }, // 0 → 1
      { position: { x: 40, y: 63 }, toward: "N", width: 2 }, // 1 → 2
      { position: { x: 40, y: 60 }, toward: "N" }, // 2 → 3 (single-width chokepoint)
      // East approach climbing W onto the level-1 terrace: exercises the
      // opposite screen diagonal (lower-right → upper-left) of the N slopes.
      // (52,56) hugs the ellipse edge one row north of its easternmost point,
      // keeping the ramp clear of the pine at (54,59) for visual checks.
      { position: { x: 52, y: 56 }, toward: "W" }
    ]
  },
  // Deterministic trees directly in FRONT (screen-south, low side) of cliff
  // faces: their crowns overlap the wall and must paint over it, never be
  // swallowed by it (cliff render-order regression check).
  decorations: [
    // In front of the h2 rock outcrop faces (cliff cells at y=57).
    { assetId: "deco.tree.cedar.1", position: { x: 46, y: 58 } },
    { assetId: "deco.tree.pine.1", position: { x: 47, y: 58 } },
    // In front of the level-2 ishigaki terrace S rim (cliff cells at y=63).
    { assetId: "deco.tree.pine.1", position: { x: 37, y: 64 } },
    { assetId: "deco.tree.broadleaf.1", position: { x: 43, y: 64 } }
  ],
  victory: { holdTicks: null }
};
