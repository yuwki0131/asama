import { access } from "node:fs/promises";
import { join } from "node:path";
import type { BlenderRenderSpec, ProductionAssetSpec } from "./types";

export function toBlenderRenderSpec(asset: ProductionAssetSpec, outputDirectory: string): BlenderRenderSpec {
  if (asset.source.type !== "blender") {
    throw new Error(`Asset is not a Blender source: ${asset.assetId}`);
  }

  return {
    scene: asset.source.scene,
    ...(asset.source.collection === undefined ? {} : { collection: asset.source.collection }),
    outputDirectory,
    resolution: {
      width: asset.geometry.canvasWidth,
      height: asset.geometry.canvasHeight
    },
    transparentBackground: true,
    renderSpec: asset.source.renderSpec
  };
}

export function buildBlenderCommand(spec: BlenderRenderSpec, pythonScript: string): readonly string[] {
  const args = [
    "blender",
    "--background",
    spec.scene,
    "--python",
    pythonScript,
    "--",
    "--render-spec",
    spec.renderSpec,
    "--output-directory",
    spec.outputDirectory,
    "--resolution",
    `${spec.resolution.width}x${spec.resolution.height}`,
    "--transparent-background",
    String(spec.transparentBackground)
  ];

  appendOptional(args, "--collection", spec.collection);
  appendOptional(args, "--camera", spec.camera);
  appendOptional(args, "--frame", spec.frame);
  appendOptional(args, "--direction", spec.direction);
  appendOptional(args, "--animation", spec.animation);
  appendOptional(args, "--render-seed", spec.renderSeed);

  return args;
}

export async function validateBlenderAssetInputs(assets: readonly ProductionAssetSpec[]): Promise<void> {
  for (const asset of assets) {
    if (asset.source.type !== "blender") {
      continue;
    }
    await access(asset.source.scene);
  }
}

export function blenderPlanLines(
  assets: readonly ProductionAssetSpec[],
  outputDirectory: string,
  pythonScript = "assets/source/blender/scripts/render_asset.py"
): readonly string[] {
  return assets
    .filter((asset) => asset.source.type === "blender")
    .map((asset) => buildBlenderCommand(toBlenderRenderSpec(asset, outputDirectory), pythonScript).join(" "));
}

export function defaultBlenderRenderScript(repoRoot: string): string {
  return join(repoRoot, "assets/source/blender/scripts/render_asset.py");
}

function appendOptional(args: unknown[], flag: string, value: string | number | undefined): void {
  if (value !== undefined) {
    args.push(flag, String(value));
  }
}
