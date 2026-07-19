import { describe, expect, it } from "vitest";
import { checkInteriorHoles, checkMatteFringe, checkSpeckles } from "./artLint/checks";
import { despeckleRgba } from "./despeckle";

function blank(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height * 4);
}

function setPixel(
  data: Uint8Array,
  width: number,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number]
): void {
  const i = (y * width + x) * 4;
  data[i] = rgba[0];
  data[i + 1] = rgba[1];
  data[i + 2] = rgba[2];
  data[i + 3] = rgba[3];
}

function fillRect(
  data: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgba: readonly [number, number, number, number]
): void {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      setPixel(data, width, x, y, rgba);
    }
  }
}

describe("despeckleRgba", () => {
  it("clears opaque components smaller than 4px (NOISE-01)", () => {
    const width = 16;
    const height = 16;
    const data = blank(width, height);
    fillRect(data, width, 4, 4, 11, 11, [120, 90, 60, 255]);
    setPixel(data, width, 1, 1, [200, 10, 10, 255]);
    setPixel(data, width, 14, 2, [200, 10, 10, 255]);
    setPixel(data, width, 14, 3, [200, 10, 10, 255]);
    expect(checkSpeckles("t", { data, width, height })).not.toBeNull();

    const stats = despeckleRgba({ data, width, height });
    expect(stats.specklePixelsCleared).toBe(3);
    expect(checkSpeckles("t", { data, width, height })).toBeNull();
    // The body itself is untouched.
    expect(data[(4 * width + 4) * 4 + 3]).toBe(255);
  });

  it("fills enclosed transparent holes from neighbouring colors (NOISE-03)", () => {
    const width = 16;
    const height = 16;
    const data = blank(width, height);
    fillRect(data, width, 2, 2, 13, 13, [100, 80, 50, 255]);
    // 2x2 pinhole in the middle
    fillRect(data, width, 7, 7, 8, 8, [0, 0, 0, 0]);
    expect(checkInteriorHoles("t", { data, width, height })).not.toBeNull();

    const stats = despeckleRgba({ data, width, height });
    expect(stats.holePixelsFilled).toBe(4);
    expect(checkInteriorHoles("t", { data, width, height })).toBeNull();
    const i = (7 * width + 7) * 4;
    expect(data[i + 3]).toBe(255);
    expect(data[i]).toBe(100);
    expect(data[i + 1]).toBe(80);
    expect(data[i + 2]).toBe(50);
  });

  it("does not fill background regions that touch the border", () => {
    const width = 16;
    const height = 16;
    const data = blank(width, height);
    fillRect(data, width, 4, 4, 11, 11, [100, 80, 50, 255]);
    const stats = despeckleRgba({ data, width, height });
    expect(stats.holePixelsFilled).toBe(0);
    expect(data[3]).toBe(0);
  });

  it("lifts a violating dark fringe only when enabled and violating (NOISE-02)", () => {
    const width = 20;
    const height = 20;
    const makeFringed = (): Uint8Array => {
      const data = blank(width, height);
      fillRect(data, width, 4, 4, 15, 15, [140, 110, 80, 255]);
      // Dark matte ring on the whole contour: the band is dominated by
      // near-black pixels, far above the 8% ratio.
      for (let x = 4; x <= 15; x += 1) {
        setPixel(data, width, x, 4, [5, 5, 5, 255]);
        setPixel(data, width, x, 15, [5, 5, 5, 255]);
      }
      for (let y = 4; y <= 15; y += 1) {
        setPixel(data, width, 4, y, [5, 5, 5, 255]);
        setPixel(data, width, 15, y, [5, 5, 5, 255]);
      }
      return data;
    };

    const untouched = makeFringed();
    const off = despeckleRgba({ data: untouched, width, height });
    expect(off.fringePixelsLifted).toBe(0);

    const data = makeFringed();
    expect(checkMatteFringe("t", { data, width, height })).not.toBeNull();
    const stats = despeckleRgba({ data, width, height }, { liftDarkFringe: true });
    expect(stats.fringePixelsLifted).toBeGreaterThan(0);
    expect(checkMatteFringe("t", { data, width, height })).toBeNull();
  });

  it("leaves a passing dark contour untouched even with fringe lift enabled", () => {
    const width = 20;
    const height = 20;
    const data = blank(width, height);
    fillRect(data, width, 4, 4, 15, 15, [140, 110, 80, 255]);
    // A few intentional dark accents, below the 8% band ratio.
    setPixel(data, width, 4, 4, [5, 5, 5, 255]);
    setPixel(data, width, 15, 15, [5, 5, 5, 255]);
    const before = Array.from(data);
    const stats = despeckleRgba({ data, width, height }, { liftDarkFringe: true });
    expect(stats.fringePixelsLifted).toBe(0);
    expect(Array.from(data)).toEqual(before);
  });

  it("merges a speckle inside a hole into the filled body instead of erasing it", () => {
    const width = 16;
    const height = 16;
    const data = blank(width, height);
    fillRect(data, width, 2, 2, 13, 13, [100, 80, 50, 255]);
    // 3x3 enclosed hole with a 1px opaque speckle at its centre.
    fillRect(data, width, 6, 6, 8, 8, [0, 0, 0, 0]);
    setPixel(data, width, 7, 7, [200, 10, 10, 255]);

    const stats = despeckleRgba({ data, width, height });
    expect(stats.holePixelsFilled).toBe(8);
    expect(stats.specklePixelsCleared).toBe(0);
    expect(checkSpeckles("t", { data, width, height })).toBeNull();
    expect(checkInteriorHoles("t", { data, width, height })).toBeNull();
  });

  it("demotes a speckle in a semi-transparent moat instead of leaving a hole", () => {
    // Regression: erasing a speckle surrounded by alpha 9..127 pixels used to
    // leave an enclosed alpha-0 pocket (NOISE-03), and refilling that pocket
    // recreated the speckle (NOISE-01) — the two fixes oscillated forever.
    const width = 16;
    const height = 16;
    const data = blank(width, height);
    fillRect(data, width, 2, 2, 13, 13, [120, 90, 60, 255]);
    fillRect(data, width, 6, 6, 9, 9, [120, 90, 60, 40]);
    setPixel(data, width, 7, 7, [200, 10, 10, 255]);
    setPixel(data, width, 8, 7, [200, 10, 10, 255]);
    expect(checkSpeckles("t", { data, width, height })).not.toBeNull();

    despeckleRgba({ data, width, height });
    expect(checkSpeckles("t", { data, width, height })).toBeNull();
    expect(checkInteriorHoles("t", { data, width, height })).toBeNull();
    // Demoted, not erased: color kept, alpha between hole and opaque thresholds.
    expect(data[(7 * width + 7) * 4]).toBe(200);
    expect(data[(7 * width + 7) * 4 + 3]).toBeGreaterThan(8);
    expect(data[(7 * width + 7) * 4 + 3]).toBeLessThan(128);

    // Fixed point: a second run changes nothing.
    const once = Array.from(data);
    despeckleRgba({ data, width, height });
    expect(Array.from(data)).toEqual(once);
  });

  it("is deterministic", () => {
    const width = 24;
    const height = 24;
    const make = (): Uint8Array => {
      const data = blank(width, height);
      fillRect(data, width, 3, 3, 20, 20, [90, 70, 45, 255]);
      fillRect(data, width, 10, 10, 12, 11, [0, 0, 0, 0]);
      setPixel(data, width, 1, 21, [200, 10, 10, 255]);
      return data;
    };
    const a = make();
    const b = make();
    despeckleRgba({ data: a, width, height });
    despeckleRgba({ data: b, width, height });
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
