import type { AssetAnchor, AssetKind } from "../types";

/**
 * L1 machine checks for the visual QA gate. Each checker implements one rule
 * from docs/05_map-and-art/art-rulebook.md and reports violations with the
 * rule ID, the measured value and the threshold so failures are actionable
 * without opening the image.
 */

export interface RawImage {
  readonly data: Buffer | Uint8Array;
  readonly width: number;
  readonly height: number;
}

export type ArtLintRuleId = "GEO-01" | "GEO-02" | "GEO-03" | "NOISE-01" | "NOISE-02" | "NOISE-03";

export interface ArtLintViolation {
  readonly assetId: string;
  readonly ruleId: ArtLintRuleId;
  readonly measured: string;
  readonly threshold: string;
  readonly message: string;
}

export interface ManifestAssetMeta {
  readonly assetId: string;
  readonly kind: AssetKind;
  readonly width: number;
  readonly height: number;
  readonly anchor: AssetAnchor;
}

const OPAQUE_ALPHA = 128;

/** terrain.{cliff,ishigaki}.{face,corner}.<dir>.h<n> */
const TERRAIN_ELEVATION_RE = /^terrain\.(cliff|ishigaki)\.(face|corner)\.([a-z]+)\.h(\d+)$/;
/** Faces whose top edge must pin to the cell edge (GEO-03). */
const TERRAIN_FACE_RE = /^terrain\.(cliff|ishigaki)\.face\.(e|s)\.h(\d+)$/;

export function isTerrainElevationAsset(assetId: string): boolean {
  return TERRAIN_ELEVATION_RE.test(assetId);
}

export function terrainFaceSide(assetId: string): "e" | "s" | null {
  const match = TERRAIN_FACE_RE.exec(assetId);
  return match === null ? null : (match[2] as "e" | "s");
}

/**
 * GEO-01: building anchor geometry, split by family. The renderer consumes
 * anchors in family-specific ways (apps/game/src/client/renderer/
 * renderGeometry.ts buildingRenderPoint + sceneLayer.ts addBridgeSprites +
 * gameRules.ts isCenterAnchoredBuilding), so a single H-32 rule over-applies;
 * each family gets the contract its render path actually requires:
 *
 * - standard lots: anchor pinned to the footprint SOUTH corner
 *   (footprintSouthWorld) with a 32px base apron → anchorRow = height-32;
 *   the canvas centers on the footprint diamond, whose center sits
 *   (fw-fh)*16px left of the south corner → anchorX = width/2 + (fw-fh)*16.
 * - ground tile kits (road/fence/wall/honmaru marker + deco.*): anchor pinned
 *   to the cell diamond center (cellToWorld) and the diamond bottom vertex
 *   sits on the canvas bottom edge → anchorRow = height-16.
 * - recessed moat kits: anchor at the ground-surface diamond center 16px from
 *   the canvas TOP; extra rows extend downward into the sunken pit →
 *   anchorRow = 16.
 * - gates: anchor at the footprint bbox center (cellToWorld); art keeps an
 *   8px pad below the n-cell block diamond (half-height (n+1)*8) →
 *   anchorRow = height - 8 - (n+1)*8, n from the width{n}/narrow{n} token.
 * - bridges: one sprite per cell, deck diamond center pinned on the cell
 *   center; deck height above the canvas bottom is a per-material art
 *   constant — earth 24px (low causeway), wood 32px (raised plank deck).
 * - flat lots (farm): the canvas IS the footprint diamond → anchor at the
 *   canvas center and width = 2*height.
 */

interface Geo01Contract {
  readonly family: string;
  readonly expectedAnchorXPx: number;
  readonly expectedAnchorRowPx: number;
}

function isInAssetFamily(assetId: string, base: string): boolean {
  return assetId === base || assetId.startsWith(`${base}.`);
}

/**
 * Standard-lot footprints (w×h cells), mirrored from
 * packages/content/src/index.ts buildingSpecs — asset-tools intentionally has
 * no dependency on @asama/content, so keep this table in sync. Unlisted
 * standard lots are assumed square (no half-tile X offset).
 */
const STANDARD_LOT_FOOTPRINTS: readonly (readonly [string, number, number])[] = [
  ["building.storehouse", 3, 3],
  ["building.market", 4, 3],
  ["building.barracks", 4, 3],
  ["building.samurai_residence", 4, 4],
  ["building.town_block", 6, 6],
  ["building.tenshu", 4, 4],
  ["building.yagura", 2, 2]
];

