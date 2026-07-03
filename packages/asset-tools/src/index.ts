#!/usr/bin/env node
import { rm } from "node:fs/promises";
import process from "node:process";
import { generateGeneratedAssets } from "./generateGeneratedAssets";
import { generatePlaceholders } from "./generatePlaceholders";
import { readManifest, validateManifest } from "./manifest";
import { auditProductionArt } from "./productionArtAudit";
import {
  buildAtlas,
  importRasterAssets,
  postprocessProductionAssets,
  renderBlenderAssets,
  runBlenderCalibration,
  validateProductionAssetDefinitions
} from "./productionPipeline";
import { generatedManifestPath, generatedOutputDir, placeholderManifestPath, placeholderOutputDir, publicAssetsDir } from "./paths";

const command = process.argv[2];

try {
  if (command === "generate-placeholders" || command === "assets:generate:placeholder") {
    const manifest = await generatePlaceholders();
    console.log(`Generated ${manifest.assets.length} placeholder assets.`);
  } else if (command === "generate-main2img") {
    const manifest = await generateGeneratedAssets();
    console.log(`Generated ${manifest.assets.length} requested assets.`);
  } else if (command === "assets:render:blender") {
    const count = await renderBlenderAssets();
    if (count === 0) {
      console.log("No Blender production assets configured.");
    } else {
      console.log(`Rendered ${count} Blender production assets.`);
    }
  } else if (command === "assets:blender:calibration") {
    await runBlenderCalibration();
    console.log("Blender calibration passed; wrote artifacts/blender-calibration/report.md.");
  } else if (command === "assets:import:raster") {
    const count = await importRasterAssets();
    console.log(`Imported ${count} raster production assets.`);
  } else if (command === "assets:postprocess") {
    const count = await postprocessProductionAssets();
    console.log(`Postprocessed ${count} production assets.`);
  } else if (command === "assets:atlas") {
    await buildAtlas();
    console.log("Wrote atlas plan.");
  } else if (command === "assets:validate") {
    await validateProductionAssetDefinitions();
    const manifest = await readManifest(generatedManifestPath);
    await validateManifest(manifest, publicAssetsDir);
    console.log(`Validated production definitions and ${manifest.assets.length} generated assets.`);
  } else if (command === "assets:audit:production") {
    const findings = await auditProductionArt();
    if (findings.length === 0) {
      console.log("Production art audit passed; no candidate/mock runtime assets remain.");
    } else {
      for (const finding of findings) {
        console.error(`${finding.assetId}: ${finding.reason} (${finding.source})`);
      }
      throw new Error(`Production art audit failed; ${findings.length} candidate/mock runtime assets remain.`);
    }
  } else if (command === "assets:all") {
    await generatePlaceholders();
    await generateGeneratedAssets();
    await postprocessProductionAssets();
    await buildAtlas();
    await validateProductionAssetDefinitions();
    const manifest = await readManifest(generatedManifestPath);
    await validateManifest(manifest, publicAssetsDir);
    console.log(`Completed asset pipeline; validated ${manifest.assets.length} generated assets.`);
  } else if (command === "validate-manifest") {
    const manifestPath = process.argv[3] === "generated" ? generatedManifestPath : placeholderManifestPath;
    const manifest = await readManifest(manifestPath);
    await validateManifest(manifest, publicAssetsDir);
    console.log(`Validated ${manifest.assets.length} assets.`);
  } else if (command === "clean") {
    await rm(placeholderOutputDir, { recursive: true, force: true });
    await rm(generatedOutputDir, { recursive: true, force: true });
    console.log("Removed generated assets.");
  } else {
    console.error(
      "Usage: pnpm --filter @asama/asset-tools <generate:placeholders|generate:main2img|assets:generate:placeholder|assets:render:blender|assets:blender:calibration|assets:import:raster|assets:postprocess|assets:atlas|assets:validate|assets:audit:production|assets:all|validate:manifest|clean>"
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
