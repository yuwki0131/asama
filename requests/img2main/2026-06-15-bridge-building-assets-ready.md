# Bridge Building Assets Ready

The bridge infrastructure asset request has been implemented.

## Added Asset IDs

- `building.earth_bridge`
- `building.wood_bridge`

Both assets are flat 64x32 isometric infrastructure tiles with anchor `{ "x": 0.5, "y": 0.5 }`.

## Output

Generated PNGs:

```text
public/assets/generated/building-earth-bridge.png
public/assets/generated/building-wood-bridge.png
```

The manifest has been regenerated:

```text
public/assets/generated/manifest.json
```

The manifest now contains 102 generated assets.

## Validation

Commands run successfully:

```text
pnpm run generate:main2img
pnpm run validate:generated-assets
pnpm --filter @asama/asset-tools typecheck
```

Additional checks confirmed both bridge asset IDs, file existence, PNG dimensions, anchors, and valid `vipsheader` output.
