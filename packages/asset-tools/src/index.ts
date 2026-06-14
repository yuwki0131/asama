#!/usr/bin/env node
import { rm } from "node:fs/promises";
import process from "node:process";
import { generateGeneratedAssets } from "./generateGeneratedAssets";
import { generatePlaceholders } from "./generatePlaceholders";
import { readManifest, validateManifest } from "./manifest";
import { generatedManifestPath, generatedOutputDir, placeholderManifestPath, placeholderOutputDir, publicAssetsDir } from "./paths";

const command = process.argv[2];

try {
  if (command === "generate-placeholders") {
    const manifest = await generatePlaceholders();
    console.log(`Generated ${manifest.assets.length} placeholder assets.`);
  } else if (command === "generate-main2img") {
    const manifest = await generateGeneratedAssets();
    console.log(`Generated ${manifest.assets.length} requested assets.`);
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
    console.error("Usage: pnpm --filter @asama/asset-tools <generate:placeholders|generate:main2img|validate:manifest|clean>");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
