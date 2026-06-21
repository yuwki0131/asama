# Large Directional Castle Walls and Gates

## Purpose

Replace the current undersized castle wall and gate presentation with a
production-scale defensive wall system. Gates must exist as two explicit
isometric directions, fill their logical footprint, and visually join adjacent
castle walls at either endpoint.

Read:

```text
AGENTS.md
docs/05_map-and-art/art-direction.md
docs/05_map-and-art/asset-pipeline.md
docs/05_map-and-art/map-specification.md
requests/main2img/2026-06-17-connected-fence-wall-rendering-fix.md
requests/main2img/2026-06-18-production-art-mock-removal-fortifications-surfaces.md
```

## Runtime Direction Contract

The game exposes gates as separate build choices. Do not add a rotation icon or
rotation label to the art.

```text
nw_se = upper-left to lower-right on screen
        map X axis
        wall endpoints W and E

ne_sw = upper-right to lower-left on screen
        map Y axis
        wall endpoints N and S
```

Map directions and screen directions:

```text
N = map ( 0,-1) = screen upper-right
E = map (+1, 0) = screen lower-right
S = map ( 0,+1) = screen lower-left
W = map (-1, 0) = screen upper-left
```

## Batch A: Enlarged Castle Walls

Replace the visible art for:

```text
building.wall.plaster
building.wall.plaster.connected.0000 ... 1111
```

Preserve:

```text
footprint: 1x1
mask order: N,E,S,W
```

Increase the canvas and visible structure:

```text
recommended canvas: 64x96
recommended anchor: 32,80
```

Requirements:

- The wall must be a dominant defensive structure, not a low decorative fence.
- Increase visible wall-face height by approximately 40-60% over the current art.
- White plaster body, substantial timber/stone base, and continuous roof cap.
- Straight masks form one uninterrupted wall with no repeated cell-sized huts.
- Endpoints align with the gate wall shoulders in height, roof pitch, base depth,
  material, lighting, and contact point.
- Keep horizontal socket positions compatible with the existing 64x32 grid.
- T and cross pieces remain joined construction rather than overlapping cards.
- The lowest visible wall/base pixel must remain grounded to the logical cell.

## Batch B: Directional Gates

Produce width 1, 2, and 3 gates in both directions.

Runtime IDs use this pattern:

```text
building.gate.wood.closed.{orientation}.width{width}.connected.{mask}
```

Required orientations:

```text
nw_se
ne_sw
```

Required widths:

```text
width1
width2
width3
```

Only four endpoint masks are valid per orientation:

```text
nw_se: 0000, 0100, 0001, 0101
ne_sw: 0000, 1000, 0010, 1010
```

This produces 24 directional connected gate assets.

### Logical footprints

```text
nw_se width1: 1x1
nw_se width2: 2x1
nw_se width3: 3x1

ne_sw width1: 1x1
ne_sw width2: 1x2
ne_sw width3: 1x3
```

### Recommended canvases

The art may use larger canvases when required for roofs and gate towers, but the
bottom contact must remain exact.

```text
width1: at least 96x112
width2: at least 160x120
width3: at least 224x128
```

Provide independently fitted canvases for both directions. Do not generate the
second direction by final-output horizontal mirroring because lighting, roof
faces, posts, and perspective must remain correct.

### Gate scale and footprint coverage

- The complete gate wall should span almost the full logical footprint.
- Gate wall shoulders must reach the footprint endpoints.
- Avoid a small building floating in the center of a large footprint.
- Width2 and width3 must be genuinely broader structures, not width1 stretched.
- The gate opening, doors, posts, wall shoulders, and roof must follow the stated
  isometric axis.
- Gate height must be compatible with the enlarged castle wall.
- The lowest visible base pixel must meet the bottom edge of the logical footprint.

### Connected and unconnected states

`connected.0000`:

- Both wall shoulders terminate as intentional gate end structures.
- No wall continuation may be implied beyond the footprint.

One-end connected:

- The connected endpoint continues directly into the adjacent plaster wall.
- The unconnected endpoint retains an intentional terminal shoulder.
- Do not leave a gap, floating roof cap, doubled post, or overlapping wall face.

Both-end connected:

- The gate is visually embedded in one continuous castle wall.
- Roof cap, plaster face, base, and contact shadow continue through both endpoints.
- The gate remains clearly readable as the opening in the wall.

## Runtime Compatibility

The application already emits the directional connected IDs and falls back to
the legacy gate assets until these files are registered.

Update:

```text
assets/definitions/production-assets.json
```

Add all 24 directional gate assets and replace the 17 wall assets. Legacy gate
IDs may remain as compatibility fallbacks:

```text
building.gate.wood.closed
building.gate.wood.closed.width2
building.gate.wood.closed.width3
```

Production definitions must preserve:

- exact runtime asset IDs
- declared logical footprints
- output filenames derived from asset IDs
- normalized anchors
- transparent backgrounds
- manifest compatibility

## Required Review Outputs

```text
wall-scale-comparison.png
wall-all-masks.png
gate-nw-se-all-widths.png
gate-ne-sw-all-widths.png
gate-all-connection-states.png
gate-wall-long-runs.png
gate-wall-endpoint-closeups.png
runtime-composite.png
asset-map.json
validation-summary.json
generation-report.md
```

`gate-wall-long-runs.png` must include:

- each width in both directions
- no adjacent wall
- wall on the first endpoint only
- wall on the second endpoint only
- walls on both endpoints
- at least five wall cells on both sides of one connected gate

## Validation

Run:

```text
pnpm run assets:audit:production
pnpm run assets:all
pnpm run typecheck
pnpm test
```

Report any remaining endpoint, grounding, scale, or repetition concerns.
