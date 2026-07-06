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
  /**
   * Sprite-sheet animations, additive so pre-2.0 clients that only read
   * `assets` keep working unchanged.
   */
  readonly animations?: readonly AnimationManifestEntry[];
}

export type AssetSource =
  | {
      readonly type: "procedural-svg";
      readonly pattern: string;
    }
  | {
      readonly type: "blender";
      readonly model?: string;
      readonly scene?: string;
      readonly collection?: string;
      readonly renderSpec: string;
      readonly supersample?: number;
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
  readonly palette?: {
    readonly colors: number;
    readonly dither: number;
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
  readonly model?: string;
  readonly scene?: string;
  readonly collection?: string;
  readonly camera?: string;
  readonly outputDirectory: string;
  readonly outputName?: string;
  readonly resolution: {
    readonly width: number;
    readonly height: number;
  };
  readonly anchor: AssetAnchor;
  readonly transparentBackground: boolean;
  readonly frame?: number;
  readonly direction?: string;
  readonly animation?: string;
  readonly renderSeed?: number;
  readonly renderSpec: string;
  readonly reportJson?: string;
  readonly supersample?: number;
}

export interface AtlasBuildSpec {
  readonly padding: number;
}

// --- animated sprite-sheet assets (release 2.0, P2) ---------------------------

/** Fixed sheet row order (map compass; N = toward map y-1). */
export type SheetDirection = "s" | "se" | "e" | "ne" | "n" | "nw" | "w" | "sw";

export interface AnimationActionSpec {
  readonly name: string;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
}

export interface AnimationFrameCanvas {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

/**
 * One animated unit: a rigged Blender model rendered as one sprite sheet per
 * action (columns = frames, rows = the 8 directions). Declared in the
 * `animations` array of a production-assets JSON file, which pre-2.0 readers
 * ignore (they only parse `assets`).
 */
export interface AnimationAssetSpec {
  readonly assetId: string;
  readonly kind: AssetKind;
  readonly model: string;
  readonly renderSpec: string;
  readonly supersample?: number;
  readonly directions: number;
  readonly frameCanvas: AnimationFrameCanvas;
  readonly actions: readonly AnimationActionSpec[];
  readonly postprocess?: {
    readonly sharpen?: {
      readonly sigma: number;
    };
  };
}

export interface AnimationManifestEntry {
  readonly assetId: string;
  readonly unitAssetId: string;
  readonly action: string;
  readonly kind: AssetKind;
  readonly file: string;
  readonly sheet: {
    readonly width: number;
    readonly height: number;
  };
  readonly frame: {
    readonly width: number;
    readonly height: number;
  };
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly directions: readonly SheetDirection[];
  readonly layout: {
    readonly columns: "frames";
    readonly rows: "directions";
  };
  /** Normalized within one frame cell, same convention as static assets. */
  readonly anchor: AssetAnchor;
}
