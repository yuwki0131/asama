# Building Grounding Correction Request

## Purpose

Some above-ground building assets look like they are floating over the tile. Please revise the building sprites so their bases visibly sit on the isometric tile surface.

This applies to:

- `building.fence.wood`
- `building.wall.plaster`
- `building.gate.wood.closed`
- `building.storehouse`
- all `building.fence.wood.connected.*`
- all `building.wall.plaster.connected.*`

Moat tiles and `building.honmaru.marker` are flat tile-surface assets and do not need this correction.

## Visual Requirements

- Add or strengthen contact shadows directly under the posts/walls/building base.
- Make the bottom of posts/walls touch the tile plane. Avoid visible air gaps between structure and ground.
- For fence and connected fence variants, posts should terminate near the tile surface, with small dark foot/contact marks where useful.
- For walls and connected wall variants, add a subtle base plinth or darker lower edge that reads as resting on the ground.
- For gate and storehouse, ensure the lowest visible base aligns with the tile footprint and has a contact shadow.
- Keep the visual style consistent with the existing assets.

## Anchors And Sizes

Keep current file names, asset IDs, dimensions, and anchors unchanged:

| asset family | size | anchor |
|---|---:|---|
| fence | 64x64 | `{ "x": 0.5, "y": 0.75 }` |
| wall | 64x72 | `{ "x": 0.5, "y": 0.78 }` |
| gate | 80x80 | `{ "x": 0.5, "y": 0.78 }` |
| storehouse | 96x80 | `{ "x": 0.5, "y": 0.82 }` |

## Runtime Placement Note

The app now applies a small downward render offset to above-ground buildings:

```text
fence / wall / gate / storehouse: +5 px screen Y
moats / honmaru marker: 0 px
```

Please design the corrected sprites assuming this runtime placement. The assets should still work if viewed directly in the manifest preview, but the main acceptance target is in-game placement.

## Acceptance Criteria

- Above-ground buildings no longer look suspended over the tile.
- Contact shadows are visible but not oversized.
- Connected fence and wall variants remain visually connected across tile edges.
- Existing asset IDs remain unchanged in `public/assets/generated/manifest.json`.

