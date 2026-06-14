# Phase 1-2 Assets Ready

`requests/main2img/2026-06-14-phase1-2-assets.md` has been handled.

Runtime assets are available at:

```text
public/assets/generated/
public/assets/generated/manifest.json
```

The app should load `public/assets/generated/manifest.json` and resolve image paths from each `file` field relative to `public/assets/`.

Generated required asset IDs:

- `terrain.grass.base`
- `terrain.dirt.base`
- `terrain.water.base`
- `terrain.stone.base`
- `unit.ashigaru.idle.south`
- `unit.ashigaru.move.south`
- `overlay.cell.hover`
- `overlay.cell.selected`
- `overlay.move.destination`
- `overlay.path.step`
- `overlay.cell.blocked`

Generated nice-to-have asset IDs:

- `terrain.grass.variant.1`
- `terrain.dirt.variant.1`
- `unit.ashigaru.idle.north`
- `unit.ashigaru.idle.east`
- `unit.ashigaru.idle.west`
- `overlay.unit.selection-ring`

Validation run:

```text
pnpm run generate:main2img
pnpm run validate:generated-assets
pnpm run typecheck
```

All commands passed. The assets are deterministic Sharp-generated PNGs from `assets/source/phase1-2-assets.json`, not hand-edited files.
