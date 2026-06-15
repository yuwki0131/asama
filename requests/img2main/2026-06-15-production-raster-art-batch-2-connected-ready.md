# Production Raster Art Batch 2 Connected Ready

Batch 2 connected construction assets have been imported through the production raster pipeline.

## Productionized Asset IDs

Productionized 64 connected asset IDs:

- `building.fence.wood.connected.0000` - `building.fence.wood.connected.1111`
- `building.wall.plaster.connected.0000` - `building.wall.plaster.connected.1111`
- `building.dry_moat.connected.0000` - `building.dry_moat.connected.1111`
- `building.water_moat.connected.0000` - `building.water_moat.connected.1111`

All four families include every 4-bit mask from `0000` through `1111`.

## Source PNGs

Added 64 source PNGs under:

```text
assets/source/raster/approved-ai/production/batch-2-connected/
```

Also added:

```text
assets/source/raster/approved-ai/production/batch-2-connected/README.md
assets/source/raster/approved-ai/production/batch-2-connected/generate-batch-2-connected.ts
```

## Definition Updates

`assets/definitions/production-assets.json` now contains 92 production raster definitions:

- 28 from Batch 1
- 64 from Batch 2 connected construction

The Batch 2 definitions preserve existing runtime output files, canvas sizes, anchors, and `assetId`s. `postprocess.trim` is disabled and `resizeMode` is `exact` to avoid connection drift.

## Mask Verification

Mask bit order was implemented as:

```text
N,E,S,W
```

The generated raster source uses the same direction mapping for every family:

- `1000`: north
- `0100`: east
- `0010`: south
- `0001`: west
- combinations form corners, T-junctions, straights, and crosses consistently

## Commands Run

```text
pnpm --filter @asama/asset-tools typecheck
pnpm --filter @asama/asset-tools test
pnpm run assets:import:raster
pnpm run assets:validate
pnpm run validate:generated-assets
pnpm run assets:all
pnpm run typecheck
pnpm test
```

Results:

- Imported 92 raster production assets.
- Validated production definitions and 102 generated assets.
- Validated 102 generated runtime assets.
- Full workspace typecheck and tests passed.

Additional checks confirmed:

- 16 definitions and source PNGs per connected family.
- Expected canvas and anchor values:
  - fence: `64x64`, anchor `32,48`
  - wall: `64x72`, anchor `32,56.16`
  - dry moat: `64x32`, anchor `32,16`
  - water moat: `64x32`, anchor `32,16`
- Representative `vipsheader` reads succeeded.

## Not Yet Converted

No Batch 2 requested connected asset IDs remain unconverted.

Overlay and UX/debug assets remain procedural SVG by design.

## Visual Notes

The connected families are production-candidate raster inputs suitable for in-game review. Items to watch:

- Fence and wall connection continuity across diagonal tile edges.
- Wall cap readability for dense `1111` intersections.
- Dry moat isolated `0000` visibility.
- Water moat contrast against `terrain.water.base`.
