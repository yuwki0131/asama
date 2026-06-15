# Expanded Building Assets Ready

The expanded MVP building asset request has been implemented.

## Output

Generated PNGs are available under:

```text
public/assets/generated/
```

The manifest has been regenerated:

```text
public/assets/generated/manifest.json
```

## Added/Updated Asset IDs

- `building.gate.wood.closed.width2`
- `building.gate.wood.closed.width3`
- `building.market`
- `building.barracks`
- `building.samurai_residence`
- `building.town_block`
- `building.farm`
- `building.road`
- `building.tenshu.test`

All requested file names, dimensions, and anchors match the request table. The manifest now contains 100 generated assets.

## Validation

Commands run successfully:

```text
pnpm run generate:main2img
pnpm run validate:generated-assets
pnpm --filter @asama/asset-tools typecheck
```

Additional checks confirmed the 9 requested asset IDs exist, referenced files exist, PNG dimensions match, anchors match, and representative `vipsheader` reads are valid.
