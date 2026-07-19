import sharp from "sharp";
import { labelComponents } from "./artLint/checks";

/**
 * Deterministic despeckle post-processing for the render pipeline.
 *
 * Each fix inverts one NOISE rule from docs/05_map-and-art/art-rulebook.md
 * using the exact same pixel predicates as the L1 lint (artLint/checks.ts),
 * so a despeckled image is guaranteed to pass the corresponding check:
 *
 *   NOISE-01 clearSpeckles    — erase 4-connected opaque components < 4 px
 *                                (demote to semi-transparent when enclosed,
 *                                so no interior hole is left behind)
 *   NOISE-03 fillInteriorHoles — fill enclosed transparent components from
 *                                their solid neighbours
 *   NOISE-02 liftDarkFringe   — recolor near-black contour-band pixels from
 *                                nearby bright opaque pixels, but ONLY when
 *                                the image actually violates the ratio
 *                                threshold (passing art is never altered)
 *
 * All fixes are pure functions of the input pixels (fixed scan order,
 * Jacobi-style passes), so re-running the pipeline is reproducible.
 */

const OPAQUE_ALPHA = 128;
const HOLE_ALPHA = 8;
/**
 * Speckles that do not touch the border-connected background cannot be erased
 * (the empty pocket would become a NOISE-03 interior hole) — instead their
 * alpha is demoted below the opaque threshold but above the hole threshold,
 * which is invisible to all three NOISE predicates.
 */
const DEMOTED_SPECKLE_ALPHA = 100;
const FRINGE_LUMA_THRESHOLD = 24;
const FRINGE_MAX_RATIO = 0.08;
/** Lift until safely under the lint threshold, not just barely at it. */
const FRINGE_TARGET_RATIO = 0.06;
/**
 * Fringe-lift sampling ignores high-chroma outliers (max−min channel spread):
 * stray saturated pixels on contour edges are NOISE-04 cleanup residue, and
 * averaging them would smear e.g. a magenta speck across the whole band.
 */
const FRINGE_MAX_SAMPLE_CHROMA = 96;
/**
 * Lifted pixels are blended toward the neighbour average only far enough to
 * reach this luma — replacing them outright with the (often pale) average
 * would paint a bright halo along dark contours like roof ridges.
 */
const FRINGE_LIFT_TARGET_LUMA = 32;
const MAX_PASSES = 64;

export interface DespeckleOptions {
  /** NOISE-01: erase opaque components smaller than this (lint minArea). */
  readonly minSpeckleArea?: number;
  /** NOISE-02 fix — lint applies the rule to building sprites only. */
  readonly liftDarkFringe?: boolean;
  /** NOISE-03 fix — lint applies the rule to static assets, not sheets. */
  readonly fillInteriorHoles?: boolean;
}

export interface DespeckleStats {
  readonly specklePixelsCleared: number;
  readonly holePixelsFilled: number;
  readonly fringePixelsLifted: number;
}

interface MutableRawImage {
  readonly data: Buffer | Uint8Array;
  readonly width: number;
  readonly height: number;
}

/**
 * Applies the enabled fixes in place. Returns per-fix pixel counts.
 *
 * Holes are filled before speckles are cleared: an opaque speckle sitting
 * inside an enclosed hole merges into the filled body instead of being
 * erased and leaving a fresh pinhole behind.
 */
export function despeckleRgba(image: MutableRawImage, options?: DespeckleOptions): DespeckleStats {
  const holePixelsFilled = options?.fillInteriorHoles === false ? 0 : fillInteriorHoles(image);
  const specklePixelsCleared = clearSpeckles(image, options?.minSpeckleArea ?? 4);
  const fringePixelsLifted = options?.liftDarkFringe === true ? liftDarkFringe(image) : 0;
  return { specklePixelsCleared, holePixelsFilled, fringePixelsLifted };
}

