# Production Art Mock Removal: Fortifications and Surfaces

## Purpose

Replace every runtime asset currently identified as mock/candidate by:

```text
assets/definitions/runtime-art-quality.json
```

The current images are technically valid PNGs, but many were drawn almost entirely with deterministic Sharp polygons, lines, gradients, and texture noise. They do not meet the project's production art policy.

Do not treat an asset as production merely because it is stored below `approved-production`.

Read:

```text
requests/main2img/production-art-generation-agent-prompt.md
docs/05_map-and-art/art-direction.md
docs/05_map-and-art/asset-pipeline.md
docs/05_map-and-art/production-asset-status.md
requests/main2img/2026-06-17-connected-fence-wall-rendering-fix.md
```

## Prohibited Completion Methods

The final asset must not be primarily created from:

- Sharp polygon/line/ellipse drawing.
- SVG geometry.
- Flat-color rectangles with procedural noise.
- Existing mock sprites with filters or texture overlays.
- A center-hub connected structure with cosmetic decoration.
- Naming or moving a candidate file into an approved directory.

Sharp may be used only for postprocessing:

- chroma-key removal
- alpha cleanup
- canvas fitting
- resizing
- mild sharpening
- validation
- compositing already-produced raster art modules

The visible material, silhouette, lighting, and construction detail must come from approved raster generation, hand-authored raster art, or Blender rendering.

## Output Directory

```text
assets/source/raster/approved-production/mock-removal-fortifications-surfaces/
```

## Batch A: Fortifications

Produce base + all 16 `N,E,S,W` masks for each family.

### Fence

```text
building.fence.wood
building.fence.wood.connected.0000 ... 1111
canvas: 64x64
anchor: 32,48
footprint: 1x1
```

Visual requirements:

- Sengoku-period defensive timber palisade.
- Vertical sharpened logs with irregular natural wood texture.
- Rope bindings and restrained supporting rails.
- Not a western farm fence.
- Real contact shadow, but no repeated full-cell ellipse.
- Straight runs must read as one continuous palisade.

### Plaster Wall

```text
building.wall.plaster
building.wall.plaster.connected.0000 ... 1111
canvas: 64x72
anchor: 32,56
footprint: 1x1
```

Visual requirements:

- Japanese castle wall with white plaster, visible timber/base structure, and tiled or boarded cap.
- Material depth and weathering consistent with the approved gates and large castle buildings.
- Straight runs must have continuous roof ridge, wall face, and base.
- Corners must be actual joined wall construction, not intersecting flat cards.
- T/cross masks may use a restrained structural joint, not a tower or hub.

### Dry Moat

```text
building.dry_moat
building.dry_moat.connected.0000 ... 1111
canvas: 64x32
anchor: 32,16
footprint: 1x1
```

Visual requirements:

- Excavated trench with earthen slopes, darker bottom, erosion, and contact shadow.
- Must read as depth cut into terrain rather than a brown line on top.
- Connected banks and trench bottom must continue through tile sockets.

### Water Moat

```text
building.water_moat
building.water_moat.connected.0000 ... 1111
canvas: 64x32
anchor: 32,16
footprint: 1x1
```

Visual requirements:

- Artificial defensive moat with water surface, banks, and visible depth.
- Different from natural river terrain.
- Connected shoreline and water surface must remain continuous.
- Avoid saturated blue outlines.

## Connected Geometry Contract

Mask order:

```text
N,E,S,W
```

Sockets for a 64x32 tile:

```text
N = anchor + ( 16,-8)
E = anchor + ( 16,+8)
S = anchor + (-16,+8)
W = anchor + (-16,-8)
```

Opposing sockets must align within 1px in world space.

Generate and inspect:

- all 16 masks
- 10-cell N-S and E-W runs
- square loop
- all four corners
- all four T variants
- cross
- isolated and end pieces
- fence-to-gate and wall-to-gate examples

## Batch B: Surface Assets

### Farm

```text
assetId: building.farm
canvas: 256x128
anchor: 128,64
footprint: 4x4
```

Produce a broad Sengoku-period cultivated field/paddy area with genuine raster detail. Do not recreate the current deterministic bands and lines.

### Terrain

```text
terrain.dirt.base
terrain.water.base
terrain.stone.base
terrain.grass.variant.1
terrain.dirt.variant.1
canvas: 64x32
anchor: 32,16
footprint: 1x1
```

Requirements:

- Match corrected `terrain.grass.base`.
- Fully cover the isometric diamond without fringe or pinholes.
- Natural raster material variation.
- No uniform gradient or generated-noise-only appearance.
- Base/variant tiling must not reveal a grid.

### Bridges

```text
building.earth_bridge
building.wood_bridge
canvas: 64x32
anchor: 32,16
footprint: 1x1
```

Requirements:

- Earth bridge: packed earthen defensive crossing with sloped edges.
- Wood bridge: timber planks and support construction.
- Both remain low/passable and must integrate with moat and water art.

## Required Files

Final runtime source PNGs:

- 68 fortification family files.
- 1 farm.
- 5 terrain files.
- 2 bridge files.

Total: 76 PNGs.

Review outputs:

```text
fortification-contact-sheet.png
fortification-runs.png
moat-runs.png
surface-contact-sheet.png
runtime-composite-preview.png
asset-map.json
validation-summary.json
generation-report.md
```

## Runtime Integration

Preserve every current:

- assetId
- output filename
- canvas size
- anchor
- footprint
- connection mask

Update the corresponding `source.file` values in:

```text
assets/definitions/production-assets.json
```

After successful replacement, remove every completed ID/family from:

```text
assets/definitions/runtime-art-quality.json
```

The following command must pass with zero findings:

```text
pnpm run assets:audit:production
```

Also run:

```text
pnpm run assets:all
pnpm run assets:validate
pnpm run typecheck
pnpm test
```

## Completion Report

Create:

```text
requests/img2main/2026-06-18-production-art-mock-removal-fortifications-surfaces-ready.md
```

Report:

- production source method per family
- all replaced asset IDs
- runtime source paths
- geometry validation
- socket alignment result
- long-run screenshots
- remaining quality concerns
- confirmation that `assets:audit:production` passes
