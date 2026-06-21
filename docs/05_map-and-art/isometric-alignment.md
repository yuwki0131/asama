# Isometric Alignment Contract

## Projection

Runtime rendering uses one fixed orthographic isometric projection.

```text
tile width: 64px
tile height: 32px
screenX = (mapX - mapY) * 32
screenY = (mapX + mapY) * 16
```

Camera rotation is not supported. Zoom uses fixed steps.

```text
0.5, 0.75, 1, 1.25, 1.5, 2
```

Camera screen position is rounded to integer pixels after pan, zoom, and
initial centering.

## Asset Contract

Every production asset definition separates these values.

- `canvasWidth` / `canvasHeight`: PNG canvas size.
- `footprintWidth` / `footprintHeight`: logical occupied grid footprint.
- `anchorX` / `anchorY`: pixel in the PNG that is placed on the logical
  footprint center in world space.

The generated manifest stores normalized anchors, but source definitions must
preserve the pixel anchor values.

## Runtime Placement

Runtime placement depends on asset geometry class.

- Surface and connected linear assets are positioned by the center of their
  logical footprint.
- Large vertical buildings are positioned by the south/bottom contact point of
  their logical footprint.

The sprite is then placed by its manifest anchor. The renderer must not carry
hidden per-asset visual offsets to compensate for incorrect source art.

## Connected Socket Contract

Connected 1x1 structures use the same map-coordinate mask order as simulation:

```text
N,E,S,W = y-1, x+1, y+1, x-1
```

For 64x32 tiles, socket endpoints are measured from the anchor/contact point:

```text
N = anchor + (16,-8)
E = anchor + (16,+8)
S = anchor + (-16,+8)
W = anchor + (-16,-8)
```

Straight, corner, end, T, and cross variants must meet these socket points.
Fence and wall art should preserve socket continuity before adding material
detail.

## Draw Order

Building z-sort uses the building placement point's world `screenY`. Units use
their world `screenY`. This keeps ordering tied to the visible contact point
rather than raw map coordinates.

## Debug Overlay

Set this environment value for alignment inspection.

```text
VITE_DEBUG_ALIGNMENT=true
```

The renderer overlays:

- tile grid
- building footprint diamond
- anchor crosshair
- sprite bounds

The overlay is intended for checking whether asset anchors and footprints agree
with the fixed 64x32 projection.

## Initial Verification Targets

Use the overlay to inspect:

- `terrain.grass.base`
- `building.storehouse`
- `building.gate.wood.closed`
- `building.wall.plaster.connected.1010`
- `building.fence.wood.connected.1010`
- `building.yagura.small.normal` once that asset is added to runtime
  definitions

The first pass is accepted when buildings sit on their footprints at 1x zoom,
connected walls follow the grid line, and the anchor crosshair aligns with the
intended contact point.

Known art-side alignment corrections are tracked in:

```text
requests/main2img/2026-06-22-isometric-alignment-anchor-socket-correction.md
```

## Contact Sheet

Run this command to generate an alignment contact sheet for the initial targets.

```text
pnpm run assets:alignment:contact-sheet
```

The output is written to:

```text
artifacts/isometric-alignment/contact-sheet.png
artifacts/isometric-alignment/report.md
```
