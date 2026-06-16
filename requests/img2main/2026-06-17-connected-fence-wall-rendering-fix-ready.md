# Connected Fence and Wall Rendering Fix Ready

## Cause

The connected fence/wall renderer used a center-hub model: every connected sprite drew branches from an arbitrary center point. This made straight lines show repeated hubs, posts, caps, and per-cell shadows. Fence anchors were also inconsistent across masks, and production import did not regenerate runtime manifest anchors from production definitions.

## Coordinate Contract

Added `packages/asset-tools/src/connectedGeometry.ts`.

- Mask bit order is fixed as `N,E,S,W`.
- Ground center is the sprite anchor pixel.
- Sockets are computed from anchor and tile size:
  - `N = anchor + (16,-8)`
  - `E = anchor + (16,+8)`
  - `S = anchor + (-16,+8)`
  - `W = anchor + (-16,-8)`
- Straight masks are single socket-to-socket segments.
- Corners, ends, T, and cross masks use the same sockets.

## Anchor Changes

- Fence base and all connected masks: `32,48` normalized to `0.5,0.75`.
- Wall base and all connected masks: `32,56` normalized to `0.5,0.7777777777777778`.
- `assets:import:raster` now writes `public/assets/generated/manifest.json` from production definitions, so runtime manifest anchors match source geometry.

## Mask and Gate Handling

Simulation mask order remains `N,E,S,W`.

Tests cover:

- straight, corner, T, cross mask interpretation
- adjacent socket alignment within 1px
- fence/wall/gate mask recalculation
- wide gate endpoint connection
- demolition mask recalculation
- base/connected anchor consistency

No fence-wall transition variant was implemented. Fence and wall remain separate same-family connected systems, with gate connection supported.

## Modified Files

- `packages/asset-tools/src/connectedGeometry.ts`
- `packages/asset-tools/src/templates.ts`
- `packages/asset-tools/src/generateGeneratedAssets.ts`
- `packages/asset-tools/src/productionPipeline.ts`
- `packages/asset-tools/src/connectedGeometry.test.ts`
- `packages/simulation/src/connectedBuildings.test.ts`
- `assets/definitions/production-assets.json`
- `assets/source/raster/approved-production/fortification-linear/*fence*`
- `assets/source/raster/approved-production/fortification-linear/*wall*`
- `public/assets/generated/*fence*`
- `public/assets/generated/*wall*`
- `public/assets/generated/manifest.json`

## Visual Contact Sheets

Generated:

```text
artifacts/connected-structures/fence-masks.png
artifacts/connected-structures/wall-masks.png
artifacts/connected-structures/fence-runs.png
artifacts/connected-structures/wall-runs.png
artifacts/connected-structures/gate-connections.png
```

The run sheets include 8-cell straight lines, square loops, corners, T/cross samples, isolated, and end pieces. Gate sheet includes 1-cell gate + fence, 1-cell gate + wall, 2-cell gate + wall endpoints, and 3-cell gate + wall endpoints.

## Validation

Commands run:

```text
pnpm run assets:generate:placeholder
pnpm run generate:main2img
pnpm run validate:generated-assets
pnpm run assets:import:raster
pnpm run assets:validate
pnpm run typecheck
pnpm test
```

Results:

```text
Generated 5 placeholder assets.
Generated 102 requested assets.
Validated 102 assets.
Imported 92 raster production assets.
Validated production definitions and 92 generated assets.
typecheck passed.
tests passed: asset-tools 13, simulation 4.
```

## Remaining Production Art Tasks

Fence and wall connected shapes now use correct sockets and anchors, but these are still compact 1x1 raster/debug-style sprites. A later Blender or hand-authored production pass should improve material richness while preserving this socket and anchor contract.
