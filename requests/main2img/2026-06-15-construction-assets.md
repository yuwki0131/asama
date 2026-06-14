# Construction Vertical Slice Assets Request

## Purpose

The main app is adding the first construction vertical slice:

- select a build tool
- place one-cell castle/economy structures on the fixed 128x128 isometric map
- show passable vs blocked cells
- remove placed structures
- use placed structures in pathfinding

These assets do not need to be final production art. They should be readable placeholders that match the existing generated terrain/unit style.

## Output Location

Please place runtime PNGs under:

```text
public/assets/generated/
```

Please update:

```text
public/assets/generated/manifest.json
```

Keep existing asset IDs stable. Add new entries only.

## Required Building Assets

All assets should be transparent PNGs. Use the same 64x32 isometric cell footprint unless noted otherwise.

| assetId | file | size | anchor | notes |
|---|---|---:|---|---|
| `building.fence.wood` | `generated/building-fence-wood.png` | 64x64 | `{ "x": 0.5, "y": 0.75 }` | low wooden fence, blocks movement |
| `building.wall.plaster` | `generated/building-wall-plaster.png` | 64x72 | `{ "x": 0.5, "y": 0.78 }` | stronger wall/hei, blocks movement |
| `building.gate.wood.closed` | `generated/building-gate-wood-closed.png` | 80x80 | `{ "x": 0.5, "y": 0.78 }` | closed gate, blocks movement for now |
| `building.dry_moat` | `generated/building-dry-moat.png` | 64x32 | `{ "x": 0.5, "y": 0.5 }` | dry moat cell, passable but high cost |
| `building.water_moat` | `generated/building-water-moat.png` | 64x32 | `{ "x": 0.5, "y": 0.5 }` | water moat cell, blocks movement |
| `building.storehouse` | `generated/building-storehouse.png` | 96x80 | `{ "x": 0.5, "y": 0.82 }` | kura/storehouse, blocks movement |
| `building.honmaru.marker` | `generated/building-honmaru-marker.png` | 64x32 | `{ "x": 0.5, "y": 0.5 }` | honmaru area marker/flag, should read as selected core cell |

## Required Construction Overlays

| assetId | file | size | anchor | notes |
|---|---|---:|---|---|
| `overlay.build.valid` | `generated/overlay-build-valid.png` | 64x32 | `{ "x": 0.5, "y": 0.5 }` | green/blue placement preview |
| `overlay.build.invalid` | `generated/overlay-build-invalid.png` | 64x32 | `{ "x": 0.5, "y": 0.5 }` | red invalid placement preview |
| `overlay.demolish.target` | `generated/overlay-demolish-target.png` | 64x32 | `{ "x": 0.5, "y": 0.5 }` | removal target preview |

## Style Notes

- Match the existing generated assets in `public/assets/generated/`.
- Keep the tile footprint clear so the app can still show hover/path overlays.
- Buildings should visually sit on the selected isometric cell.
- One-cell assets are enough for this vertical slice. Multi-cell buildings can come later.

## Acceptance Criteria

- `public/assets/generated/manifest.json` validates.
- Every new manifest entry points to an existing PNG.
- Required IDs above are present.
- PNG sizes and anchors match manifest values.
- Existing phase1-2 assets remain available.

