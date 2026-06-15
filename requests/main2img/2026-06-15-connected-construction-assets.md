# Connected Construction Assets Request

## Purpose

The main app now supports connected visual variants for linear structures. Please add connection-pattern assets for:

- wood fence
- plaster wall
- dry moat
- water moat

The app will compute 4-way neighbor connections and select an asset by `assetId`. Existing non-connected asset IDs should remain as fallbacks.

## Output Location

Runtime PNGs:

```text
public/assets/generated/
```

Manifest to update:

```text
public/assets/generated/manifest.json
```

## Connection Mask Naming

Use a 4-bit cardinal mask in `nesw` order:

```text
n = north neighbor exists
e = east neighbor exists
s = south neighbor exists
w = west neighbor exists
```

Each character is `1` when connected and `0` otherwise.

Examples:

- `0000`: isolated piece
- `1010`: north-south straight
- `0101`: east-west straight
- `1100`: north-east corner
- `1111`: four-way junction

## Required Asset IDs

Please generate all 16 masks for each family:

```text
building.fence.wood.connected.0000
building.fence.wood.connected.0001
...
building.fence.wood.connected.1111

building.wall.plaster.connected.0000
...
building.wall.plaster.connected.1111

building.dry_moat.connected.0000
...
building.dry_moat.connected.1111

building.water_moat.connected.0000
...
building.water_moat.connected.1111
```

## File Naming

Please use:

```text
generated/building-fence-wood-connected-0000.png
generated/building-wall-plaster-connected-0000.png
generated/building-dry-moat-connected-0000.png
generated/building-water-moat-connected-0000.png
```

and so on for every mask.

## Dimensions And Anchors

| family | size | anchor | notes |
|---|---:|---|---|
| fence | 64x64 | `{ "x": 0.5, "y": 0.75 }` | vertical posts/rails should visually connect across tile edges |
| wall | 64x72 | `{ "x": 0.5, "y": 0.78 }` | stronger wall, connected runs/corners/junctions |
| dry moat | 64x32 | `{ "x": 0.5, "y": 0.5 }` | trench shape should connect along diamond edges |
| water moat | 64x32 | `{ "x": 0.5, "y": 0.5 }` | water channel should connect smoothly |

## Connection Compatibility

The app will connect only within these groups:

- fence connects to fence and gate
- wall connects to wall and gate
- dry moat connects to dry moat
- water moat connects to water moat

Gate-specific connected variants are not required yet.

## Acceptance Criteria

- Existing base building asset IDs remain in manifest.
- All 64 connected IDs above are present.
- Every `file` exists.
- PNG sizes/anchors match manifest values.
- Assets are readable at 100% zoom and make continuous lines/corners visually clear.

