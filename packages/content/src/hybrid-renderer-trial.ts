// Trial scenario for the hybrid 3D renderer feasibility test.
//
// Intentionally small (interesting geometry packed into a 24x24 window even
// though the sim map remains the standard 128x128). Includes:
//   - flat grass area
//   - two elevation levels (base + one raised bailey)
//   - room for one irregular curved stone rampart + wall on top (drawn by the
//     3D renderer as procedural geometry, not by scenario buildings)
//   - dry moat and water moat sections (rendered procedurally by the 3D layer)
//   - a wooden fence run
//   - a gate on the wall
//   - one yagura and one storehouse (2D billboards)
//   - a handful of player units placed so at least one has a path that
//     passes behind the wall and one moves between elevation levels
//
// The 2D PixiJS renderer can also load this scenario as ordinary geometry
// (walls/moats/gate here are declared as normal buildings so the sim treats
// them consistently); the 3D renderer additionally overlays the procedural
// bailey / rampart / moat features from the trialFeatures module.

import type { ScenarioDefinition } from "@asama/shared";
import type { ContentScenarioDefinition } from "./index";

const CENTER_X = 52;
const CENTER_Y = 52;

// Convenient anchor within the trial window (24x24 centered around 52,52).
function c(dx: number, dy: number): { x: number; y: number } {
  return { x: CENTER_X + dx, y: CENTER_Y + dy };
}

export const hybridRendererTrialScenario: ContentScenarioDefinition = {
  id: "hybrid-renderer-trial",
  name: "3Dレンダラー試作",
  description:
    "ハイブリッド2.5Dレンダラー技術検証用の小規模シナリオ。3D地形と2D建物ビルボードの共存を確認する。?renderer=3d で起動。",
  initialBuildings: [
    // Storehouse and yagura sit on the raised bailey as 2D billboards.
    { type: "storehouse", position: c(-3, -3) },
    { type: "yagura", position: c(3, -3) },

    // Wall run along the bailey's south edge with a gate in the middle.
    { type: "wall", position: c(-5, 3) },
    { type: "wall", position: c(-4, 3) },
    { type: "wall", position: c(-3, 3) },
    { type: "gate_wide_3", position: c(-2, 3) },
    { type: "wall", position: c(1, 3) },
    { type: "wall", position: c(2, 3) },
    { type: "wall", position: c(3, 3) },
    { type: "wall", position: c(4, 3) },
    { type: "wall", position: c(5, 3) },

    // Wooden fence along the north edge of the trial window (arbitrary path).
    { type: "fence", position: c(-6, -6) },
    { type: "fence", position: c(-5, -6) },
    { type: "fence", position: c(-4, -6) },
    { type: "fence", position: c(-3, -6) },
    { type: "fence", position: c(-2, -6) },

    // Dry moat sketch (rendered as procedural trench by 3D; as tiles by 2D).
    { type: "dry_moat", position: c(-8, 6) },
    { type: "dry_moat", position: c(-7, 6) },
    { type: "dry_moat", position: c(-6, 6) },
    { type: "dry_moat", position: c(-5, 6) },

    // Water moat wraps the SE corner.
    { type: "water_moat", position: c(5, 5) },
    { type: "water_moat", position: c(6, 5) },
    { type: "water_moat", position: c(7, 5) },
    { type: "water_moat", position: c(7, 6) },
    { type: "water_moat", position: c(7, 7) },
    { type: "earth_bridge", position: c(6, 6) },
  ],
  initialUnits: [
    // Units on the bailey side of the wall (north of the wall at y=55).
    { type: "spear_ashigaru", position: c(-1, 2), owner: "player" }, // just behind the wall on the bailey
    { type: "sword_ashigaru", position: c(1, 2), owner: "player" },  // ditto, east of the gate
    // Units on the outer (lower) side of the wall — the occlusion shot
    // frames both banks so the depth test is visually verifiable.
    { type: "archer", position: c(-1, 5), owner: "player" },
    { type: "archer", position: c(2, 5), owner: "player" },
    // Enemy scout to give the picking target something interesting.
    { type: "spear_ashigaru", position: c(9, 9), owner: "enemy" },
  ],
  waves: [],
  elevation: {
    // Two terraces so the elevation shot can show 2 distinct levels:
    //   - Outer bailey (level 1) covers the north 12x8 area
    //   - Honmaru core (level 2) sits inside on 6x4 — proves 2-level differentiation
    patches: [
      {
        area: { kind: "rect", x: CENTER_X - 6, y: CENTER_Y - 5, width: 12, height: 8 },
        level: 1,
        skin: "ishigaki",
      },
      {
        area: { kind: "rect", x: CENTER_X - 3, y: CENTER_Y - 3, width: 6, height: 4 },
        level: 2,
        skin: "ishigaki",
      },
    ],
    slopes: [
      // Gentle 2-cell ramp coming up from the south, so units can move
      // between elevation levels through the gate area.
      { position: c(0, 5), toward: "N", length: 2 },
    ],
  },
  victory: { holdTicks: null },
};

/** Also expose the scenario under a helper name for the 3D renderer module. */
export function isHybridTrialScenarioId(id: string | null | undefined): boolean {
  return id === hybridRendererTrialScenario.id;
}

/** Extend the top-level scenarios list with the trial scenario when the
 *  renderer parameter is 3d. Called by ScenarioSelectScreen to decide which
 *  cards to show. Kept in @asama/content so both apps and tests can query it. */
export const HYBRID_TRIAL_SCENARIO_ID = hybridRendererTrialScenario.id;

// Re-export as ScenarioDefinition too for callers that don't need the
// description field.
export const hybridTrialAsSharedScenario: ScenarioDefinition = hybridRendererTrialScenario;
