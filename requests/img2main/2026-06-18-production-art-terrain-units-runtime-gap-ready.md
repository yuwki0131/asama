# Production Art Terrain and Units Runtime Gap Ready

## Completed Assets

Created 12 approved-production source assets under:

```text
assets/source/raster/approved-production/terrain-units-runtime-gap/
```

Terrain:

- `terrain.dirt.base`
- `terrain.water.base`
- `terrain.stone.base`
- `terrain.grass.variant.1`
- `terrain.dirt.variant.1`

Units:

- `unit.spear_ashigaru.idle.south`
- `unit.sword_ashigaru.idle.south`
- `unit.archer.idle.south`

Infrastructure:

- `building.earth_bridge`
- `building.wood_bridge`
- `building.gate.wood.closed.width2`
- `building.gate.wood.closed.width3`

## Output Files

- 12 runtime source PNGs
- `terrain-contact-sheet.png`
- `unit-contact-sheet.png`
- `runtime-composite-preview.png`
- `generation-report.md`
- `asset-map.json`
- `validation-summary.json`
- `raw/`
- `cutout/`

## Runtime Integration

Updated the corresponding 12 `source.file` entries in:

```text
assets/definitions/production-assets.json
```

Audit result:

```text
remaining approved-ai/production/batch-1 references: 0
```

Commands:

```text
pnpm run assets:import:raster
pnpm run assets:validate
```

Results:

```text
Imported 90 raster production assets.
Validated production definitions and 100 generated assets.
```

## Validation

- All PNG dimensions match production definitions.
- Alpha channels and transparent corners validated.
- Terrain diamonds reach all four canvas edges without transparent pinholes.
- Unit lowest visible pixels are at Y=52 for anchor Y=52.48.
- Wide-gate lowest visible pixels are at Y=72 for runtime anchor Y=73.
- Unit roles are visually distinct at runtime size.

## Anchor Note

The request listed wide-gate anchor Y as 62.4. Current runtime production definitions already use Y=73 after grounding corrections, so the delivered sources preserve Y=73 instead of reverting runtime geometry.

## Review

- `terrain-contact-sheet.png` contains an 8x8 mixed terrain layout at 1x and 0.5x.
- `unit-contact-sheet.png` compares spear, sword, and bow silhouettes.
- `runtime-composite-preview.png` shows units, bridges, and wide gates on approved grass.
