# Production Farm 4x4 Report

## Scope

Generated a 4x4 production replacement source for the existing runtime asset ID `building.farm`.

## Asset

| assetId | source file | runtime output | canvas | anchor | footprint | result |
|---|---|---|---:|---:|---:|---|
| `building.farm` | `building-farm-4x4.png` | `building-farm.png` | 256x128 | 128,64 | 4x4 | generated |

## Method

- Built a deterministic transparent raster PNG at the exact requested canvas.
- Filled the full 4x4 isometric diamond with muted wet-field, soil, crop-row, and ridge textures.
- Added multiple iso-aligned bands, paddy ridges, and subtle water glints.
- Avoided tall structures, people, houses, strong outlines, and bright edge fringes.
- Updated `assets/definitions/production-assets.json` to point `building.farm` at this source.
- Ran `pnpm run assets:import:raster` and `pnpm run assets:validate`.

## Validation

- `building-farm-4x4.png`: 256x128 PNG, 4 bands, sRGB.
- Alpha channel present.
- Canvas corners transparent: `0,0,0,0`.
- Alpha bounds at alpha > 10: `0,0-255,127`.
- Runtime generated output `public/assets/generated/building-farm.png`: 256x128.
- Runtime manifest anchor: `0.5,0.5`.

## Files

- `building-farm-4x4.png`
- `contact-sheet.png`
- `asset-map.json`
- `validation-summary.json`
- `generation-report.md`

## Visual Notes

The field reads as a broad 4x4 cultivated ground area rather than an enlarged 1x1 tile. Density is kept low enough that units walking over it should not feel like they are crossing a tall building.
