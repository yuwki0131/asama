# Terrain and Units Runtime Gap Report

## Scope

Replaced the final 12 runtime assets that still referenced `approved-ai/production/batch-1`.

## Assets

### Terrain

- `terrain.dirt.base`
- `terrain.water.base`
- `terrain.stone.base`
- `terrain.grass.variant.1`
- `terrain.dirt.variant.1`

All use 64x32 canvases, anchor 32,16, full diamond alpha coverage, and transparent corners.

### Runtime Units

| assetId | canvas | anchor | alpha bounds |
|---|---:|---:|---|
| `unit.spear_ashigaru.idle.south` | 48x64 | 24,52.48 | 15,10-42,52 |
| `unit.sword_ashigaru.idle.south` | 48x64 | 24,52.48 | 17,7-42,52 |
| `unit.archer.idle.south` | 48x64 | 24,52.48 | 18,4-40,52 |

Units were generated with the built-in image generation tool on flat magenta backgrounds, then chroma-keyed, despilled, resized, and grounded locally.

### Infrastructure

- `building.earth_bridge`: 64x32, anchor 32,16.
- `building.wood_bridge`: 64x32, anchor 32,16.
- `building.gate.wood.closed.width2`: 128x80, current runtime anchor 64,73.
- `building.gate.wood.closed.width3`: 192x80, current runtime anchor 96,73.

The request listed wide-gate anchor Y as 62.4, but current production definitions already use integer grounding at Y=73. Runtime compatibility was preserved.

## Method

- Terrain and bridges use deterministic raster generation with material-specific low-frequency texture.
- Units and wide gates use approved AI-assisted raster generation plus local alpha postprocessing.
- Terrain variants fill the complete isometric diamond without colored edge outlines.
- Unit and gate lowest visible pixels were shifted to match their runtime anchors.
- Updated all 12 `source.file` values in `assets/definitions/production-assets.json`.

## Validation

- 12 metadata entries in `asset-map.json` and `validation-summary.json`.
- Exact dimensions for all PNGs.
- Alpha channel and transparent corners validated.
- Unit contact pixels align at Y=52 against anchor Y=52.48.
- Wide-gate contact pixels align at Y=72 against runtime anchor Y=73.
- `approved-ai/production/batch-1` references remaining in production definitions: 0.
- `pnpm run assets:validate` passed.

## Review Files

- `terrain-contact-sheet.png`: mixed terrain at 1x and 0.5x.
- `unit-contact-sheet.png`: role comparison at enlarged and runtime size.
- `runtime-composite-preview.png`: units, bridges, and gates on grass.

## Visual Concerns

- Terrain boundaries intentionally change color by terrain type; the validation target is absence of transparent or colored fringe, not seamless color blending between different biomes.
- These units are idle south-facing baselines only. Animation and other directions remain future work.
