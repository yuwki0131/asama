# Large Directional Castle Walls and Gates Ready

Implemented `requests/main2img/2026-06-19-large-directional-wall-gates.md`.

Output:

```text
assets/source/raster/approved-production/large-directional-wall-gates/
```

## Integration

- Replaced the wall base and all 16 wall masks with 64x96 sources using anchor
  32,80.
- Added all 24 directional gate IDs for `nw_se` and `ne_sw`, widths 1-3, and
  the four valid endpoint masks.
- Preserved orientation-specific logical footprints and normalized bottom
  anchors.
- Legacy gate IDs remain available as compatibility fallbacks.
- Production definitions now contain 194 assets.

Each direction and width uses an independently generated raster source. Endpoint
states extend matching plaster-wall shoulders into the adjacent wall contact.

## Review

All requested review PNGs, `asset-map.json`, `validation-summary.json`, and
`generation-report.md` are stored in the output directory.

The remaining visual concern is extra material density at wall T/cross centers;
there are no floating gates or footprint-scale gaps.

## Verification

```text
pnpm run assets:audit:production
  passed; zero candidate/mock runtime assets
pnpm run assets:all
  passed; 204 generated assets validated
pnpm run typecheck
  passed
pnpm test
  passed; 23 tests
```
