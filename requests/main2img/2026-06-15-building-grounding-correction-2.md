# Building Grounding Correction Request 2

## Purpose

Some above-ground facilities still read as floating in-game. Please strengthen grounding for the newly expanded building set as well as the existing above-ground buildings.

This supplements:

```text
requests/main2img/2026-06-15-building-grounding-correction.md
requests/main2img/2026-06-15-expanded-building-assets.md
```

## Assets To Review

Please review and correct grounding for:

- `building.fence.wood`
- `building.wall.plaster`
- `building.gate.wood.closed`
- `building.gate.wood.closed.width2`
- `building.gate.wood.closed.width3`
- `building.storehouse`
- `building.market`
- `building.barracks`
- `building.samurai_residence`
- `building.town_block`
- `building.tenshu.test`
- all `building.fence.wood.connected.*`
- all `building.wall.plaster.connected.*`

Do not change flat tile assets unless they visibly need it:

- `building.farm`
- `building.road`
- moat assets
- `building.honmaru.marker`

## Runtime Ground Offsets

The app now applies type-specific downward render offsets:

| building type | runtime Y offset |
|---|---:|
| fence / connected fence | +7 px |
| wall / connected wall | +7 px |
| gate / wide gates | +7 px |
| storehouse / market / barracks / samurai residence / town block | +9 px |
| tenshu | +10 px |
| farm / road / moats / honmaru marker | 0 px |

Please judge grounding in-game with these offsets.

## Visual Requirements

- Contact shadow should be directly below visible supports or wall bases.
- Lowest structural elements should overlap or touch the tile surface, not hover above it.
- Facility sprites should include a clear lower edge, base plinth, posts, threshold, or ground-contact marks.
- Shadows should remain subtle and should not obscure adjacent tile readability.
- Keep all current asset IDs, file names, dimensions, and anchors unchanged.

## Acceptance Criteria

- Above-ground facilities no longer appear suspended over the tile.
- New facilities and wide gates match the grounding quality of the corrected castle assets.
- Flat farm/road/moat assets remain visually on the tile plane.

