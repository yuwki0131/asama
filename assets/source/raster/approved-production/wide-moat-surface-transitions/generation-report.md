# Generation Report

## Scope

Generated 114 production raster sources:

- 34 dry/water moat assets: two bases and 32 connected masks.
- 64 connected terrain assets: grass, dirt, water, and stone.
- 16 connected packed-earth road assets.

All assets use a 64x32 canvas, 32,16 anchor, 1x1 footprint, and `N,E,S,W`
mask order.

## Source Method

The two wide moat source images were generated with the built-in image
generation workflow as broad Sengoku defensive basins on removable chroma
backgrounds. Prompts required a single trench floor or water level, broad banks,
subdued Stronghold-like raster rendering, and excluded narrow channels,
crossings, text, and modern materials.

Terrain and road families reuse existing approved raster material sources.
Sharp is used only for chroma removal, material extraction, alpha masking,
canvas fitting, compositing, review sheets, and validation. T and cross masks
are clipped from one continuous material plane rather than stacked branches.

Regenerate with:

```text
pnpm --filter @asama/asset-tools assets:generate:wide-surfaces
```

## Validation

- 114/114 files have the declared 64x32 dimensions.
- 114/114 files retain transparent canvas corners.
- Same-material 12x12 terrain regions render without substrate seams.
- T and cross centers use one material height or water level.
- Opposing connected edges use the same full-edge geometry.

## Review

Required review images are stored in this directory. Repeated `1111` tiles are
seamless, but their source texture can still repeat at large zoom levels. A
future multi-variant terrain selector would reduce long-range repetition.
