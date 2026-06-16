# Production Fortification Linear Assets Report

## Scope

Generated production source PNGs for connected 1x1 fortification and moat families while preserving existing asset IDs, output names, canvas sizes, anchors, footprints, and exact resize behavior.

## Families

| family | base assetId | connected prefix | canvas | anchor | footprint | count |
|---|---|---|---:|---:|---:|---:|
| fence | `building.fence.wood` | `building.fence.wood.connected` | 64x64 | 32,48 | 1x1 | 17 |
| wall | `building.wall.plaster` | `building.wall.plaster.connected` | 64x72 | 32,56.16 | 1x1 | 17 |
| dry moat | `building.dry_moat` | `building.dry_moat.connected` | 64x32 | 32,16 | 1x1 | 17 |
| water moat | `building.water_moat` | `building.water_moat.connected` | 64x32 | 32,16 | 1x1 | 17 |

Total: 68 runtime source assets.

## Mask Rule

Masks use the requested order:

```text
N,E,S,W
```

The generator treats each active bit as a segment from the tile center toward that edge. `0000` is an isolated short segment. Preview coverage includes straight, corner, T, cross, and long east-west runs.

## Method

- Generated deterministic raster PNGs with `sharp` from fixed family drawing rules.
- Added material-specific shading, contact shadows, small texture noise, and family-consistent thickness.
- Updated `assets/definitions/production-assets.json` source paths for all 68 affected asset IDs.
- Ran `pnpm run assets:import:raster`.
- Ran `pnpm run assets:validate`.

## Validation

- `pnpm run assets:import:raster`: `Imported 92 raster production assets.`
- `pnpm run assets:validate`: `Validated production definitions and 102 generated assets.`
- `validation-summary.json`: 68 entries, 0 size mismatches, 0 non-transparent corner failures.
- `vipsheader` confirmed representative generated outputs:
  - fence: 64x64
  - wall: 64x72
  - dry moat: 64x32
  - water moat: 64x32

## Files

- Base PNGs: `building-fence-wood.png`, `building-wall-plaster.png`, `building-dry-moat.png`, `building-water-moat.png`
- Connected PNGs: all `<family>-connected-0000.png` through `<family>-connected-1111.png`
- Review: `contact-sheet.png`, `connection-preview.png`
- Metadata: `asset-map.json`, `validation-summary.json`

## Visual Notes

- Fence and wall connection masks align by construction and should tolerate long lines better than the previous source set.
- Dry moat and water moat use subdued colors to avoid high-saturation terrain artifacts.
- These are production raster sources for the current 1x1 connected runtime model, not larger multi-cell fortification art.

## Concerns

- Wall and fence use compact 1x1 canvases, so very long diagonal lines will still show per-cell rhythm. This is inherent to the current connected-tile model.
- The preview does not include real gate sprites, but wall and fence heights were kept close to the current compact gate source.

## 2026-06-17 Connected Fence/Wall Rendering Fix

Updated fence and wall connected sprites to use the shared socket geometry contract instead of a center-hub drawing model.

- Socket order: `N,E,S,W`.
- Fence anchor: `32,48` for base and all 16 connected masks.
- Wall anchor: `32,56` for base and all 16 connected masks.
- Straight masks now draw as a single socket-to-socket segment.
- Corner, end, T, and cross masks use the same socket endpoints.
- Cell-wide ellipse shadows and diamond ground boards were removed from fence/wall connected sprites.
- Runtime manifest anchors are regenerated from production definitions during `assets:import:raster`.

Visual review outputs:

- `artifacts/connected-structures/fence-masks.png`
- `artifacts/connected-structures/wall-masks.png`
- `artifacts/connected-structures/fence-runs.png`
- `artifacts/connected-structures/wall-runs.png`
- `artifacts/connected-structures/gate-connections.png`
