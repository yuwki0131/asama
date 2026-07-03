# Large Building Footprint Alignment Correction Request

## Purpose

The runtime is now using a strict isometric placement contract, but several
large building rasters still do not visually sit on their logical footprints.
This should not be hidden with renderer offsets.

Please revise the large building source rasters so their ground plane, visible
base, and outer edges match the declared `64x32` isometric footprint.

## Fixed Runtime Contract

- Projection is fixed orthographic isometric `64x32`.
- Large vertical buildings are placed by the south/bottom contact point of
  their logical footprint.
- Runtime places the sprite by manifest anchor directly.
- No per-asset renderer offsets should be required.
- The yellow footprint diamond in
  `artifacts/isometric-alignment/contact-sheet.png` is the intended logical
  ground footprint.

## Current Problem

The previous anchor-bottom correction fixed `alpha bottom == anchorY`, but that
is not sufficient for large buildings.

Observed in the current contact sheet:

- `building.town_block`: the visual district base does not match the `8x8`
  footprint diamond. The ground plane and building edges read as a different
  isometric scale/angle.
- `building.market`: the visible market ground plane is shifted and does not
  naturally sit inside the `6x4` footprint.
- `building.barracks`: similar mismatch against the `6x4` footprint.
- `building.samurai_residence`: visible compound base does not align cleanly to
  the `6x6` footprint.
- `building.storehouse`: better than the others, but should be checked against
  the same rule.

Reference output:

```text
artifacts/isometric-alignment/contact-sheet.png
artifacts/isometric-alignment/report.md
```

## Assets To Correct

Please correct these runtime asset IDs first:

| assetId | current canvas | current anchor | footprint |
| --- | ---: | ---: | ---: |
| `building.town_block` | `640x420` | `320,338` | `8x8` |
| `building.market` | `420x280` | `210,196` | `6x4` |
| `building.barracks` | `420x280` | `210,210` | `6x4` |
| `building.samurai_residence` | `460x360` | `230,273` | `6x6` |
| `building.storehouse` | `320x260` | `160,203` | `4x4` |

Measured alpha bounds currently have bottom equal to anchor, so the remaining
issue is not just vertical grounding. It is the footprint projection and visual
base shape.

## Required Visual Geometry

For each asset:

- The visible ground/base plane must be drawn as a `64x32` isometric rectangle
  matching the declared footprint.
- The south/bottom point of that footprint must coincide with the anchor pixel.
- The left and right base edges should be parallel to the tile grid edges.
- The visible foundation, walls, fences, paths, and courtyards must fit inside
  or deliberately align with the footprint diamond.
- Avoid drawing a base with a different perspective angle, wider diamond, or
  shifted local ground plane.

Do not simply move the PNG content until the bottom pixel equals the anchor.
That is already true and is not enough.

## Deliverables

Please provide:

- Corrected PNG sources.
- Updated production geometry metadata only if the corrected image requires it.
- Regenerated runtime PNGs and manifest.
- Updated `artifacts/isometric-alignment/contact-sheet.png`.
- A report with:
  - canvas
  - anchor
  - alpha bounds
  - footprint
  - whether the visual base matches the footprint diamond

## Acceptance Criteria

- `building.town_block` sits naturally on the `8x8` footprint diamond.
- `building.market` and `building.barracks` sit naturally on their `6x4`
  footprints.
- `building.samurai_residence` sits naturally on its `6x6` footprint.
- Ground plane angles match the 64x32 tile grid.
- Runtime requires no hidden per-asset offsets.