function geo01Contract(asset: ManifestAssetMeta): Geo01Contract | null {
  const { assetId, width, height } = asset;
  const centerX = width / 2;

  if (
    assetId.startsWith("deco.") ||
    isInAssetFamily(assetId, "building.road") ||
    isInAssetFamily(assetId, "building.fence") ||
    isInAssetFamily(assetId, "building.wall") ||
    isInAssetFamily(assetId, "building.honmaru")
  ) {
    return { family: "ground-tile", expectedAnchorXPx: centerX, expectedAnchorRowPx: height - 16 };
  }

  if (isInAssetFamily(assetId, "building.dry_moat") || isInAssetFamily(assetId, "building.water_moat")) {
    return { family: "moat", expectedAnchorXPx: centerX, expectedAnchorRowPx: 16 };
  }

  if (isInAssetFamily(assetId, "building.earth_bridge")) {
    return { family: "bridge(earth)", expectedAnchorXPx: centerX, expectedAnchorRowPx: height - 24 };
  }
  if (isInAssetFamily(assetId, "building.wood_bridge")) {
    return { family: "bridge(wood)", expectedAnchorXPx: centerX, expectedAnchorRowPx: height - 32 };
  }

  if (isInAssetFamily(assetId, "building.gate")) {
    const span = /(?:width|narrow)(\d+)/.exec(assetId);
    if (span === null) {
      // Cell span is not recoverable from the id, so the anchor-row formula
      // cannot be evaluated — explicitly out of machine-check scope.
      return null;
    }
    const n = Number(span[1]);
    return { family: `gate(${n}-cell)`, expectedAnchorXPx: centerX, expectedAnchorRowPx: height - 8 - (n + 1) * 8 };
  }

  if (isInAssetFamily(assetId, "building.farm")) {
    return { family: "flat-lot", expectedAnchorXPx: centerX, expectedAnchorRowPx: height / 2 };
  }

  let southCornerOffsetX = 0;
  for (const [base, fw, fh] of STANDARD_LOT_FOOTPRINTS) {
    if (isInAssetFamily(assetId, base)) {
      southCornerOffsetX = (fw - fh) * 16;
      break;
    }
  }
  return {
    family: "standard-lot(H-32)",
    expectedAnchorXPx: centerX + southCornerOffsetX,
    expectedAnchorRowPx: height - 32
  };
}

export function checkBuildingGeometry(asset: ManifestAssetMeta, tolerancePx = 1): ArtLintViolation | null {
  if (asset.kind !== "building") {
    return null;
  }
  const contract = geo01Contract(asset);
  if (contract === null) {
    return null;
  }
  const anchorXPx = asset.anchor.x * asset.width;
  const anchorRowPx = asset.anchor.y * asset.height;
  // Flat lots must also keep the iso diamond aspect (canvas == footprint diamond).
  const flatLotAspectBroken = contract.family === "flat-lot" && asset.width !== asset.height * 2;
  if (
    !flatLotAspectBroken &&
    Math.abs(anchorXPx - contract.expectedAnchorXPx) <= tolerancePx &&
    Math.abs(anchorRowPx - contract.expectedAnchorRowPx) <= tolerancePx
  ) {
    return null;
  }
  return {
    assetId: asset.assetId,
    ruleId: "GEO-01",
    measured: `${asset.width}x${asset.height} anchor=(${asset.anchor.x.toFixed(4)},${asset.anchor.y.toFixed(4)}) → anchorPx=(${anchorXPx.toFixed(1)},${anchorRowPx.toFixed(1)})`,
    threshold:
      `${contract.family}: anchorPx=(${contract.expectedAnchorXPx.toFixed(1)},${contract.expectedAnchorRowPx.toFixed(1)})±${tolerancePx}px` +
      (contract.family === "flat-lot" ? ", width=2*height" : ""),
    message: `族別アンカー幾何契約違反 (${contract.family}): レンダラーのピン位置とアンカー行が一致していない`
  };
}

/**
 * GEO-02: terrain elevation faces/corners use canvas 64×(32+40h) with anchor
 * (0.5, 16/(32+40h)).
 */
