/**
 * Release 2.0 look development: color grade "C 大河ドラマ" + aerial
 * perspective constants (assets/intermediate/spike/lookdev/lookdev-report.md).
 *
 * The grade decomposes as
 *   v' = Contrast(1.10) · Gain(1.030, 1.000, 0.950) · Saturation(0.70) · v + offset
 *   offset = (−0.010, −0.005, +0.012) split-tone + contrast pivot term
 * with Rec.709 luma weights (0.2126, 0.7152, 0.0722) for saturation.
 *
 * IMPORTANT: Pixi's `ColorMatrixFilter.saturate()` preset uses different luma
 * weights (0.3086/0.6094/0.0820), so the pre-composed 20-element matrix below
 * must be assigned to `filter.matrix` directly — never rebuilt from presets.
 *
 * This module is deliberately free of pixi.js imports so the E2E helpers can
 * import it in a plain node environment and derive the expected on-screen
 * colors for pixel-matching tests.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Composed 4x5 color matrix for grade C, row-major, offsets (5th column)
 * normalized to 0..1 per the Pixi ColorMatrixFilter convention.
 */
export const TONE_MATRIX_C: readonly number[] = [
  0.865363, 0.243096, 0.024541, 0, -0.060,
  0.070158, 1.006016, 0.023826, 0, -0.055,
  0.066650, 0.224215, 0.754135, 0, -0.038,
  0,        0,        0,        1,  0
];

/** Aerial haze color #c7cdd6 (cool ivory, same family as the shadow blue-ink). */
export const AERIAL_HAZE_RGB: Rgb = { r: 0xc7, g: 0xcd, b: 0xd6 };

/** Haze opacity at the very top of the screen. */
export const AERIAL_TOP_ALPHA = 0.2;

/** Screen-height ratio at which the haze fades to fully transparent. */
export const AERIAL_FADE_END_RATIO = 0.55;

/**
 * Haze opacity at a vertical position, as a ratio of screen height
 * (0 = top edge, 1 = bottom edge). Linear 20% → 0% at 55%, then 0.
 */
export function aerialAlphaAt(yRatio: number): number {
  if (yRatio >= AERIAL_FADE_END_RATIO) {
    return 0;
  }
  return AERIAL_TOP_ALPHA * (1 - Math.max(0, yRatio) / AERIAL_FADE_END_RATIO);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Apply the grade-C matrix to one sRGB color (0..255 per channel), matching
 * what the GPU filter does to an opaque world pixel.
 */
export function applyToneGrade(rgb: Rgb): Rgb {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const m = TONE_MATRIX_C;
  const channel = (row: number): number =>
    Math.round(clamp01(m[row * 5]! * r + m[row * 5 + 1]! * g + m[row * 5 + 2]! * b + m[row * 5 + 4]!) * 255);
  return { r: channel(0), g: channel(1), b: channel(2) };
}

/**
 * Expected final on-screen color of a world-space sRGB color: grade-C matrix
 * followed by the screen-fixed aerial haze blend at vertical pixel `y` of a
 * screen `screenHeight` pixels tall.
 */
export function expectedScreenColor(base: Rgb, y: number, screenHeight: number): Rgb {
  const toned = applyToneGrade(base);
  const alpha = aerialAlphaAt(screenHeight > 0 ? y / screenHeight : 1);
  if (alpha <= 0) {
    return toned;
  }
  return {
    r: Math.round(toned.r * (1 - alpha) + AERIAL_HAZE_RGB.r * alpha),
    g: Math.round(toned.g * (1 - alpha) + AERIAL_HAZE_RGB.g * alpha),
    b: Math.round(toned.b * (1 - alpha) + AERIAL_HAZE_RGB.b * alpha)
  };
}
