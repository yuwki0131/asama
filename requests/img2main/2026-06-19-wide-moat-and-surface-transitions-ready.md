# Wide Moat and Surface Transition Correction Ready

## Result

Implemented the complete request from
`requests/main2img/2026-06-19-wide-moat-and-surface-transitions.md`.

Output directory:

```text
assets/source/raster/approved-production/wide-moat-surface-transitions/
```

## Runtime Integration

- Replaced `building.dry_moat` and `building.water_moat`, including all 32
  connected mask sources.
- Added all 64 `terrain.{grass,dirt,water,stone}.connected.0000...1111`
  production definitions.
- Added all 16 `building.road.connected.0000...1111` definitions.
- Preserved 64x32 canvases, 32,16 anchors, 1x1 footprints, output names, and
  runtime manifest format.
- Total production definitions increased from 90 to 170.

Farm and bridge sources remain unchanged. Review against the new broad moat
edges found no transparent contact gap requiring source replacement.

## Art Method

Wide moat materials were produced with built-in raster image generation.
Connected masks use one continuous raster plane per tile; T/cross assets do not
stack branches or introduce center hubs. Terrain and road material comes from
existing approved raster sources.

## Review Outputs

- `wide-moat-all-masks.png`
- `wide-moat-10-cell-runs.png`
- `wide-moat-t-and-cross-closeup.png`
- `terrain-all-masks.png`
- `terrain-large-regions.png`
- `terrain-mixed-boundaries.png`
- `road-all-masks.png`
- `surface-runtime-composite.png`
- `asset-map.json`
- `validation-summary.json`
- `generation-report.md`

## Remaining Concern

Large same-material regions are seam-free, but a single `1111` texture can
still show repetition at high zoom. Supporting multiple connected full-tile
variants would address this without changing the current connection contract.

## Verification

All required commands passed on 2026-06-19:

```text
pnpm run assets:audit:production
  passed; zero candidate/mock runtime assets
pnpm run assets:all
  passed; 180 generated assets validated
pnpm run typecheck
  passed
pnpm test
  passed; 23 tests
```
