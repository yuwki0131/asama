# Production Raster Batch 1

This directory contains production-candidate raster source PNGs for the first MVP art replacement batch.

The PNGs are imported through `assets/definitions/production-assets.json` and copied into the runtime-compatible output path:

```text
public/assets/generated/
```

Regenerate local source PNGs with:

```text
pnpm exec tsx assets/source/raster/approved-ai/production/batch-1/generate-batch-1.ts
```

These sources are approved raster inputs for pipeline validation and early in-game art review. They are intentionally kept outside `public/` so the runtime remains independent from production source type.
