# Production Art Mock Removal: Fortifications and Surfaces Ready

## Result

All 76 assets requested in
`requests/main2img/2026-06-18-production-art-mock-removal-fortifications-surfaces.md`
have approved raster replacements.

## Source Methods

- Fence and plaster wall: image-generated raster construction modules, alpha
  cleanup, then raster-only connected-mask compositing.
- Dry and water moats: image-generated trench/water modules, then raster-only
  socket-aligned mask compositing.
- Farm, terrain, and bridges: image-generated raster sources fitted to the
  existing runtime canvases.

Runtime sources are under:

```text
assets/source/raster/approved-production/mock-removal-fortifications-surfaces/
```

`assets/definitions/production-assets.json` now references these sources for:

- `building.fence.wood` and all 16 connected masks.
- `building.wall.plaster` and all 16 connected masks.
- `building.dry_moat` and all 16 connected masks.
- `building.water_moat` and all 16 connected masks.
- `building.farm`.
- Five requested terrain IDs.
- `building.earth_bridge` and `building.wood_bridge`.

## Validation

- 76/76 canvas dimensions match.
- Existing anchors, footprints, output names, and mask IDs are preserved.
- Transparent-corner validation passes for all assets.
- Opposing `N,E,S,W` sockets align within 1 px.
- Long runs, loops, corners, T pieces, crosses, and gate connections are shown
  in `fortification-runs.png` and `moat-runs.png`.

Review sheets, `asset-map.json`, `validation-summary.json`, and
`generation-report.md` are stored beside the sources.

## Quality Note

T/cross pieces can show increased material density at branch overlaps. This is
acceptable at the current gameplay scale, but a dedicated joint-art pass remains
the next improvement if closer zoom levels are adopted.

## Command Results

All required commands passed on 2026-06-18:

```text
pnpm run assets:audit:production
  passed; zero candidate/mock runtime assets
pnpm run assets:all
  completed; 100 generated assets validated
pnpm run assets:validate
  passed; production definitions and 100 assets validated
pnpm run typecheck
  passed
pnpm test
  passed; 17 tests across asset-tools and simulation
```
