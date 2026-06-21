# Generation Report

## Scope

Generated 76 production raster sources on 2026-06-18:

- Fence, plaster wall, dry moat, and water moat: base plus 16 masks each.
- Farm: one 4x4 asset.
- Terrain: five 1x1 surface assets.
- Bridges: earth and wood.

## Method

Visible materials and silhouettes were generated as raster art with the built-in
image generation workflow. Flat chroma-key backgrounds were removed locally.
Sharp was used only to clean alpha, fit canvases, crop or mirror raster modules,
compose connected masks, create review sheets, and collect validation data.

## Prompt Set

The built-in image generation prompts requested an orthographic/isometric
Sengoku RTS asset on a flat removable chroma background for each source:

- Sharpened-log palisade with rope binding and supporting rails.
- White-plaster castle wall with timber base and continuous cap.
- Excavated dry trench and bank module.
- Artificial water moat with bank, water depth, and restrained reflections.
- Broad cultivated field/paddy footprint.
- Dirt, water, stone, grass-variant, and dirt-variant isometric surfaces.
- Low packed-earth crossing and low timber-plank bridge.

Prompts excluded text, watermarks, modern materials, western fence forms,
decorative hubs, saturated outlines, and baked rectangular backgrounds.

## Geometry

- All 76 files match their declared canvas dimensions.
- Anchors and footprints are unchanged from `production-assets.json`.
- All four canvas corners remain transparent.
- Connected masks use `N,E,S,W` bit order and the documented isometric sockets.
- Opposing sockets use the same raster module endpoints and align within 1 px.

## Review Outputs

- `fortification-contact-sheet.png`
- `fortification-runs.png`
- `moat-runs.png`
- `surface-contact-sheet.png`
- `runtime-composite-preview.png`

## Remaining Concerns

At native resolution, some T/cross fortification joints show denser material where
raster branches overlap. They are structurally readable and socket-correct, but
may merit a later family-specific joint-art pass if the final camera zoom exposes
the overlap.
