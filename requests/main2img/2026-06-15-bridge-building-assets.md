# Bridge Building Assets Request

## Purpose

The main app now supports two missing infrastructure buildings:

- earth bridge / `土橋`
- wooden bridge / `木橋`

Please replace the generated placeholder PNGs with production-quality assets.

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

## Required Asset IDs

| assetId | file | size | anchor | notes |
|---|---|---:|---|---|
| `building.earth_bridge` | `generated/building-earth-bridge.png` | 64x32 | `{ "x": 0.5, "y": 0.5 }` | flat earthen bridge / raised causeway tile |
| `building.wood_bridge` | `generated/building-wood-bridge.png` | 64x32 | `{ "x": 0.5, "y": 0.5 }` | flat wooden bridge tile with planks |

## Visual Requirements

- These are flat infrastructure tiles, like road/farm, not tall above-ground buildings.
- They should sit on the isometric tile plane and must not appear to float.
- Earth bridge should read as compacted earth or a raised causeway.
- Wooden bridge should read as planks/beams crossing a moat or water channel.
- They need to remain readable when placed over water or moat-like terrain.
- Keep style consistent with the current Japanese castle RTS placeholder set.

## Runtime Behavior

The app treats both bridges as:

- category: `infrastructure`
- footprint: 1 cell
- passable: true
- allowed to be placed on normally non-passable terrain such as water/stone for MVP bridging tests

## Acceptance Criteria

- `building.earth_bridge` and `building.wood_bridge` are present in `public/assets/generated/manifest.json`.
- Both referenced PNG files exist.
- PNG dimensions and anchors match the table.
- Assets read clearly at 100% zoom.

