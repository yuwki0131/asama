// Three.js texture loader that reuses the existing generated asset manifest.
//
// The trial 3D renderer must not fork the asset pipeline — it consumes the
// same PNGs shipped in /assets/generated/ as the 2D layer. Only the runtime
// texture object type changes (Three.Texture vs Pixi.Texture).

import { NearestFilter, Texture, TextureLoader, SRGBColorSpace } from "three";

interface ManifestEntry {
  readonly assetId: string;
  readonly file: string;
  readonly anchor: { readonly x: number; readonly y: number };
}

interface AssetManifest {
  readonly assets: readonly ManifestEntry[];
}

const MANIFEST_URL = "/assets/generated/manifest.json";

export interface ThreeAsset {
  readonly texture: Texture;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
}

export type ThreeAssetMap = ReadonlyMap<string, ThreeAsset>;

export async function loadThreeAssets(subset?: readonly string[]): Promise<ThreeAssetMap> {
  const response = await fetch(MANIFEST_URL);
  if (!response.ok) {
    throw new Error(`Failed to load manifest.json: ${response.status}`);
  }
  const manifest = (await response.json()) as AssetManifest;
  const entries = subset === undefined
    ? manifest.assets
    : manifest.assets.filter((asset) => subset.includes(asset.assetId));

  const loader = new TextureLoader();
  const map = new Map<string, ThreeAsset>();
  await Promise.all(
    entries.map(
      (entry) =>
        new Promise<void>((resolve, reject) => {
          loader.load(
            `/assets/${entry.file}`,
            (texture) => {
              // Sprite art was authored for straight-alpha PixiJS. NearestFilter
              // preserves the crisp pixel edges the illustrations rely on.
              texture.magFilter = NearestFilter;
              texture.minFilter = NearestFilter;
              texture.colorSpace = SRGBColorSpace;
              texture.generateMipmaps = false;
              map.set(entry.assetId, {
                texture,
                anchor: entry.anchor,
                width: texture.image?.width ?? 0,
                height: texture.image?.height ?? 0
              });
              resolve();
            },
            undefined,
            (err) => reject(err instanceof Error ? err : new Error(String(err)))
          );
        })
    )
  );
  return map;
}
