export interface AssetAnchor {
  readonly x: number;
  readonly y: number;
}

export interface PlaceholderAssetSpec {
  readonly assetId: string;
  readonly kind: "terrain" | "unit" | "building" | "overlay";
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly fill: string;
  readonly stroke: string;
  readonly accent?: string;
  readonly anchor: AssetAnchor;
}

export interface PlaceholderAssetConfig {
  readonly version: number;
  readonly assets: readonly PlaceholderAssetSpec[];
}

export interface GeneratedAsset {
  readonly assetId: string;
  readonly kind: PlaceholderAssetSpec["kind"];
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly anchor: AssetAnchor;
}

export interface AssetManifest {
  readonly version: number;
  readonly generatedBy: string;
  readonly generatedAt: string;
  readonly assets: readonly GeneratedAsset[];
}
