# Production Art Batch 01 Corrections Report

## Corrected Assets

| assetId | file | canvas | anchor | footprint | result |
|---|---|---:|---:|---:|---|
| `building.storehouse` | `building-storehouse.png` | 96x80 | 48,65.6 | 1x1 | corrected |
| `building.gate.wood.closed` | `building-gate-wood-closed.png` | 80x80 | 40,62.4 | 1x1 | corrected |
| `terrain.grass.base` | `terrain-grass-base.png` | 64x32 | 32,16 | 1x1 | seam corrected |

## Runtime Compatibility

- `building.storehouse` now matches the current runtime manifest canvas and anchor.
- `building.gate.wood.closed` now matches the current runtime manifest canvas and anchor.
- Both files keep the existing runtime output names.
- Both are 1x1 footprint candidates for the current implementation.
- `terrain.grass.base` keeps the current runtime canvas and anchor while filling the full isometric diamond to avoid visible tile seams.

## Validation

- [x] transparent background
- [x] alpha channel
- [x] exact canvas size
- [x] transparent corners
- [x] anchor position marked in contact sheet
- [x] readable at 1x
- [x] contact sheet generated
- [x] terrain alpha bounds reach 0,0-63,31 at alpha > 10
- [x] terrain 12x12 tiling preview generated without visible grid or dark outline

## Files

- `building-storehouse.png`
- `building-gate-wood-closed.png`
- `contact-sheet.png`
- `terrain-grass-base.png`
- `terrain-grass-tiling-preview.png`
- `asset-map.json`

## Visual Notes

- Storehouse preserves the Batch 01 kura direction while fitting the current 96x80 runtime canvas.
- Gate is reduced to a compact one-cell closed wooden gate and should remain distinct from width2/width3 gates.
- Both are derived from the Batch 01 approved-production sources, not new SVG placeholder art.
- Terrain grass uses a transparent 64x32 isometric diamond with no dark edge stroke. Large fields may show mild texture repetition, but no cell-border grid was visible in the 12x12 preview.
