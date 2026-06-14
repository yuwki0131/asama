import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(thisDir, "../../..");
export const placeholderConfigPath = join(repoRoot, "assets/source/placeholder-assets.json");
export const generatedConfigPath = join(repoRoot, "assets/source/phase1-2-assets.json");
export const publicAssetsDir = join(repoRoot, "public/assets");
export const placeholderOutputDir = join(publicAssetsDir, "placeholders");
export const placeholderManifestPath = join(placeholderOutputDir, "manifest.json");
export const generatedOutputDir = join(publicAssetsDir, "generated");
export const generatedManifestPath = join(generatedOutputDir, "manifest.json");
