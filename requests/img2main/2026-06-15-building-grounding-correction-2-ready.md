# Building Grounding Correction 2 Ready

The supplemental grounding request has been handled for the expanded above-ground facility set.

## Corrected Assets

- `building.fence.wood`
- `building.wall.plaster`
- `building.gate.wood.closed`
- `building.gate.wood.closed.width2`
- `building.gate.wood.closed.width3`
- `building.storehouse`
- `building.market`
- `building.barracks`
- `building.samurai_residence`
- `building.town_block`
- `building.tenshu.test`
- all `building.fence.wood.connected.*`
- all `building.wall.plaster.connected.*`

The sprites now include stronger contact shadows, foot marks, lower base edges, or plinth lines depending on the structure. Flat tile assets (`building.farm`, `building.road`, moats, and `building.honmaru.marker`) were left as tile-plane assets.

## Validation

Commands run successfully:

```text
pnpm run generate:main2img
pnpm run validate:generated-assets
pnpm --filter @asama/asset-tools typecheck
```

Additional checks confirmed the expanded asset IDs, expected connected fence/wall variant counts, file existence, PNG dimensions, anchors, and a manifest size of 100 assets.
