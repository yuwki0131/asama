# Castle Wall Mask and Smooth Connection Correction

## Problem

The delivered wall mask family contains repeated, incorrect images:

```text
0001, 0100, 0101 are identical
0010, 1000, 1010 are identical
most corner, T, and cross masks are identical
```

As a result:

- a one-end wall can appear as a T junction
- a two-end straight wall can show extra branches
- long NW-SE and NE-SW runs become visually jagged
- wall-to-gate joins change height and roof alignment between cells

This is not a runtime mask-selection issue. The runtime selects the expected
`N,E,S,W` IDs. The raster content for those IDs is incorrect.

## Required Replacement

Correct:

```text
building.wall.plaster.connected.0000 ... 1111
```

Keep:

```text
canvas: 64x96
anchor: 32,80
footprint: 1x1
mask order: N,E,S,W
```

## Direction Contract

```text
N = map y-1 = screen upper-right
E = map x+1 = screen lower-right
S = map y+1 = screen lower-left
W = map x-1 = screen upper-left
```

Each mask must contain exactly the requested exits. No unrequested wall face,
roof cap, shadow, or cropped branch may remain visible.

## Smooth Straight Runs

`1010` and `0101` must each be a single purpose-made continuous wall section.
Do not construct a straight wall by joining two mismatched half-images.

Across a 10-cell run:

- roof ridge follows one straight isometric line
- plaster wall top and bottom follow one straight isometric line
- stone/timber base follows one straight isometric line
- wall height remains constant
- no alternating vertical offset
- no sawtooth silhouette
- no repeated center pillar, seam, cap, or brightness pulse

Opposing sockets must align within 1 px in world space.

## Ends, Corners, T, and Cross

- Single-end masks show one exit only.
- Corners show two exits only and use a purpose-made joined corner.
- T masks show three exits only.
- `1111` shows four exits only.
- T and cross centers must be bespoke unified construction, not several full
  wall sprites stacked over each other.
- Transparent canvas clipping must not remove roof, plaster, or base at a valid socket.

## Gate Connections

Use the directional gate family from:

```text
requests/main2img/2026-06-19-large-directional-wall-gates.md
```

For both gate orientations and widths 1-3:

- wall roof ridge meets gate shoulder roof without a step
- plaster face meets without a gap or overlap
- base height and thickness remain constant
- wall endpoint and gate shoulder share the same socket position
- no doubled terminal post
- no cropped half-wall visible behind the gate

## Production Method

The application currently uses approved raster half-segment recomposition as an
interim correction. Replace that interim output with dedicated production
raster art for:

- two straight directions
- four ends
- four corners
- four T junctions
- one cross
- one isolated section

Do not regenerate the family by compositing complete wall sprites or by using
the same raster for different masks.

## Required Review

```text
wall-mask-labelled-sheet.png
wall-10-cell-nw-se-run.png
wall-10-cell-ne-sw-run.png
wall-all-corners.png
wall-all-t-junctions.png
wall-cross.png
wall-gate-connections-all-widths.png
wall-socket-closeups.png
validation-summary.json
generation-report.md
```

The labelled sheet must print each mask beside its image so swapped or duplicate
masks can be identified.

## Validation

All 16 wall PNG files must be byte-distinct. Also verify that each requested
socket has opaque wall pixels and each unrequested socket does not contain a
continuing wall branch.

Run:

```text
pnpm --filter @asama/asset-tools assets:generate:directional-wall-gates
pnpm run assets:all
pnpm run typecheck
pnpm test
```
