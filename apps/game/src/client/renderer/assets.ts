import { Assets, Container, Sprite, Texture } from "pixi.js";

interface AssetManifest {
  readonly assets: readonly {
    readonly assetId: string;
    readonly file: string;
    readonly anchor: {
      readonly x: number;
      readonly y: number;
    };
  }[];
}

export interface LoadedAsset {
  readonly texture: Texture;
  readonly anchor: {
    readonly x: number;
    readonly y: number;
  };
}

const GENERATED_MANIFEST_URL = "/assets/generated/manifest.json";

export async function loadGeneratedAssets(): Promise<ReadonlyMap<string, LoadedAsset>> {
  const response = await fetch(GENERATED_MANIFEST_URL);
  if (!response.ok) {
    throw new Error(`Failed to load asset manifest: ${response.status}`);
  }

  const manifest = (await response.json()) as AssetManifest;
  const loaded = new Map<string, LoadedAsset>();
  for (const asset of manifest.assets) {
    const texture = await Assets.load<Texture>(`/assets/${asset.file}`);
    loaded.set(asset.assetId, {
      texture,
      anchor: asset.anchor
    });
  }

  return loaded;
}

export function createSprite(
  assetId: string,
  assets: ReadonlyMap<string, LoadedAsset>,
  fallbackAssetId = "overlay.cell.selected"
): Sprite {
  const asset = assets.get(assetId) ?? assets.get(fallbackAssetId);
  const sprite = new Sprite(asset?.texture ?? Texture.EMPTY);
  sprite.anchor.set(asset?.anchor.x ?? 0.5, asset?.anchor.y ?? 0.5);
  return sprite;
}

export function createSpriteFromCandidates(assetIds: readonly string[], assets: ReadonlyMap<string, LoadedAsset>): Sprite {
  for (const assetId of assetIds) {
    const asset = assets.get(assetId);
    if (asset !== undefined) {
      const sprite = new Sprite(asset.texture);
      sprite.anchor.set(asset.anchor.x, asset.anchor.y);
      return sprite;
    }
  }

  const sprite = new Sprite(Texture.EMPTY);
  sprite.anchor.set(0.5, 0.5);
  return sprite;
}

export function firstLoadedAsset(
  assetIds: readonly string[],
  assets: ReadonlyMap<string, LoadedAsset>
): LoadedAsset | null {
  for (const assetId of assetIds) {
    const asset = assets.get(assetId);
    if (asset !== undefined) {
      return asset;
    }
  }
  return null;
}

export function clearLayer(layer: Container): void {
  // removeChildren alone does not release display objects in Pixi v8; the
  // scene is rebuilt every snapshot, so undestroyed Graphics geometry (HP
  // bars, rings, grid) accumulates until the tab runs out of memory.
  // `context: true` matters: a Graphics owns an implicit GraphicsContext
  // that destroy() keeps alive by default, which leaks several MB/s here.
  for (const child of layer.removeChildren()) {
    child.destroy({ children: true, context: true });
  }
}
