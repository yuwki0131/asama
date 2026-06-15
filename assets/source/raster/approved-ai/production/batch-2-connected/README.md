# Production Raster Batch 2 Connected

This directory contains production-candidate raster source PNGs for connected construction families.

Mask bit order is:

```text
N,E,S,W
```

Regenerate local source PNGs with:

```text
pnpm --filter @asama/asset-tools exec tsx ../../assets/source/raster/approved-ai/production/batch-2-connected/generate-batch-2-connected.ts
```

Runtime output remains `public/assets/generated/` through `pnpm run assets:import:raster`.
