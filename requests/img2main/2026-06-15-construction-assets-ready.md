# Construction Assets Ready

`requests/main2img/2026-06-15-construction-assets.md` has been handled.

Runtime assets are available at:

```text
public/assets/generated/
public/assets/generated/manifest.json
```

Existing Phase 1-2 asset IDs remain in the manifest. The following construction assets were added:

- `building.fence.wood`
- `building.wall.plaster`
- `building.gate.wood.closed`
- `building.dry_moat`
- `building.water_moat`
- `building.storehouse`
- `building.honmaru.marker`
- `overlay.build.valid`
- `overlay.build.invalid`
- `overlay.demolish.target`

Validation run:

```text
pnpm run generate:main2img
pnpm run validate:generated-assets
pnpm --filter @asama/asset-tools typecheck
vipsheader public/assets/generated/*.png
```

All image-pipeline checks passed. The manifest now contains 27 assets. All PNGs have alpha channels, and the new asset dimensions match the request:

- fence: `64x64`
- plaster wall: `64x72`
- closed gate: `80x80`
- dry/water moat and honmaru marker: `64x32`
- storehouse: `96x80`
- construction overlays: `64x32`