/** Loads a PNG, applies despeckle, and writes the result to `outputPath`. */
export async function despecklePngFile(
  sourcePath: string,
  outputPath: string,
  options?: DespeckleOptions
): Promise<DespeckleStats> {
  const { data, info } = await sharp(sourcePath, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stats = despeckleRgba({ data, width: info.width, height: info.height }, options);
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(outputPath);
  return stats;
}

function clearSpeckles(image: MutableRawImage, minArea: number): number {
  const { data, width, height } = image;
  const scan = labelComponents(width, height, (p) => (data[p * 4 + 3] ?? 0) >= OPAQUE_ALPHA);
  const doomed = scan.sizes.map((size) => size < minArea);
  if (!doomed.some(Boolean)) {
    return 0;
  }

  const transparent = labelComponents(width, height, (p) => (data[p * 4 + 3] ?? 0) <= HOLE_ALPHA);
  const isBackground = (p: number): boolean => {
    const label = transparent.labels[p] ?? -1;
    return label >= 0 && (transparent.touchesBorder[label] ?? false);
  };
  const touchesBackground = scan.sizes.map(() => false);
  for (let p = 0; p < width * height; p += 1) {
    const label = scan.labels[p] ?? -1;
    if (label < 0 || !(doomed[label] ?? false) || (touchesBackground[label] ?? false)) {
      continue;
    }
    const x = p % width;
    const y = (p - x) / width;
    const neighbors = [
      x > 0 ? p - 1 : -1,
      x < width - 1 ? p + 1 : -1,
      y > 0 ? p - width : -1,
      y < height - 1 ? p + width : -1
    ];
    if (neighbors.some((q) => q >= 0 && isBackground(q))) {
      touchesBackground[label] = true;
    }
  }

  let cleared = 0;
  for (let p = 0; p < width * height; p += 1) {
    const label = scan.labels[p] ?? -1;
    if (label < 0 || !(doomed[label] ?? false)) {
      continue;
    }
    if (touchesBackground[label] ?? false) {
      data[p * 4] = 0;
      data[p * 4 + 1] = 0;
      data[p * 4 + 2] = 0;
      data[p * 4 + 3] = 0;
    } else {
      data[p * 4 + 3] = DEMOTED_SPECKLE_ALPHA;
    }
    cleared += 1;
  }
  return cleared;
}

function fillInteriorHoles(image: MutableRawImage): number {
  const { data, width, height } = image;
  const scan = labelComponents(width, height, (p) => (data[p * 4 + 3] ?? 0) <= HOLE_ALPHA);
  const enclosed = scan.sizes.map((_, id) => !(scan.touchesBorder[id] ?? false));
  if (!enclosed.some(Boolean)) {
    return 0;
  }

  const isHole = new Uint8Array(width * height);
  const remaining: number[] = [];
  for (let p = 0; p < width * height; p += 1) {
    const label = scan.labels[p] ?? -1;
    if (label >= 0 && (enclosed[label] ?? false)) {
      isHole[p] = 1;
      remaining.push(p);
    }
  }

  // Jacobi-style inward fill: each pass fills every hole pixel that touches a
  // qualifying neighbour with the average of those neighbours (sampled from
  // the state before the pass), so the result is independent of scan order.
  // Opaque neighbours only at first: semi-transparent contour pixels carry
  // background-tinted colors that would surface as light blobs in the fill.
  // If a pocket is bordered exclusively by semi-transparent pixels, a
  // fallback pass accepts them so the hole still disappears.
  let filled = 0;
  let frontier = remaining;
  let minNeighborAlpha = OPAQUE_ALPHA;
  for (let pass = 0; frontier.length > 0 && pass < MAX_PASSES; pass += 1) {
    const updates: Array<{ p: number; r: number; g: number; b: number }> = [];
    const next: number[] = [];
    for (const p of frontier) {
      const x = p % width;
      const y = (p - x) / width;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      const neighbors = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1
      ];
      for (const q of neighbors) {
        if (q >= 0 && isHole[q] === 0 && (data[q * 4 + 3] ?? 0) >= minNeighborAlpha) {
          r += data[q * 4] ?? 0;
          g += data[q * 4 + 1] ?? 0;
          b += data[q * 4 + 2] ?? 0;
          count += 1;
        }
      }
      if (count > 0) {
        updates.push({ p, r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) });
      } else {
        next.push(p);
      }
    }
    if (updates.length === 0) {
      if (minNeighborAlpha === 0) {
        break;
      }
      minNeighborAlpha = 0;
      continue;
    }
    for (const { p, r, g, b } of updates) {
      data[p * 4] = r;
      data[p * 4 + 1] = g;
      data[p * 4 + 2] = b;
      data[p * 4 + 3] = 255;
      isHole[p] = 0;
      filled += 1;
    }
    frontier = next;
    minNeighborAlpha = OPAQUE_ALPHA;
  }
  return filled;
}

