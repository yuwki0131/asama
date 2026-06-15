# Production Raster Art Batch 1 Ready

Batch 1 has been imported through the production raster pipeline.

## Productionized Asset IDs

- `terrain.grass.base`
- `terrain.dirt.base`
- `terrain.water.base`
- `terrain.stone.base`
- `terrain.grass.variant.1`
- `terrain.dirt.variant.1`
- `unit.ashigaru.idle.south`
- `unit.ashigaru.move.south`
- `unit.ashigaru.idle.north`
- `unit.ashigaru.idle.east`
- `unit.ashigaru.idle.west`
- `building.storehouse`
- `building.market`
- `building.barracks`
- `building.samurai_residence`
- `building.town_block`
- `building.tenshu.test`
- `building.farm`
- `building.road`
- `building.earth_bridge`
- `building.wood_bridge`
- `building.fence.wood`
- `building.wall.plaster`
- `building.gate.wood.closed`
- `building.gate.wood.closed.width2`
- `building.gate.wood.closed.width3`
- `building.dry_moat`
- `building.water_moat`

## Source PNGs

Added 28 source PNGs under:

```text
assets/source/raster/approved-ai/production/batch-1/
```

Also added:

```text
assets/source/raster/approved-ai/production/batch-1/README.md
assets/source/raster/approved-ai/production/batch-1/generate-batch-1.ts
```

## Definition Updates

`assets/definitions/production-assets.json` now contains 28 `source.type: "raster"` production definitions. Each definition preserves the existing runtime output file, canvas size, and anchor.

## Commands Run

```text
pnpm --filter @asama/asset-tools typecheck
pnpm --filter @asama/asset-tools test
pnpm run assets:import:raster
pnpm run assets:validate
pnpm run validate:generated-assets
pnpm run typecheck
pnpm test
pnpm run assets:all
```

Results:

- Imported 28 raster production assets.
- Validated production definitions and 102 generated assets.
- Validated 102 generated runtime assets.
- Full workspace typecheck and tests passed.

## Not Yet Converted

Connected construction families remain placeholder/debug SVG output and should be treated as Batch 2:

```text
building.fence.wood.connected.*
building.wall.plaster.connected.*
building.dry_moat.connected.*
building.water_moat.connected.*
```

Overlay and UX/debug assets also remain procedural SVG by design.

## Visual Notes

The Batch 1 sources are production-candidate raster inputs suitable for exercising the new import path and early in-game review. They keep transparent backgrounds, exact canvas dimensions, and existing anchor compatibility.

Items to watch during in-game review:

- Ashigaru readability at dense unit counts.
- Tenshu silhouette scale compared with storehouse/town buildings.
- Bridge and moat contrast when placed on water-heavy maps.
- Wide gate span readability at 1x zoom.
