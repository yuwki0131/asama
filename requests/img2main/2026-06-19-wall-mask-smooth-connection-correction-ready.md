# Castle Wall Mask and Smooth Connection Correction Ready

Corrected all 16 files under:

```text
assets/source/raster/approved-production/large-directional-wall-gates/
```

## Result

- Each `N,E,S,W` mask now contains only its requested directional branches.
- `0101` and `1010` use single continuous straight wall rasters.
- Single ends, four corners, four T junctions, cross, and isolated section have
  distinct topology and distinct encoded PNG bytes.
- Ten-cell runs maintain a constant roof ridge, plaster height, and stone base.
- Wall geometry remains 64x96 with anchor 32,80 and footprint 1x1.
- Directional gates for both orientations and widths 1-3 remain aligned to the
  corrected wall family.

## Review Outputs

- `wall-mask-labelled-sheet.png`
- `wall-10-cell-nw-se-run.png`
- `wall-10-cell-ne-sw-run.png`
- `wall-all-corners.png`
- `wall-all-t-junctions.png`
- `wall-cross.png`
- `wall-gate-connections-all-widths.png`
- `wall-socket-closeups.png`
- `validation-summary.json`
- `generation-report.md`

`validation-summary.json` records dimensions, transparent corners, mask IDs,
and SHA-256 hashes. Automated tests assert that all 16 wall files are
byte-distinct and that ends, straights, corners, T pieces, and cross files are
not reused.

## Verification

```text
pnpm --filter @asama/asset-tools assets:generate:directional-wall-gates
  passed; 16/16 wall SHA-256 hashes are unique
pnpm run assets:all
  passed; 204 generated assets validated
pnpm run typecheck
  passed
pnpm test
  passed; 26 tests
```
