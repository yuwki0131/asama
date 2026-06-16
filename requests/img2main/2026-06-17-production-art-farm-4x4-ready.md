# Production Farm 4x4 Ready

## Generated Asset

Created the 4x4 farm production source:

```text
assets/source/raster/approved-production/farm-4x4/building-farm-4x4.png
```

Runtime mapping:

| assetId | output | canvas | anchor | footprint |
|---|---|---:|---:|---:|
| `building.farm` | `building-farm.png` | 256x128 | 128,64 | 4x4 |

## Output Files

```text
assets/source/raster/approved-production/farm-4x4/building-farm-4x4.png
assets/source/raster/approved-production/farm-4x4/contact-sheet.png
assets/source/raster/approved-production/farm-4x4/generation-report.md
assets/source/raster/approved-production/farm-4x4/asset-map.json
assets/source/raster/approved-production/farm-4x4/validation-summary.json
```

## Runtime Integration

Updated `assets/definitions/production-assets.json` so `building.farm` now uses:

```text
assets/source/raster/approved-production/farm-4x4/building-farm-4x4.png
```

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

Runtime confirmation:

```text
public/assets/generated/building-farm.png: 256x128
manifest anchor: 0.5,0.5
```

## Validation

- PNG dimensions exactly 256x128.
- Alpha channel exists.
- Canvas corners are transparent.
- Alpha bounds at alpha > 10: `0,0-255,127`.
- Contact sheet includes the farm over grass terrain.

## Visual Notes

The new farm is not a scaled-up 1x1 tile. It uses multiple iso-aligned ridges, crop rows, muddy/wet field tones, and subtle paddy highlights while staying low and passable-looking.
