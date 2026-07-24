// Procedural rendering-domain features overlaid on the hybrid trial scenario.
//
// These do NOT live in the simulation state — the sim still sees ordinary
// scenario buildings. The 3D renderer adds an *additional* layer of
// procedural bailey/rampart/moat/wall geometry so we can prove the value
// prop of the hybrid renderer: irregular castle outlines that would be
// awkward to express with 16-direction tile masks.
//
// Coordinates align with the trial scenario in @asama/content: the raised
// bailey sits at cells x=46..57, y=47..54 (center 52,52) and the interesting
// geometry is packed into the 24x24 window around it.

import type { LinearFeature, TrialFeatures } from "./features";

const CX = 52;
const CY = 52;

function p(dx: number, dy: number): { x: number; y: number } {
  return { x: CX + dx, y: CY + dy };
}

/** Hand-authored trial features — the terrain mesh already visualises the
 *  scenario's elevation patches, so we don't add redundant bailey polygons.
 *  What this file does add is an example of a **curved rampart + wall**
 *  authored as polylines: something the scenario's tile-based walls cannot
 *  express. That's the whole point of the 3D trial. */
/** Passed to the scene for every non-trial scenario: the hand-authored
 *  polylines below are positioned for hybrid-renderer-trial's map and would
 *  render as stray geometry anywhere else. */
export const noTrialFeatures: TrialFeatures = {
  areas: [],
  linears: [],
};

export const trialFeatures: TrialFeatures = {
  areas: [],
  linears: [
    // Curved stone rampart tracing the south-west edge of the bailey. The
    // polyline intentionally bends multiple times to demonstrate irregular
    // outlines that tile masks cannot express cleanly.
    {
      id: "rampart-sw",
      kind: "stone_wall",
      baseElevation: 0,
      width: 1.2,
      height: 1, // one elevation level tall
      path: [
        p(-7, 4),
        p(-6, 4.5),
        p(-4, 5.2),
        p(-2, 5.5),
        p(0, 5.4),
        p(2, 5.0),
        p(4, 4.4),
        p(6, 3.5),
      ],
    } satisfies LinearFeature,
    // Plaster wall run sitting on top of the rampart at elevation 1.
    {
      id: "wall-sw",
      kind: "plaster_wall",
      baseElevation: 1,
      width: 0.3,
      height: 0.9,
      path: [
        p(-7, 4),
        p(-6, 4.5),
        p(-4, 5.2),
        p(-2, 5.5),
        p(0, 5.4),
        p(2, 5.0),
        p(4, 4.4),
        p(6, 3.5),
      ],
    } satisfies LinearFeature,
    // Wooden fence on the NW edge on the base ground.
    {
      id: "fence-nw",
      kind: "wood_fence",
      baseElevation: 0,
      width: 1,
      height: 0.5,
      path: [
        p(-10, -6),
        p(-8, -6),
        p(-6, -5),
        p(-4, -6),
      ],
    } satisfies LinearFeature,
    // Dry moat curving around the SW corner.
    {
      id: "dry-moat",
      kind: "dry_moat",
      baseElevation: 0,
      width: 2,
      height: 0.8,
      path: [
        p(-11, 5),
        p(-9, 6),
        p(-6, 7),
        p(-3, 7.5),
      ],
    } satisfies LinearFeature,
    // Water moat on the SE with a bend.
    {
      id: "water-moat",
      kind: "water_moat",
      baseElevation: 0,
      width: 2.4,
      height: 0.7,
      path: [
        p(4, 6),
        p(6, 6.5),
        p(9, 7),
        p(9, 10),
      ],
    } satisfies LinearFeature,
  ],
};
