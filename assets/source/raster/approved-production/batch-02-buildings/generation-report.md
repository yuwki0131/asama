# Production Art Batch 02 Buildings Report

## Scope

Generated production raster sources for runtime building definitions that were still using older `approved-ai/production/batch-1` sources.

## Assets

| assetId | file | canvas | anchor | footprint | result |
|---|---|---:|---:|---:|---|
| `building.market` | `building-market.png` | 96x80 | 48,65.6 | 1x1 | generated |
| `building.barracks` | `building-barracks.png` | 96x80 | 48,65.6 | 1x1 | generated |
| `building.samurai_residence` | `building-samurai-residence.png` | 96x80 | 48,65.6 | 1x1 | generated |
| `building.town_block` | `building-town-block.png` | 96x80 | 48,65.6 | 1x1 | generated |
| `building.tenshu.test` | `building-tenshu-test.png` | 112x104 | 56,91.52 | 1x1 | generated |
| `building.farm` | `building-farm.png` | 64x32 | 32,16 | 1x1 | generated |

## Method

- Used built-in image generation with a flat `#ff00ff` chroma-key background.
- Copied selected raw outputs into `raw/`.
- Removed chroma key and despilled edges with a local `sharp` raster pass.
- Fitted each cutout into the existing runtime canvas and anchor constraints.
- Updated `assets/definitions/production-assets.json` for these six asset sources.
- Imported into `public/assets/generated/` with `pnpm run assets:import:raster`.

## Validation

- `pnpm run assets:validate`: passed.
- `vipsheader` confirmed generated output dimensions:
  - `building-market.png`: 96x80
  - `building-barracks.png`: 96x80
  - `building-samurai-residence.png`: 96x80
  - `building-town-block.png`: 96x80
  - `building-tenshu-test.png`: 112x104
  - `building-farm.png`: 64x32
- All final source PNGs preserve an alpha channel and transparent corners.

## Files

- `building-market.png`
- `building-barracks.png`
- `building-samurai-residence.png`
- `building-town-block.png`
- `building-tenshu-test.png`
- `building-farm.png`
- `contact-sheet.png`
- `in-game-composite-preview.png`
- `asset-map.json`
- `validation-summary.json`
- `raw/`
- `cutout/`

## Visual Notes

- Market, barracks, samurai residence, and town block are compact 1x1 runtime variants with distinct silhouettes.
- `building.tenshu.test` is constrained by the current 112x104 1x1 test definition, so it reads as a small keep rather than a large multi-cell landmark.
- Farm is a compact wet-rice field tile. It is readable, but future farm variants should add seasonal states after the base art direction is approved.