export function checkTerrainFaceGeometry(asset: ManifestAssetMeta): ArtLintViolation | null {
  const match = TERRAIN_ELEVATION_RE.exec(asset.assetId);
  if (match === null) {
    return null;
  }
  const h = Number(match[4]);
  const expectedWidth = 64;
  const expectedHeight = 32 + 40 * h;
  const expectedAnchorY = 16 / expectedHeight;
  const ok =
    asset.width === expectedWidth &&
    asset.height === expectedHeight &&
    Math.abs(asset.anchor.x - 0.5) < 1e-6 &&
    Math.abs(asset.anchor.y - expectedAnchorY) < 1e-6;
  if (ok) {
    return null;
  }
  return {
    assetId: asset.assetId,
    ruleId: "GEO-02",
    measured: `${asset.width}x${asset.height} anchor=(${asset.anchor.x},${asset.anchor.y.toFixed(6)})`,
    threshold: `${expectedWidth}x${expectedHeight} anchor=(0.5,${expectedAnchorY.toFixed(6)})`,
    message: `地形面キャンバス契約違反 (h=${h})`
  };
}

/**
 * GEO-03: on face assets the wall top edge must sit on the cell edge. In the
 * top band (y=16..24) the opaque x range must stay within `margin` px of the
 * x=32 seam: e faces keep x >= 32-margin, s faces keep x <= 32+margin.
 *
 * Margin: cliffs are straight so 2 px suffices; ishigaki lean outward (sori)
 * and per ISHIGAKI-01 the sori projection is capped at 0.40 world units
 * ≈ 13 px, so a healthy ishigaki top band reaches ~10-11 px past the seam
 * (measured 42/21 after PR #78) while the 2026-07-19 drift bug reached the
 * far canvas edge (63/0) and still fails.
 */
export function checkFaceDrift(
  assetId: string,
  image: RawImage,
  options?: { readonly bandTop?: number; readonly bandBottom?: number; readonly margin?: number }
): ArtLintViolation | null {
  const side = terrainFaceSide(assetId);
  if (side === null) {
    return null;
  }
  const bandTop = options?.bandTop ?? 16;
  const bandBottom = options?.bandBottom ?? 24;
  const margin = options?.margin ?? (assetId.includes(".ishigaki.") ? 13 : 2);
  const minAllowedX = 32 - margin;
  const maxAllowedX = 32 + margin;
  const { data, width, height } = image;
  let worstX = -1;
  let worstY = -1;
  for (let y = bandTop; y <= Math.min(bandBottom, height - 1); y += 1) {
    let minX = -1;
    let maxX = -1;
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) >= OPAQUE_ALPHA) {
        if (minX === -1) {
          minX = x;
        }
        maxX = x;
      }
    }
    if (minX === -1) {
      continue;
    }
    if (side === "e" && minX < minAllowedX && (worstX === -1 || minX < worstX)) {
      worstX = minX;
      worstY = y;
    }
    if (side === "s" && maxX > maxAllowedX && (worstX === -1 || maxX > worstX)) {
      worstX = maxX;
      worstY = y;
    }
  }
  if (worstX === -1) {
    return null;
  }
  return {
    assetId,
    ruleId: "GEO-03",
    measured: `y=${worstY} opaque ${side === "e" ? "min" : "max"}X=${worstX}`,
    threshold:
      side === "e"
        ? `top band (y${bandTop}..${bandBottom}) opaque x>=${minAllowedX}`
        : `top band (y${bandTop}..${bandBottom}) opaque x<=${maxAllowedX}`,
    message: `${side}面の壁上端がセル辺からドリフト (マージン${margin}px超過)`
  };
}

export interface ComponentScan {
  /** Component sizes, indexed by component id. */
  readonly sizes: number[];
  /** Component id per pixel, -1 where the mask is false. */
  readonly labels: Int32Array;
  /** True for components touching the image border. */
  readonly touchesBorder: boolean[];
}

/** 4-connected component labeling over an arbitrary pixel mask. */
export function labelComponents(width: number, height: number, mask: (index: number) => boolean): ComponentScan {
  const labels = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const touchesBorder: boolean[] = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start += 1) {
    if (labels[start] !== -1 || !mask(start)) {
      continue;
    }
    const id = sizes.length;
    sizes.push(0);
    touchesBorder.push(false);
    stack.push(start);
    labels[start] = id;
    while (stack.length > 0) {
      const p = stack.pop() as number;
      sizes[id] = (sizes[id] ?? 0) + 1;
      const x = p % width;
      const y = (p - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesBorder[id] = true;
      }
      const neighbors = [p - 1, p + 1, p - width, p + width];
      const valid = [x > 0, x < width - 1, y > 0, y < height - 1];
      for (let n = 0; n < 4; n += 1) {
        const q = neighbors[n] as number;
        if ((valid[n] ?? false) && labels[q] === -1 && mask(q)) {
          labels[q] = id;
          stack.push(q);
        }
      }
    }
  }
  return { sizes, labels, touchesBorder };
}

