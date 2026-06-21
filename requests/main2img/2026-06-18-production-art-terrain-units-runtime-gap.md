# Production Art Terrain and Units Runtime Gap

## Purpose

Replace every remaining runtime asset sourced from:

```text
assets/source/raster/approved-ai/production/batch-1/
```

These files are pipeline-compatible production candidates, but their visual quality does not match the approved-production buildings, farm, fortifications, and corrected grass tile.

Read together with:

```text
requests/main2img/production-art-generation-agent-prompt.md
docs/05_map-and-art/art-direction.md
docs/05_map-and-art/asset-pipeline.md
docs/05_map-and-art/production-asset-status.md
```

## Output Directory

```text
assets/source/raster/approved-production/terrain-units-runtime-gap/
```

Include:

```text
generation-report.md
asset-map.json
validation-summary.json
terrain-contact-sheet.png
unit-contact-sheet.png
runtime-composite-preview.png
```

## Batch A: Terrain

Preserve the existing runtime IDs, outputs, canvas, anchor, and 1x1 footprint.

| assetId | output | canvas | anchor |
|---|---|---:|---:|
| `terrain.dirt.base` | `terrain-dirt-base.png` | 64x32 | 32,16 |
| `terrain.water.base` | `terrain-water-base.png` | 64x32 | 32,16 |
| `terrain.stone.base` | `terrain-stone-base.png` | 64x32 | 32,16 |
| `terrain.grass.variant.1` | `terrain-grass-variant-1.png` | 64x32 | 32,16 |
| `terrain.dirt.variant.1` | `terrain-dirt-variant-1.png` | 64x32 | 32,16 |

Requirements:

- Match `approved-production/batch-01-corrections/terrain-grass-base.png`.
- Fixed orthographic isometric camera and upper-left lighting.
- Fully cover the 64x32 diamond edge without transparent pinholes.
- No green, white, or dark fringe along tile boundaries.
- Base and variant tiles must connect without visible seams.
- Grass variant should be a subtle natural variation, not a different biome.
- Dirt should read as compacted earth suitable for roads, yards, and exposed ground.
- Water should be subdued and readable beneath bridges and beside water moats.
- Stone should read as rocky or steep impassable ground, not masonry flooring.
- Avoid uniform gradients, geometric placeholder marks, and excessive high-frequency noise.

Preview requirements:

- At least an 8x8 mixed terrain composite.
- Include repeated base/variant adjacency.
- Include grass-dirt, grass-stone, and grass-water boundaries.
- Verify at runtime 1x zoom and 0.5x zoom.

## Batch B: Current Runtime Units

The runtime now uses unit-role-specific IDs. Do not recreate the previous generic ashigaru directional set.

| assetId | output | canvas | anchor | role |
|---|---|---:|---:|---|
| `unit.spear_ashigaru.idle.south` | `unit-spear-ashigaru-idle-south.png` | 48x64 | 24,52.48 | spear infantry |
| `unit.sword_ashigaru.idle.south` | `unit-sword-ashigaru-idle-south.png` | 48x64 | 24,52.48 | sword infantry |
| `unit.archer.idle.south` | `unit-archer-idle-south.png` | 48x64 | 24,52.48 | bow infantry |

Requirements:

- Japanese Sengoku to early Edo military appearance.
- Fixed south-facing gameplay view for this batch.
- Clear weapon silhouette at 1x zoom.
- Spear ashigaru must visibly carry a yari.
- Sword ashigaru must read as close-combat infantry, not a spear unit without a spear.
- Archer must visibly carry or ready a Japanese bow and must not look like a generic ashigaru recolor.
- Use jin-gasa, simple armor, sashimono, and restrained faction-color accents.
- Player/enemy ownership is currently applied by runtime tint, so avoid large saturated faction-colored surfaces.
- Preserve transparent background and contact shadow.
- Lowest visible foot/contact pixel should align closely with anchor Y.
- Avoid Chinese armor, western armor, fantasy proportions, thick black outlines, and icon-like simplification.

This batch is a production idle baseline only. Walk, attack, death, and four-direction animation sheets will be requested when the animation runtime exists.

## Batch C: Remaining Infrastructure Candidates

| assetId | output | canvas | anchor | footprint |
|---|---|---:|---:|---:|
| `building.earth_bridge` | `building-earth-bridge.png` | 64x32 | 32,16 | 1x1 |
| `building.wood_bridge` | `building-wood-bridge.png` | 64x32 | 32,16 | 1x1 |
| `building.gate.wood.closed.width2` | `building-gate-wood-closed-width2.png` | 128x80 | 64,62.4 | 2x1 |
| `building.gate.wood.closed.width3` | `building-gate-wood-closed-width3.png` | 192x80 | 96,62.4 | 3x1 |

Requirements:

- Bridges must remain flat/passable infrastructure and align with the 64x32 tile.
- Earth bridge must read as compacted soil crossing, not a dirt terrain duplicate.
- Wood bridge must show timber construction without becoming a tall building.
- Wide gates must match the approved 1-cell gate material, camera, roof, wood, and lighting.
- Wide gate bases must span their complete logical footprint.
- Preserve exact canvas, anchor, transparency, and output names.

## Runtime Integration Contract

Do not edit runtime asset IDs or output names.

After delivery, implementation will update only the `source.file` values in:

```text
assets/definitions/production-assets.json
```

Expected source paths:

```text
assets/source/raster/approved-production/terrain-units-runtime-gap/terrain-dirt-base.png
assets/source/raster/approved-production/terrain-units-runtime-gap/terrain-water-base.png
assets/source/raster/approved-production/terrain-units-runtime-gap/terrain-stone-base.png
assets/source/raster/approved-production/terrain-units-runtime-gap/terrain-grass-variant-1.png
assets/source/raster/approved-production/terrain-units-runtime-gap/terrain-dirt-variant-1.png
assets/source/raster/approved-production/terrain-units-runtime-gap/unit-spear-ashigaru-idle-south.png
assets/source/raster/approved-production/terrain-units-runtime-gap/unit-sword-ashigaru-idle-south.png
assets/source/raster/approved-production/terrain-units-runtime-gap/unit-archer-idle-south.png
assets/source/raster/approved-production/terrain-units-runtime-gap/building-earth-bridge.png
assets/source/raster/approved-production/terrain-units-runtime-gap/building-wood-bridge.png
assets/source/raster/approved-production/terrain-units-runtime-gap/building-gate-wood-closed-width2.png
assets/source/raster/approved-production/terrain-units-runtime-gap/building-gate-wood-closed-width3.png
```

## Validation

- Exact PNG dimensions.
- Alpha channel present.
- Transparent canvas corners where appropriate.
- Terrain seam test has no visible grid lines.
- Unit contact points align with anchor.
- Unit role is readable without labels.
- Wide gate footprint endpoints align with adjacent wall sockets.
- Report any visual concern instead of silently changing geometry.
