# Production Fortification Linear Assets Ready

## Productionized Asset Families

Generated and wired the following existing runtime asset families:

- `building.fence.wood`
- `building.fence.wood.connected.0000` through `building.fence.wood.connected.1111`
- `building.wall.plaster`
- `building.wall.plaster.connected.0000` through `building.wall.plaster.connected.1111`
- `building.dry_moat`
- `building.dry_moat.connected.0000` through `building.dry_moat.connected.1111`
- `building.water_moat`
- `building.water_moat.connected.0000` through `building.water_moat.connected.1111`

Total: 68 assets.

## Output Location

```text
assets/source/raster/approved-production/fortification-linear/
```

Includes:

- 4 base PNGs
- 64 connected PNGs
- `contact-sheet.png`
- `connection-preview.png`
- `generation-report.md`
- `asset-map.json`
- `validation-summary.json`

## Canvas, Anchor, Footprint

| family | canvas | anchor | footprint |
|---|---:|---:|---:|
| fence | 64x64 | 32,48 | 1x1 |
| wall | 64x72 | 32,56.16 | 1x1 |
| dry moat | 64x32 | 32,16 | 1x1 |
| water moat | 64x32 | 32,16 | 1x1 |

## Mask Confirmation

The mask order is `N,E,S,W`.

Examples checked in `connection-preview.png`:

- `0101`: east-west straight
- `1100`: north-east corner
- `1101`: north-east-west T
- `1111`: cross

## Runtime Integration

Updated `assets/definitions/production-assets.json` source paths for all 68 assets, preserving existing asset IDs, output names, geometry, and postprocess settings.

Then ran:

```text
pnpm run assets:import:raster
pnpm run assets:validate
```

Results:

```text
Imported 92 raster production assets.
Validated production definitions and 102 generated assets.
```

## Validation

- `validation-summary.json`: 68 entries.
- Size mismatches: 0.
- Non-transparent corner failures: 0.
- Representative runtime generated outputs confirmed by `vipsheader`.

## Preview Concerns

Long wall and fence runs still show a small per-cell rhythm because the runtime model is 1x1 connected tiles. There are no obvious gaps or broken mask directions in the preview.
