# Production Building Scale-Up Ready

Generated the six requested source candidates under:

```text
assets/source/raster/approved-production/building-scale-up/
```

| candidate assetId | canvas | anchor | footprint |
|---|---:|---:|---:|
| `building.tenshu.medium` | 192x176 | 96,156 | 2x2 |
| `building.storehouse.large` | 128x112 | 64,94 | 2x1 |
| `building.market.large` | 144x112 | 72,94 | 2x1 |
| `building.barracks.large` | 144x112 | 72,94 | 2x1 |
| `building.samurai_residence.large` | 144x112 | 72,94 | 2x1 |
| `building.town_block.large` | 144x112 | 72,94 | 2x1 |

## Outputs

- Six requested PNG files.
- `contact-sheet.png`
- `in-game-composite-preview.png`
- `asset-map.json`
- `validation-summary.json`
- `generation-report.md`

All PNGs have the requested dimensions, alpha channels, and transparent
corners. They were derived from the later approved multi-cell production
sources rather than scaling the original 1x1 sprites.

The larger source composition improves silhouette separation: the market has
stalls and cargo, the barracks has a military compound shape, the residence has
a formal enclosed garden, and the town block reads as multiple machiya.

No runtime or manifest definitions were changed for these candidates, matching
the request. The main concern is that these intermediate-size candidates are
now smaller than the project's current production-scale building policy.

## Verification

`pnpm run typecheck`, `pnpm test`, and the production-art audit passed.
