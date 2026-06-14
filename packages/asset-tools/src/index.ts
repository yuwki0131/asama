#!/usr/bin/env node
import { rm } from "node:fs/promises";
import process from "node:process";
import { generatePlaceholders } from "./generatePlaceholders";
import { readManifest, validateManifest } from "./manifest";
import { placeholderManifestPath, placeholderOutputDir, publicAssetsDir } from "./paths";

const command = process.argv[2];

try {
  if (command === "generate-placeholders") {
    const manifest = await generatePlaceholders();
    console.log(`Generated ${manifest.assets.length} placeholder assets.`);
  } else if (command === "validate-manifest") {
    const manifest = await readManifest(placeholderManifestPath);
    await validateManifest(manifest, publicAssetsDir);
    console.log(`Validated ${manifest.assets.length} assets.`);
  } else if (command === "clean") {
    await rm(placeholderOutputDir, { recursive: true, force: true });
    console.log("Removed generated placeholder assets.");
  } else {
    console.error("Usage: pnpm --filter @asama/asset-tools <generate:placeholders|validate:manifest|clean>");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
