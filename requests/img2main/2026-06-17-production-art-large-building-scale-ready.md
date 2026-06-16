# Production Art Large Building Scale Ready

## Generated Candidate Assets

Created source candidates under:

```text
assets/source/raster/approved-production/large-building-scale/
```

| candidate assetId | file | canvas | anchor | footprint |
|---|---|---:|---:|---:|
| `building.tenshu.large` | `building-tenshu-large.png` | 640x520 | 320,456 | 8x8 |
| `building.town_block.large` | `building-town-block-large.png` | 640x420 | 320,356 | 8x8 |
| `building.storehouse.large` | `building-storehouse-large.png` | 320x260 | 160,224 | 4x4 |
| `building.market.large` | `building-market-large.png` | 420x280 | 210,236 | 6x4 |
| `building.barracks.large` | `building-barracks-large.png` | 420x280 | 210,236 | 6x4 |
| `building.samurai_residence.large` | `building-samurai-residence-large.png` | 460x360 | 230,308 | 6x6 |

## Output Files

- `building-tenshu-large.png`
- `building-town-block-large.png`
- `building-storehouse-large.png`
- `building-market-large.png`
- `building-barracks-large.png`
- `building-samurai-residence-large.png`
- `contact-sheet.png`
- `in-game-composite-preview.png`
- `generation-report.md`
- `asset-map.json`
- `validation-summary.json`
- `raw/`
- `cutout/`

## Validation

- All final PNGs match the requested canvas dimensions.
- All final PNGs are transparent-background PNGs with alpha channels.
- All final PNGs have transparent corners.
- `vipsheader` confirmed 4-band sRGB PNG output.
- Alpha bounds and opaque pixel counts are recorded in `validation-summary.json`.

## Runtime Status

I did not update current runtime definitions or generated runtime assets. These files are source candidates for implementation to wire after adding large building definitions and manifest entries.

## Visibility Improvements

- `building.tenshu.large` now reads as an 8x8 castle centerpiece rather than a small test tower.
- `building.town_block.large` reads as a complete machiya district.
- Storehouse, market, barracks, and samurai residence now have enough room for distinct silhouettes and role-specific details.

## Visual Concerns

- The town block and samurai residence are visually dense. Runtime should check selection outlines, draw order, and object overlap at the intended zoom levels.
- `in-game-composite-preview.png` is a scale comparison preview, not a placement recommendation.
