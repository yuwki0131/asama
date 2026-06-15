# Building Grounding Correction Ready

The above-ground building grounding correction has been implemented in the generated asset templates.

## Updated Families

- `building.fence.wood`
- `building.wall.plaster`
- `building.gate.wood.closed`
- `building.storehouse`
- `building.fence.wood.connected.*`
- `building.wall.plaster.connected.*`

The generated sprites now include stronger contact shadows, post foot marks, and lower base/plinth edges where appropriate. File names, asset IDs, dimensions, and anchors were kept unchanged.

Moat tiles and `building.honmaru.marker` remain flat tile-surface assets.

## Validation

Commands run successfully:

```text
pnpm run generate:main2img
pnpm run validate:generated-assets
pnpm --filter @asama/asset-tools typecheck
```

The regenerated manifest contains 100 assets and validates against the files in `public/assets/generated/`.
