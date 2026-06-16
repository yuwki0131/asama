# Production Art Batch 01 Corrections Ready

Created runtime-compatible corrected source PNGs for the two requested assets.

## Corrected Asset IDs

- `building.storehouse`
- `building.gate.wood.closed`

## Output Files

```text
assets/source/raster/approved-production/batch-01-corrections/building-storehouse.png
assets/source/raster/approved-production/batch-01-corrections/building-gate-wood-closed.png
assets/source/raster/approved-production/batch-01-corrections/contact-sheet.png
assets/source/raster/approved-production/batch-01-corrections/generation-report.md
```

## Runtime Compatibility

- `building.storehouse`: `96x80`, anchor `48,65.6`, footprint `1x1`
- `building.gate.wood.closed`: `80x80`, anchor `40,62.4`, footprint `1x1`

Both files keep the current runtime output filenames and transparent PNG format.

## Validation

Checked both corrected PNGs for:

- exact dimensions
- alpha channel
- transparent corners
- non-empty subject coverage

Representative `vipsheader` reads succeeded for both files.

## Notes

These are approved-production correction sources only. I did not modify runtime manifest wiring in this step because the request only asked for corrected source output and reporting.
