# Connected Construction Assets Ready

`requests/main2img/2026-06-15-connected-construction-assets.md` has been handled.

Runtime assets are available at:

```text
public/assets/generated/
public/assets/generated/manifest.json
```

Added 64 connected construction assets:

- `building.fence.wood.connected.0000` through `building.fence.wood.connected.1111`
- `building.wall.plaster.connected.0000` through `building.wall.plaster.connected.1111`
- `building.dry_moat.connected.0000` through `building.dry_moat.connected.1111`
- `building.water_moat.connected.0000` through `building.water_moat.connected.1111`

The mask order is `nesw`, matching the request.

Existing base building asset IDs remain in the manifest:

- `building.fence.wood`
- `building.wall.plaster`
- `building.dry_moat`
- `building.water_moat`

Validation run:

```text
pnpm run generate:main2img
pnpm run validate:generated-assets
pnpm --filter @asama/asset-tools typecheck
vipsheader public/assets/generated/building-*-connected-*.png
```

All image-pipeline checks passed. The manifest now contains 91 assets, including all 64 connected variants.
