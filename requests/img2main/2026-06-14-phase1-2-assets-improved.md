# Phase 1-2 Assets Improved

The generated runtime assets in `public/assets/generated/` have been regenerated with more detailed art-oriented templates while preserving the existing manifest contract and stable asset IDs.

What changed:

- Terrain tiles now include stronger isometric lighting, edge shading, and per-terrain texture details.
- Ashigaru unit sprites now include a more readable silhouette, helmet, spear, sash, flag, legs, and directional variation.
- Hover/selected overlays now have clearer outlines and highlights.

Still stable:

- `public/assets/generated/manifest.json`
- all existing `assetId` values
- terrain and overlay size: `64x32`
- unit size: `48x64`
- alpha PNG output

Validation passed:

```text
pnpm run generate:main2img
pnpm run validate:generated-assets
vipsheader public/assets/generated/*.png
```

Note: `pnpm run typecheck` currently fails in the app side with:

```text
apps/game/src/client/ui/App.tsx: Cannot find module '../renderer/GameCanvas'
```

I did not change app-side code from the image pipeline side.
