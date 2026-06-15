# Connected Construction Assets Correction Request

## Purpose

The first connected construction assets change visibly by mask, but the visual directions do not line up with the isometric map. Please regenerate the 64 connected variants so each `nesw` bit follows **map-coordinate adjacency**, not screen up/right/down/left.

This is a correction to:

```text
requests/main2img/2026-06-15-connected-construction-assets.md
```

## Critical Direction Mapping

The app uses an isometric projection:

```text
screenX = (mapX - mapY) * 32
screenY = (mapX + mapY) * 16
```

Therefore the `nesw` mask must map to these visual directions inside each tile:

| mask bit | map neighbor | visual direction from current tile center |
|---|---|---|
| `n` | `{ x: 0, y: -1 }` | upper-right / northeast edge |
| `e` | `{ x: 1, y: 0 }` | lower-right / southeast edge |
| `s` | `{ x: 0, y: 1 }` | lower-left / southwest edge |
| `w` | `{ x: -1, y: 0 }` | upper-left / northwest edge |

Please do **not** interpret `n/e/s/w` as screen top/right/bottom/left.

## Asset IDs To Replace

Regenerate and replace all 16 masks for each family:

```text
building.fence.wood.connected.0000
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

Keep filenames and manifest `assetId`s unchanged.

## Isolated Pieces

For `0000`, show an isolated element only:

- fence: a short standalone post/rail cluster, not a full line segment
- wall: a compact standalone wall block
- dry moat: an isolated trench patch
- water moat: an isolated water patch

Do not draw implied connections for unset bits.

## Dimensions And Anchors

Keep the same dimensions and anchors:

| family | size | anchor |
|---|---:|---|
| fence | 64x64 | `{ "x": 0.5, "y": 0.75 }` |
| wall | 64x72 | `{ "x": 0.5, "y": 0.78 }` |
| dry moat | 64x32 | `{ "x": 0.5, "y": 0.5 }` |
| water moat | 64x32 | `{ "x": 0.5, "y": 0.5 }` |

## Acceptance Examples

- `building.fence.wood.connected.1000` extends from center toward the upper-right edge only.
- `building.fence.wood.connected.0100` extends from center toward the lower-right edge only.
- `building.fence.wood.connected.0010` extends from center toward the lower-left edge only.
- `building.fence.wood.connected.0001` extends from center toward the upper-left edge only.
- `1010` is a continuous upper-right to lower-left diagonal run.
- `0101` is a continuous lower-right to upper-left diagonal run.
- `1111` is a four-way junction with all four diagonal exits.

The same direction rules apply to wall, dry moat, and water moat.

## Implementation-Side Reference

The main app will continue to select masks in this order:

```text
n = map y - 1
e = map x + 1
s = map y + 1
w = map x - 1
```

Connection compatibility remains:

- fence connects to fence and gate
- wall connects to wall and gate
- dry moat connects to dry moat
- water moat connects to water moat

