# Isometric Alignment Anchor / Socket Correction Request

## Purpose

The runtime renderer is being corrected to use a strict isometric placement
contract. Some current production rasters do not match that contract closely
enough, so this must not be hidden by renderer offsets.

Please correct the source raster assets and geometry metadata where necessary.

## Fixed Runtime Contract

- Projection: fixed orthographic isometric `64x32`.
- Tile center:
  - `screenX = (mapX - mapY) * 32`
  - `screenY = (mapX + mapY) * 16`
- Surface and connected linear assets place their anchor at the tile/footprint
  center.
- Large vertical buildings place their anchor at the south/bottom contact point
  of the logical footprint.
- Runtime sprites must use the manifest anchor directly. Do not assume hidden
  renderer offsets.

## Connected Socket Contract

Connected masks use simulation bit order:

```text
N,E,S,W = y-1, x+1, y+1, x-1
```

For `64x32` tiles, socket endpoints are measured from the anchor/contact point:

```text
N = anchor + (16,-8)
E = anchor + (16,+8)
S = anchor + (-16,+8)
W = anchor + (-16,-8)
```

Straight, corner, end, T, and cross variants must meet those sockets. Prioritize
socket continuity over decorative material detail.

## Assets To Correct First

### `building.wall.plaster.connected.*`

Current measured problem:

- Runtime geometry says `64x96`, anchor `32,80`.
- Measured alpha bounds for `1010`: `minX=7,minY=15,maxX=54,maxY=65`.
- The visible wall bottom is about `15px` above the declared anchor.
- In debug overlay this reads as the wall floating away from the grid/socket
  line.

Please regenerate or correct all 16 connected wall masks so that:

- The declared anchor is the actual socket/contact point.
- Opposing straight masks (`0101`, `1010`) form smooth continuous runs.
- End/corner/T/cross masks use only the requested branches.
- No mask contains a hidden vertical offset relative to the socket contract.

### `building.fence.wood.connected.*`

Current measured problem:

- Runtime geometry says `64x64`, anchor `32,48`.
- Measured alpha bounds for `1010`: `minX=10,minY=31,maxX=54,maxY=58`.
- The visible fence extends about `10px` below the declared anchor.
- In debug overlay this reads as the fence being sunk/shifted relative to the
  socket line.

Please regenerate or correct all 16 connected fence masks so that:

- The declared anchor is the actual socket/contact point.
- Posts/rails meet the socket endpoints without per-mask vertical drift.
- Isolated/end/corner/T/cross masks remain visually distinct but socket-aligned.

### `building.storehouse`

Current runtime source:

- `320x260`, footprint `4x4`, anchor `160,203`.
- Measured alpha bounds: `minX=41,minY=14,maxX=293,maxY=203`.

The renderer will treat large vertical buildings as anchored at the south/bottom
contact point of the footprint. Please confirm or correct the raster so that the
visible base sits naturally inside a `4x4` footprint whose south point is the
anchor.

### `building.gate.wood.closed` and connected gate variants

Current width-1 closed gate:

- `80x80`, anchor `40,61`.
- Measured alpha bounds: `minX=15,minY=8,maxX=65,maxY=61`.

Please verify that gate variants align to the same socket contract as wall
endpoints. Gate art should connect to wall sockets without renderer offsets.

### `building.yagura.small.normal`

This asset is still missing from the runtime manifest. Please provide the source
and geometry metadata under the same contract:

- vertical building
- anchor at south/bottom contact point
- footprint to be confirmed by implementation/design before final runtime
  adoption

## Required Deliverables

Please provide:

- Corrected PNG sources.
- Updated `asset-map.json` or production geometry metadata.
- A contact sheet with:
  - tile grid
  - footprint diamond
  - anchor crosshair
  - sprite bounds
  - socket points for connected masks
- A short report listing canvas size, anchor pixel, alpha bounds, footprint, and
  any remaining concern per asset family.

## Acceptance Criteria

- No renderer-only per-asset visual offset is needed.
- `building.wall.plaster.connected.1010` and
  `building.fence.wood.connected.1010` follow the grid line at 1x zoom.
- Straight wall/fence runs do not show vertical stepping.
- Gate endpoints meet wall sockets.
- Large vertical buildings sit on the footprint rather than hovering above it.
