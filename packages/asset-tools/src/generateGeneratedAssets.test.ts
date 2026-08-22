import { describe, expect, it } from "vitest";
import { buildMergedGeneratedManifest } from "./generateGeneratedAssets";
import type { AnimationManifestEntry, GeneratedAsset } from "./types";

function asset(assetId: string, width = 64): GeneratedAsset {
  return {
    assetId,
    kind: "building",
    file: `generated/${assetId.replaceAll(".", "-")}.png`,
    width,
    height: 32,
    anchor: { x: 0.5, y: 0.5 }
  };
}

describe("buildMergedGeneratedManifest", () => {
  it("preserves foreign manifest entries owned by other pipelines", () => {
    const merged = buildMergedGeneratedManifest(
      [asset("building.fence.wood.connected.0000")],
      { assets: [asset("building.honmaru.tile.connected.1111"), asset("building.tenshu.large.normal")] }
    );

    const ids = merged.assets.map((entry) => entry.assetId);
    expect(ids).toContain("building.fence.wood.connected.0000");
    expect(ids).toContain("building.honmaru.tile.connected.1111");
    expect(ids).toContain("building.tenshu.large.normal");
  });

  it("lets freshly generated assets replace stale entries with the same id", () => {
    const merged = buildMergedGeneratedManifest([asset("building.fence.wood.connected.0000", 64)], {
      assets: [asset("building.fence.wood.connected.0000", 128)]
    });

    expect(merged.assets).toHaveLength(1);
    expect(merged.assets[0]?.width).toBe(64);
  });

  it("carries the animations section through untouched", () => {
    const animations = [
      { assetId: "anim.unit.ashigaru.walk" } as unknown as AnimationManifestEntry
    ] as const;
    const merged = buildMergedGeneratedManifest([], { assets: [], animations });

    expect(merged.animations).toBe(animations);
    expect(buildMergedGeneratedManifest([], { assets: [] })).not.toHaveProperty("animations");
  });
});
