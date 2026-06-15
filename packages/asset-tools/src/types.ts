export interface AssetAnchor {
  readonly x: number;
  readonly y: number;
}

export type AssetKind = "terrain" | "unit" | "building" | "overlay";

export interface PlaceholderAssetSpec {
  readonly assetId: string;
  readonly kind: AssetKind;
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly fill: string;
  readonly stroke: string;
  readonly accent?: string;
  readonly pattern?:
    | "base"
    | "rough"
    | "water"
    | "stone"
    | "fence"
    | "wall"
    | "gate"
    | "wide-gate"
    | "market"
    | "barracks"
    | "samurai-residence"
    | "town-block"
    | "farm"
    | "road"
    | "earth-bridge"
    | "wood-bridge"
    | "tenshu"
    | "connected-fence"
    | "connected-wall"
    | "connected-dry-moat"
    | "connected-water-moat"
    | "dry-moat"
    | "water-moat"
    | "storehouse"
    | "honmaru"
    | "hover"
    | "selected"
    | "destination"
    | "path"
    | "blocked"
    | "ring"
    | "build-valid"
    | "build-invalid"
    | "demolish";
  readonly direction?: "north" | "south" | "east" | "west";
  readonly connectionMask?: string;
  readonly anchor: AssetAnchor;
}

export interface PlaceholderAssetConfig {
  readonly version: number;
  readonly assets: readonly PlaceholderAssetSpec[];
}

export interface GeneratedAsset {
  readonly assetId: string;
  readonly kind: AssetKind;
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

export type AssetSource =
  | {
      readonly type: "procedural-svg";
      readonly pattern: string;
    }
  | {
      readonly type: "blender";
      readonly scene: string;
      readonly collection?: string;
      readonly renderSpec: string;
    }
  | {
      readonly type: "raster";
      readonly file: string;
    };

export interface AssetGeometry {
  readonly footprintWidth: number;
  readonly footprintHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

export interface ProductionAssetSpec {
  readonly assetId: string;
  readonly kind: AssetKind;
  readonly output: string;
  readonly source: AssetSource;
  readonly geometry: AssetGeometry;
  readonly category?: RasterPostprocessCategory;
  readonly postprocess?: ProductionPostprocessSpec;
  readonly variants?: readonly string[];
}

export interface ProductionAssetConfig {
  readonly version: number;
  readonly assets: readonly ProductionAssetSpec[];
}

export type RasterPostprocessCategory = "terrain" | "building" | "unit" | "vegetation" | "effect";

export interface RasterImportSpec {
  readonly sourceFile: string;
  readonly outputFile: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly trim: boolean;
  readonly resizeMode: "contain" | "cover" | "exact";
  readonly category: RasterPostprocessCategory;
  readonly sharpen?: {
    readonly sigma: number;
  };
}

export interface ProductionPostprocessSpec {
  readonly trim?: boolean;
  readonly resizeMode?: RasterImportSpec["resizeMode"];
  readonly sharpen?: {
    readonly sigma: number;
  };
}

export interface BlenderRenderSpec {
  readonly scene: string;
  readonly collection?: string;
  readonly camera?: string;
  readonly outputDirectory: string;
  readonly resolution: {
    readonly width: number;
    readonly height: number;
  };
  readonly transparentBackground: boolean;
  readonly frame?: number;
  readonly direction?: string;
  readonly animation?: string;
  readonly renderSeed?: number;
  readonly renderSpec: string;
}

export interface AtlasBuildSpec {
  readonly padding: number;
}