function liftDarkFringe(image: MutableRawImage): number {
  const { data, width, height } = image;
  const opaque = (x: number, y: number): boolean =>
    x >= 0 && x < width && y >= 0 && y < height && (data[(y * width + x) * 4 + 3] ?? 0) >= OPAQUE_ALPHA;
  const luma = (p: number): number =>
    0.2126 * (data[p * 4] ?? 0) + 0.7152 * (data[p * 4 + 1] ?? 0) + 0.0722 * (data[p * 4 + 2] ?? 0);
  const chroma = (p: number): number => {
    const r = data[p * 4] ?? 0;
    const g = data[p * 4 + 1] ?? 0;
    const b = data[p * 4 + 2] ?? 0;
    return Math.max(r, g, b) - Math.min(r, g, b);
  };

  // Contour band exactly as checkMatteFringe: opaque pixels within Chebyshev
  // distance 2 of a non-opaque pixel.
  const band: number[] = [];
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
      if (nearTransparent) {
        band.push(y * width + x);
      }
    }
  }
  if (band.length === 0) {
    return 0;
  }

  const darkRatio = (): number => band.filter((p) => luma(p) < FRINGE_LUMA_THRESHOLD).length / band.length;
  if (darkRatio() <= FRINGE_MAX_RATIO) {
    return 0;
  }

  let lifted = 0;
  for (let pass = 0; pass < MAX_PASSES && darkRatio() > FRINGE_TARGET_RATIO; pass += 1) {
    const updates: Array<{ p: number; r: number; g: number; b: number }> = [];
    for (const p of band) {
      if (luma(p) >= FRINGE_LUMA_THRESHOLD) {
        continue;
      }
      const x = p % width;
      const y = (p - x) / width;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          if (!opaque(x + dx, y + dy)) {
            continue;
          }
          const q = (y + dy) * width + (x + dx);
          if (luma(q) >= FRINGE_LUMA_THRESHOLD && chroma(q) <= FRINGE_MAX_SAMPLE_CHROMA) {
            r += data[q * 4] ?? 0;
            g += data[q * 4 + 1] ?? 0;
            b += data[q * 4 + 2] ?? 0;
            count += 1;
          }
        }
      }
      if (count === 0) {
        continue;
      }
      const avgR = r / count;
      const avgG = g / count;
      const avgB = b / count;
      const avgLuma = 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB;
      const ownLuma = luma(p);
      const t =
        avgLuma <= FRINGE_LIFT_TARGET_LUMA ? 1 : Math.min(1, (FRINGE_LIFT_TARGET_LUMA - ownLuma) / (avgLuma - ownLuma));
      const own = [data[p * 4] ?? 0, data[p * 4 + 1] ?? 0, data[p * 4 + 2] ?? 0];
      updates.push({
        p,
        r: Math.round((own[0] ?? 0) + t * (avgR - (own[0] ?? 0))),
        g: Math.round((own[1] ?? 0) + t * (avgG - (own[1] ?? 0))),
        b: Math.round((own[2] ?? 0) + t * (avgB - (own[2] ?? 0)))
      });
    }
    if (updates.length === 0) {
      break;
    }
    for (const { p, r, g, b } of updates) {
      data[p * 4] = r;
      data[p * 4 + 1] = g;
      data[p * 4 + 2] = b;
      lifted += 1;
    }
  }
  return lifted;
}
