# Wide Moat and Surface Transition Correction

## Purpose

The current dry-moat and water-moat assets read as narrow lines placed over a
tile. Replace them with broad excavated surfaces that occupy almost the entire
64x32 isometric cell. Also provide connected surface art for terrain and roads
so adjacent cells form continuous areas without visible grid seams.

Read:

```text
AGENTS.md
docs/05_map-and-art/art-direction.md
docs/05_map-and-art/asset-pipeline.md
requests/main2img/2026-06-18-production-art-mock-removal-fortifications-surfaces.md
requests/img2main/2026-06-18-production-art-mock-removal-fortifications-surfaces-ready.md
```

## Non-negotiable Geometry

Mask order remains:

```text
N,E,S,W
```

For every connected family, produce all 16 masks. Straight, corner, T, and
cross assets must be purpose-composed continuous surfaces. Do not create T or
cross pieces by stacking branches with visible over/under crossings or a dense
center hub.

At a T or cross:

- all participating surface areas merge into one uninterrupted plane
- there is no vertical ordering
- there is no bridge-like overlap
- the center has one consistent water level, trench floor, soil height, or road surface
- banks, shores, ruts, and material grain flow through the junction

## Batch A: Wide Moats

Replace:

```text
building.dry_moat
building.dry_moat.connected.0000 ... 1111
building.water_moat
building.water_moat.connected.0000 ... 1111
```

Preserve:

```text
canvas: 64x32
anchor: 32,16
footprint: 1x1
```

Requirements:

- The excavation/water body should use approximately 85-95% of the isometric
  diamond width and 75-90% of its height where the mask permits.
- It must read as a moat cell, not a narrow channel or drawn line.
- Banks may remain around the outer perimeter, but the bank must not reduce the
  usable moat surface to a thin stripe.
- `1111` must be one broad unified basin.
- T masks such as `1110` must be one broad unified T-shaped basin.
- Straight masks must keep nearly full-cell width while joining neighboring
  sockets without necking down.
- Corners must have a broad rounded or excavated inner join, not two thin arms.
- Dry moat: continuous trench floor and slopes, with no branch overlap.
- Water moat: one water level and continuous shoreline, with no branch overlap.
- Avoid transparent pinholes and avoid bright outlines at tile boundaries.

## Batch B: Connected Terrain

Add these runtime families:

```text
terrain.grass.connected.0000 ... 1111
terrain.dirt.connected.0000 ... 1111
terrain.water.connected.0000 ... 1111
terrain.stone.connected.0000 ... 1111
```

Each asset:

```text
canvas: 64x32
anchor: 32,16
footprint: 1x1
kind: terrain
```

The mask indicates neighbors of the same terrain material. The game runtime now
selects these IDs and falls back to the existing base asset until they exist.
The renderer uses one continuous grass-colored substrate below all terrain
sprites. Intentional soft edge alpha may reveal that substrate, but isolated
transparent pinholes inside a material region are not allowed.

Requirements:

- Same-material neighbors must form a visually continuous area.
- `1111` fills the complete diamond and has no internal border.
- Missing-mask edges form an irregular, natural transition edge rather than a
  straight green, blue, brown, or gray line.
- T and cross surfaces are unified; never layer branch strips over each other.
- Water has a continuous water level and shoreline treatment.
- Dirt and grass boundaries use restrained feathering and scattered material
  intrusion without transparent gaps.
- Stone boundaries use broken rock/soil edges rather than a clean polygon.
- Opposing tile edges must meet without pinholes or background-colored seams.
- Maintain restrained variation so repeated `1111` tiles do not reveal a grid.
- Non-grass boundary alpha must include its own material edge detail so the
  shared grass substrate reads as a bank or verge, not a bright green outline.

## Batch C: Road Connections

Add:

```text
building.road.connected.0000 ... 1111
```

Preserve:

```text
canvas: 64x32
anchor: 32,16
footprint: 1x1
```

Requirements:

- Packed-earth road surfaces connect as one plane.
- T and cross pieces are unified junctions without a center patch or branch overlap.
- Road edges blend naturally into grass/dirt terrain.
- Straight roads must not shrink into thin lines.

## Batch D: Surface Contact Corrections

Review and correct if needed:

```text
building.farm
building.earth_bridge
building.wood_bridge
```

Requirements:

- Farm perimeter must blend into surrounding ground without a rigid rectangular
  or diamond-colored fringe.
- Bridges must meet the new wide moat and water edges without visible gaps.
- Bridge art stays above the moat/water visually, but the water or trench below
  must not appear as a branch crossing at T/cross junctions.

## Runtime Integration

Use approved raster production sources. Do not use SVG or deterministic Sharp
drawing as final visible art.

Update:

```text
assets/definitions/production-assets.json
```

Replace the 34 existing moat source references and add:

- 64 connected terrain assets
- 16 connected road assets

Preserve stable IDs, filenames, canvases, anchors, and runtime manifest format.

## Required Review Outputs

```text
wide-moat-all-masks.png
wide-moat-10-cell-runs.png
wide-moat-t-and-cross-closeup.png
terrain-all-masks.png
terrain-large-regions.png
terrain-mixed-boundaries.png
road-all-masks.png
surface-runtime-composite.png
asset-map.json
validation-summary.json
generation-report.md
```

`terrain-large-regions.png` must show at least 12x12-cell same-material areas.
`terrain-mixed-boundaries.png` must show grass/dirt, grass/stone, dirt/stone,
and land/water boundaries at native gameplay scale.

## Validation

Run:

```text
pnpm run assets:audit:production
pnpm run assets:all
pnpm run typecheck
pnpm test
```

Report the output directory and any remaining seam or repetition concerns.
