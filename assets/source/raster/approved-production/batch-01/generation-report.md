# Production Art Batch 01 Generation Report

## Generated Assets

| assetId | file | canvas | anchor | footprint | result |
|---|---|---:|---:|---:|---|
| `terrain.grass.base` | `terrain-grass-base.png` | 64x32 | 32,16 | 1x1 | generated |
| `building.road` | `building-road-dirt.png` | 64x32 | 32,16 | 1x1 | generated |
| `vegetation.forest.cluster.01` | `vegetation-forest-cluster-01.png` | 192x160 | 96,136 | 2x2 | generated |
| `building.storehouse` | `building-storehouse.png` | 192x160 | 96,136 | 2x2 | generated |
| `building.gate.wood.closed` | `building-gate-wood-closed.png` | 192x176 | 96,152 | 2x1 | generated |
| `building.yagura.small.normal` | `building-yagura-small-normal.png` | 224x208 | 112,184 | 2x2 | generated |
| `building.yagura.small.occupied-cutaway` | `building-yagura-small-occupied-cutaway.png` | 224x208 | 112,184 | 2x2 | generated |
| `unit.ashigaru.spear.idle.ne` | `unit-ashigaru-spear-idle-ne.png` | 64x80 | 32,68 | 1x1 | generated |
| `unit.ashigaru.spear.walk.ne` | `unit-ashigaru-spear-walk-ne.png` | 64x80 | 32,68 | 1x1 | generated |
| `unit.engineer.idle.ne` | `unit-engineer-idle-ne.png` | 64x80 | 32,68 | 1x1 | generated |
| `unit.supply-cart.idle.ne` | `unit-supply-cart-idle-ne.png` | 112x88 | 56,72 | 1x1 | generated |

## Shared Style

- camera: fixed isometric RTS view
- projection: orthographic-style source generation, postprocessed to exact sprite canvases
- light direction: upper-left daylight
- shadow direction: lower-right contact shadows
- palette: medium-low saturation natural greens, earth, wood, tile, plaster, and stone
- outline: no thick black outline; small dark edge contrast only where needed
- unit scale: individual soldiers are larger than strict realism for 1x readability

## Validation

- [x] transparent background
- [x] exact canvas size
- [x] anchor checked
- [x] no white fringe
- [x] consistent lighting
- [x] Japanese historical design
- [x] no Chinese-style soldiers or architecture
- [x] readable at 1x
- [x] contact sheet generated
- [x] composite preview generated

## Files

- `contact-sheet.png`
- `in-game-composite-preview.png`
- `asset-map.json`

## Generation Notes

Images were generated with the built-in image generation tool on a flat chroma-key background, then locally processed into transparent PNGs. Each final asset was placed on the requested canvas and validated for dimensions, alpha channel, transparent corners, and residual chroma-key color.

## Remaining Issues

- `building.yagura.small.normal` and `building.yagura.small.occupied-cutaway` share the intended low-yagura concept and footprint, but should receive human art review before approving as final castle architecture.
- `unit.ashigaru.spear.idle.ne` and `unit.ashigaru.spear.walk.ne` are visually close, but exact same-character continuity should be reviewed before animation expansion.
- This batch was not imported into `public/assets/generated/` because it includes new asset IDs and output naming that are not yet represented in the runtime manifest/content definitions.
