# Generation Report

## Scope

Produced the six source candidates requested by
`2026-06-16-production-art-building-scale-up.md`.

The visible art derives from the later approved `large-building-scale` raster
sources, not from enlarged 1x1 runtime sprites. Those larger originals provide
distinct structural detail for the castle keep, storehouse, market, barracks,
samurai residence, and town block.

## Processing

Sharp was used only to trim transparent margins, downsample the approved raster
source, place its lowest visible pixel at the requested anchor, and create
review sheets. Runtime production definitions were not modified.

Regenerate with:

```text
pnpm --filter @asama/asset-tools assets:generate:building-scale-up
```

## Validation

- All six files match the requested canvas dimensions.
- Every file has an alpha channel and four transparent canvas corners.
- Requested anchors and logical footprints are recorded in `asset-map.json`.
- Contact and composite previews confirm improved scale and role readability.

## Concern

These candidates are intentionally smaller derivatives of the later
production-scale buildings. If integrated, they should use dedicated candidate
IDs as requested and must not replace the current larger runtime definitions.
