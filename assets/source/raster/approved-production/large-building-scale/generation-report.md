# Production Art Large Building Scale Report

## Scope

Generated large production raster candidates for the new building footprint policy. These are source candidates only and do not replace current runtime asset IDs.

## Assets

| candidate assetId | file | canvas | anchor | footprint | result |
|---|---|---:|---:|---:|---|
| `building.tenshu.large` | `building-tenshu-large.png` | 640x520 | 320,456 | 8x8 | generated |
| `building.town_block.large` | `building-town-block-large.png` | 640x420 | 320,356 | 8x8 | generated |
| `building.storehouse.large` | `building-storehouse-large.png` | 320x260 | 160,224 | 4x4 | generated |
| `building.market.large` | `building-market-large.png` | 420x280 | 210,236 | 6x4 | generated |
| `building.barracks.large` | `building-barracks-large.png` | 420x280 | 210,236 | 6x4 | generated |
| `building.samurai_residence.large` | `building-samurai-residence-large.png` | 460x360 | 230,308 | 6x6 | generated |

## Method

- Used built-in image generation with flat `#ff00ff` chroma-key backgrounds.
- Copied raw outputs into `raw/`.
- Removed chroma key and despilled edges with a local `sharp` raster pass.
- Fitted each cutout into the requested canvas and anchor constraints.
- Did not update `assets/definitions/production-assets.json` or `public/assets/generated/`.

## Validation

- `vipsheader` confirmed all requested PNG dimensions.
- All final source PNGs have 4 bands and sRGB PNG format.
- All final source PNGs have transparent corners and alpha channel.
- Detailed alpha bounds are recorded in `validation-summary.json`.

## Files

- `building-tenshu-large.png`
- `building-town-block-large.png`
- `building-storehouse-large.png`
- `building-market-large.png`
- `building-barracks-large.png`
- `building-samurai-residence-large.png`
- `contact-sheet.png`
- `in-game-composite-preview.png`
- `asset-map.json`
- `validation-summary.json`
- `raw/`
- `cutout/`

## Visibility Improvements

- Tenshu is now a clear landmark-scale building instead of a compact 1x1 test keep.
- Town block reads as a district with multiple machiya rather than a single small row.
- Storehouse, market, barracks, and samurai residence have enough canvas space for type-specific details.
- Composite preview shows major buildings dominating nearby grass tiles as intended by the new footprint policy.

## Visual Concerns

- The large town block and samurai residence are detail-rich; implementation should test draw order and click bounds before runtime adoption.
- The composite preview intentionally overlaps several large buildings to compare scale and should not be interpreted as a recommended placement layout.
