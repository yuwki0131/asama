# Generation Report

## Scope

Generated 41 production raster assets:

- Enlarged plaster wall base plus all 16 `N,E,S,W` masks.
- 24 directional gates: two orientations, three logical widths, and four valid
  endpoint states per orientation.

## Method

The built-in image generation workflow produced one tall wall source and six
independent gate sources. Each gate orientation and width has its own raster
construction; final-output mirroring was not used between directions.

Prompts required Sengoku white plaster, timber, stone bases, tiled roofs,
dominant defensive scale, exact bottom grounding, upper-left daylight, and
full footprint coverage. Sharp is limited to chroma removal, canvas fitting,
raster shoulder compositing, review sheets, and validation.

Regenerate with:

```text
pnpm --filter @asama/asset-tools assets:generate:directional-wall-gates
```

## Geometry

- Wall: 64x96, anchor 32,80, footprint 1x1.
- Width 1 gates: 96x112, anchor 48,104.
- Width 2 gates: 160x120, anchor 80,112.
- Width 3 gates: 224x128, anchor 112,120.
- `nw_se` footprints are 1x1, 2x1, and 3x1.
- `ne_sw` footprints are 1x1, 1x2, and 1x3.

## Remaining Concern

At close zoom, the wall T/cross center is denser than a bespoke masonry joint.
The runtime-scale silhouette is joined and readable, but a dedicated modeled
intersection would be the next quality improvement.

## Wall Mask Correction

The 2026-06-19 correction replaced the repeated full-wall compositing logic with
mask-specific directional raster construction:

- `0101` and `1010` are single continuous straight sections.
- Ends contain one directional half only.
- Corners, T junctions, and the cross contain only their requested halves.
- The isolated piece is independently clipped and capped.
- All 16 encoded PNG files have distinct SHA-256 hashes.

The labelled sheet, both 10-cell runs, corners, T junctions, cross, gate
connections, and socket closeups are stored beside the runtime sources.
