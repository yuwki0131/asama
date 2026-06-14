# Phase 1-2 Minimal Display Assets Request

## Purpose

Main app implementation is moving toward the first playable vertical slice:

- 128x128 isometric map display
- camera pan and zoom
- cell hover/selection
- one or more units visible on the map
- selected unit movement with destination/path feedback
- simple terrain movement cost / blocked-cell visualization

We need image assets sufficient to replace or improve the current simple PixiJS shape placeholders. These do not need to be final production art. Please prioritize consistent dimensions, transparent PNG output, and stable `assetId` naming.

## Output Location

Please place generated runtime assets under:

```text
public/assets/generated/
```

Please also provide or update a manifest at:

```text
public/assets/generated/manifest.json
```

The main app will consume assets by `assetId`, not by deriving filenames from terrain/unit names.

## Manifest Shape

Please use this shape unless you need a change:

```json
{
  "version": 1,
  "generatedBy": "img-agent",
  "assets": [
    {
      "assetId": "terrain.grass.base",
      "kind": "terrain",
      "file": "generated/terrain-grass-base.png",
      "width": 64,
      "height": 32,
      "anchor": { "x": 0.5, "y": 0.5 }
    }
  ]
}
```

`file` should be relative to `public/assets/`.

## Required Assets

### Terrain Tiles

All terrain tiles should be isometric diamond PNGs, transparent outside the diamond.

| assetId | file | size | notes |
|---|---|---:|---|
| `terrain.grass.base` | `generated/terrain-grass-base.png` | 64x32 | default passable tile |
| `terrain.dirt.base` | `generated/terrain-dirt-base.png` | 64x32 | higher movement-cost / rough ground tile |
| `terrain.water.base` | `generated/terrain-water-base.png` | 64x32 | blocked tile for Phase 2 pathfinding |
| `terrain.stone.base` | `generated/terrain-stone-base.png` | 64x32 | blocked or high-cost tile, useful for pathfinding tests |

Style target:

- Japanese castle RTS, grounded and readable, not final high-detail art.
- Slight texture is useful, but avoid noisy detail that hides overlays.
- Keep tile edges readable at 100% and 75% zoom.

### Unit

For Phase 2, a single unit type is enough.

| assetId | file | size | anchor | notes |
|---|---|---:|---|---|
| `unit.ashigaru.idle.south` | `generated/unit-ashigaru-idle-south.png` | 48x64 preferred | `{ "x": 0.5, "y": 0.82 }` | standing ashigaru viewed in isometric/front-ish angle |
| `unit.ashigaru.move.south` | `generated/unit-ashigaru-move-south.png` | 48x64 preferred | `{ "x": 0.5, "y": 0.82 }` | optional; can duplicate idle if animation is not ready |

If directional variants are cheap, please add these too:

```text
unit.ashigaru.idle.north
unit.ashigaru.idle.east
unit.ashigaru.idle.west
```

But the main app only requires `unit.ashigaru.idle.south` for the next step.

### Overlays

Overlays should be transparent PNGs that sit on top of a 64x32 isometric tile.

| assetId | file | size | notes |
|---|---|---:|---|
| `overlay.cell.hover` | `generated/overlay-cell-hover.png` | 64x32 | subtle white/blue outline |
| `overlay.cell.selected` | `generated/overlay-cell-selected.png` | 64x32 | stronger gold outline |
| `overlay.move.destination` | `generated/overlay-move-destination.png` | 64x32 | destination marker, readable on grass/dirt |
| `overlay.path.step` | `generated/overlay-path-step.png` | 64x32 | small path marker, should not dominate unit |
| `overlay.cell.blocked` | `generated/overlay-cell-blocked.png` | 64x32 | red/disabled tile overlay for pathfinding debug |

## Nice-to-Have Assets

These are useful but not blocking:

| assetId | file | size | notes |
|---|---|---:|---|
| `terrain.grass.variant.1` | `generated/terrain-grass-variant-1.png` | 64x32 | visual variety |
| `terrain.dirt.variant.1` | `generated/terrain-dirt-variant-1.png` | 64x32 | visual variety |
| `overlay.unit.selection-ring` | `generated/overlay-unit-selection-ring.png` | 64x32 or 48x24 | selection ring beneath unit |

## Technical Constraints

- PNG only for now.
- Transparent background required.
- Do not overwrite files in `public/assets/placeholders/`.
- Keep all IDs stable once provided.
- Avoid embedding display names in IDs. IDs should be English, stable, and data-oriented.
- Please keep source prompts / generation metadata under `assets/source/` or `assets/intermediate/` if useful, but runtime PNGs should be in `public/assets/generated/`.

## Acceptance Criteria

The main app can proceed when:

- `public/assets/generated/manifest.json` exists.
- Every manifest `file` exists under `public/assets/`.
- Required terrain, one unit, and overlays are present.
- Assets are visually readable together on a 64x32 isometric grid.

