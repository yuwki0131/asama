# Production Art Pipeline Migration Ready

The production art pipeline migration foundation has been implemented without changing runtime asset IDs or manifest format.

## Changed Files

- `packages/asset-tools/src/types.ts`
- `packages/asset-tools/src/productionConfig.ts`
- `packages/asset-tools/src/postprocess.ts`
- `packages/asset-tools/src/blenderAdapter.ts`
- `packages/asset-tools/src/productionPipeline.ts`
- `packages/asset-tools/src/index.ts`
- `packages/asset-tools/src/manifest.ts`
- `packages/asset-tools/src/templates.ts`
- `packages/asset-tools/src/productionPipeline.test.ts`
- `package.json`
- `packages/asset-tools/package.json`
- `assets/definitions/production-assets.json`
- `assets/definitions/README.md`
- `assets/source/{procedural-svg,blender,raster,references}/`
- `assets/intermediate/{raw-renders,trimmed,processed}/`
- `assets/generated/{sprites,atlases}/`
- `docs/05_map-and-art/asset-pipeline.md`
- `docs/10_development/unresolved-issues.md`

## Added Types

- `AssetSource`
- `AssetGeometry`
- `ProductionAssetSpec`
- `ProductionAssetConfig`
- `RasterImportSpec`
- `BlenderRenderSpec`
- `AtlasBuildSpec`

## Added Commands

- `pnpm run assets:generate:placeholder`
- `pnpm run assets:render:blender`
- `pnpm run assets:import:raster`
- `pnpm run assets:postprocess`
- `pnpm run assets:atlas`
- `pnpm run assets:validate`
- `pnpm run assets:all`

Existing commands remain available: `generate:assets`, `generate:main2img`, `validate:assets`, and `validate:generated-assets`.

## Manifest Compatibility

Runtime manifest format is unchanged. The game still consumes PNG files and `public/assets/generated/manifest.json`; source type is not exposed to runtime.

The current generated manifest contains 102 assets. No existing `assetId`, canvas size, or anchor was intentionally changed by this migration.

## Validation

Commands run successfully:

```text
pnpm --filter @asama/asset-tools typecheck
pnpm --filter @asama/asset-tools test
pnpm run typecheck
pnpm test
pnpm run assets:generate:placeholder
pnpm run assets:render:blender
pnpm run assets:import:raster
pnpm run assets:postprocess
pnpm run assets:atlas
pnpm run assets:validate
pnpm run assets:all
pnpm run validate:generated-assets
```

`assets:render:blender` completed as a definition/plan pass because no Blender production assets are configured yet.

## Raster Import Usage

Add a production asset to `assets/definitions/production-assets.json` with:

```json
{
  "assetId": "building.example",
  "kind": "building",
  "output": "building-example.png",
  "source": {
    "type": "raster",
    "file": "assets/source/raster/hand-authored/building-example.png"
  },
  "geometry": {
    "footprintWidth": 1,
    "footprintHeight": 1,
    "canvasWidth": 96,
    "canvasHeight": 80,
    "anchorX": 48,
    "anchorY": 66
  },
  "category": "building"
}
```

Then run:

```text
pnpm run assets:import:raster
pnpm run assets:validate
```

## Production Replacement Status

Production art replaced asset IDs: none.

Placeholder/debug asset IDs remaining: all current generated asset IDs. The TypeScript/SVG path is now explicitly documented as placeholder/debug only.

## Blender Status

Blender rendering is not executed by default and no `.blend` production sources are configured yet. The adapter validates definitions and builds headless command arguments for later execution.

## Unresolved Items

Recorded in `docs/10_development/unresolved-issues.md`:

- Blender version
- render spec and camera naming
- raster category trim/sharpen defaults
- atlas padding and bleed values

## Screenshot

No new in-game screenshot was generated for this pipeline-only migration.
