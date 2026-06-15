# Production Asset Definitions

Production art definitions live here. Keep runtime `assetId`s stable and separate logical footprint from PNG canvas geometry.

Use `production-assets.json` for Blender or approved raster sources. The current TypeScript/SVG generator remains a placeholder and debug pipeline.

Asset sources:

- `procedural-svg`: placeholder/debug only.
- `blender`: headless Blender render input.
- `raster`: approved PNG input from hand-authored, edited, AI-assisted, or external tools.

Final runtime output remains `public/assets/generated/` and `public/assets/generated/manifest.json`.
