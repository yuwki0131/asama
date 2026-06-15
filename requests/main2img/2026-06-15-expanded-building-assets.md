# Expanded Building Assets Request

## Purpose

The main app now supports a broader MVP building set. Please create production-quality PNG assets for the new buildings and wide gate variants. Placeholder assets are already generated so the app can run, but these should be replaced with better art.

## Output Location

Runtime PNGs:

```text
public/assets/generated/
```

Manifest:

```text
public/assets/generated/manifest.json
```

Keep the `assetId`s unchanged.

## Required New Asset IDs

| assetId | file | size | anchor | notes |
|---|---|---:|---|---|
| `building.gate.wood.closed.width2` | `generated/building-gate-wood-closed-width2.png` | 128x80 | `{ "x": 0.5, "y": 0.78 }` | closed wooden gate spanning 2 map cells |
| `building.gate.wood.closed.width3` | `generated/building-gate-wood-closed-width3.png` | 192x80 | `{ "x": 0.5, "y": 0.78 }` | closed wooden gate spanning 3 map cells |
| `building.market` | `generated/building-market.png` | 96x80 | `{ "x": 0.5, "y": 0.82 }` | small market / merchant stall |
| `building.barracks` | `generated/building-barracks.png` | 96x80 | `{ "x": 0.5, "y": 0.82 }` | ashigaru barracks / training building |
| `building.samurai_residence` | `generated/building-samurai-residence.png` | 96x80 | `{ "x": 0.5, "y": 0.82 }` | bukeyashiki / samurai residence |
| `building.town_block` | `generated/building-town-block.png` | 96x80 | `{ "x": 0.5, "y": 0.82 }` | compact machi district block |
| `building.farm` | `generated/building-farm.png` | 64x32 | `{ "x": 0.5, "y": 0.5 }` | flat farmland tile |
| `building.road` | `generated/building-road.png` | 64x32 | `{ "x": 0.5, "y": 0.5 }` | flat road tile |
| `building.tenshu.test` | `generated/building-tenshu-test.png` | 112x104 | `{ "x": 0.5, "y": 0.88 }` | one test tenshu keep variant |

## Visual Direction And Placement

The game is rendered in an isometric projection:

```text
screenX = (mapX - mapY) * 32
screenY = (mapX + mapY) * 16
```

Wide gates use multi-cell footprints along map X:

- width2 occupies `{ x: 0, y: 0 }` and `{ x: 1, y: 0 }`
- width3 occupies `{ x: 0, y: 0 }`, `{ x: 1, y: 0 }`, `{ x: 2, y: 0 }`

The app renders wide gates at the center of their footprint, so the PNG should be centered around the full span.

## Style Requirements

- Match the existing Japanese castle RTS placeholder style and scale.
- Above-ground buildings should include contact shadows and grounded bases so they do not look like they float.
- Farm and road should sit flat on the tile surface and should not use above-ground building shadows.
- The tenshu is for testing only, but should be visually distinct and taller than normal buildings.
- Wide gates should clearly read as the same gate family as `building.gate.wood.closed`.

## Runtime Behavior

The app currently treats:

- market, barracks, samurai residence, town block, storehouse, tenshu as blocking buildings
- farm as passable with slower movement
- road as passable
- wide gates as closed and blocking

## Acceptance Criteria

- All listed `assetId`s are present in `public/assets/generated/manifest.json`.
- Every referenced file exists.
- PNG dimensions and anchors match the table.
- Art reads clearly at 100% zoom.
- Wide gate sprites visually cover their 2-cell / 3-cell spans.