/**
 * NOISE-01: no isolated opaque speckles — every 4-connected opaque component
 * must cover at least `minArea` pixels (default 4). Applies to animation
 * sheets too.
 */
export function checkSpeckles(assetId: string, image: RawImage, minArea = 4): ArtLintViolation | null {
  const { data, width, height } = image;
  const scan = labelComponents(width, height, (p) => (data[p * 4 + 3] ?? 0) >= OPAQUE_ALPHA);
  const speckles = scan.sizes.filter((size) => size < minArea);
  if (speckles.length === 0) {
    return null;
  }
  return {
    assetId,
    ruleId: "NOISE-01",
    measured: `${speckles.length} speckle component(s), smallest=${Math.min(...speckles)}px`,
    threshold: `connected opaque components >= ${minArea}px`,
    message: "孤立スペックル(<4px の不透過連結成分)禁止"
  };
}

/**
 * NOISE-02: no black matte fringe — within the 1–2 px contour band of the
 * opaque silhouette, the share of near-black pixels (luma < lumaThreshold)
 * must stay under maxRatio. Building sprites only (call-site filtered).
 */
export function checkMatteFringe(
  assetId: string,
  image: RawImage,
  options?: { readonly lumaThreshold?: number; readonly maxRatio?: number }
): ArtLintViolation | null {
  const lumaThreshold = options?.lumaThreshold ?? 24;
  const maxRatio = options?.maxRatio ?? 0.08;
  const { data, width, height } = image;
  const opaque = (x: number, y: number): boolean =>
    x >= 0 && x < width && y >= 0 && y < height && (data[(y * width + x) * 4 + 3] ?? 0) >= OPAQUE_ALPHA;

  // Contour band: opaque pixels within Chebyshev distance 2 of a
  // transparent pixel (covers the 1–2 px fringe left by bad matting).
  let bandCount = 0;
  let darkCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!opaque(x, y)) {
        continue;
      }
      let nearTransparent = false;
      for (let dy = -2; dy <= 2 && !nearTransparent; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if ((dx !== 0 || dy !== 0) && !opaque(x + dx, y + dy)) {
            nearTransparent = true;
            break;
          }
        }
      }
      if (!nearTransparent) {
        continue;
      }
      bandCount += 1;
      const i = (y * width + x) * 4;
      const luma = 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
      if (luma < lumaThreshold) {
        darkCount += 1;
      }
    }
  }
  if (bandCount === 0) {
    return null;
  }
  const ratio = darkCount / bandCount;
  if (ratio <= maxRatio) {
    return null;
  }
  return {
    assetId,
    ruleId: "NOISE-02",
    measured: `dark contour ratio=${(ratio * 100).toFixed(1)}% (${darkCount}/${bandCount}px, luma<${lumaThreshold})`,
    threshold: `<=${(maxRatio * 100).toFixed(0)}%`,
    message: "輪郭帯の黒マットフリンジ禁止"
  };
}

/**
 * NOISE-03: no transparent holes fully enclosed by the opaque body. A hole is
 * a 4-connected fully-transparent (alpha <= 8) component that does not reach
 * the image border.
 */
export function checkInteriorHoles(assetId: string, image: RawImage): ArtLintViolation | null {
  const { data, width, height } = image;
  const scan = labelComponents(width, height, (p) => (data[p * 4 + 3] ?? 0) <= 8);
  const holes: number[] = [];
  for (let id = 0; id < scan.sizes.length; id += 1) {
    if (!(scan.touchesBorder[id] ?? false)) {
      holes.push(scan.sizes[id] ?? 0);
    }
  }
  if (holes.length === 0) {
    return null;
  }
  return {
    assetId,
    ruleId: "NOISE-03",
    measured: `${holes.length} enclosed hole(s), largest=${Math.max(...holes)}px`,
    threshold: "0 enclosed transparent components",
    message: "不透過本体内部の透明穴禁止"
  };
}
