import { describe, expect, it } from "vitest";
import {
  AERIAL_FADE_END_RATIO,
  AERIAL_TOP_ALPHA,
  TONE_MATRIX_C,
  aerialAlphaAt,
  applyToneGrade,
  expectedScreenColor,
  type Rgb
} from "./toneGrade";

/**
 * Reference probes from the lookdev arbitration
 * (assets/intermediate/spike/lookdev/lookdev-report.md, grade C 大河ドラマ).
 * The composed matrix must reproduce them exactly (±1 for rounding).
 */
const PROBES: ReadonlyArray<{ name: string; input: Rgb; expected: Rgb }> = [
  { name: "白", input: { r: 255, g: 255, b: 255 }, expected: { r: 255, g: 255, b: 255 } },
  { name: "漆喰", input: { r: 232, g: 226, b: 214 }, expected: { r: 246, g: 235, b: 218 } },
  { name: "黒", input: { r: 20, g: 20, b: 22 }, expected: { r: 7, g: 8, b: 13 } },
  { name: "瓦", input: { r: 70, g: 72, b: 78 }, expected: { r: 65, g: 65, b: 70 } },
  { name: "草地", input: { r: 138, g: 158, b: 110 }, expected: { r: 145, g: 157, b: 118 } },
  { name: "敵tint赤", input: { r: 255, g: 159, b: 143 }, expected: { r: 248, g: 167, b: 151 } },
  { name: "選択リング金", input: { r: 241, g: 205, b: 119 }, expected: { r: 246, g: 212, b: 142 } },
  { name: "堀水", input: { r: 70, g: 100, b: 120 }, expected: { r: 73, g: 94, b: 108 } }
];

describe("toneGrade grade C matrix", () => {
  it("has 20 elements with identity alpha row", () => {
    expect(TONE_MATRIX_C).toHaveLength(20);
    expect(TONE_MATRIX_C.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });

  for (const probe of PROBES) {
    it(`reproduces the lookdev probe: ${probe.name}`, () => {
      const actual = applyToneGrade(probe.input);
      expect(Math.abs(actual.r - probe.expected.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(actual.g - probe.expected.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(actual.b - probe.expected.b)).toBeLessThanOrEqual(1);
    });
  }
});

describe("aerialAlphaAt", () => {
  it("is 20% at the top edge", () => {
    expect(aerialAlphaAt(0)).toBeCloseTo(AERIAL_TOP_ALPHA, 10);
  });

  it("fades linearly to 0 at 55% of the screen height", () => {
    expect(aerialAlphaAt(AERIAL_FADE_END_RATIO / 2)).toBeCloseTo(AERIAL_TOP_ALPHA / 2, 10);
    expect(aerialAlphaAt(AERIAL_FADE_END_RATIO)).toBe(0);
    expect(aerialAlphaAt(1)).toBe(0);
  });
});

describe("expectedScreenColor", () => {
  it("matches the pure grade below the haze band", () => {
    const input = { r: 138, g: 158, b: 110 };
    expect(expectedScreenColor(input, 550, 1000)).toEqual(applyToneGrade(input));
    expect(expectedScreenColor(input, 999, 1000)).toEqual(applyToneGrade(input));
  });

  it("blends 20% haze #c7cdd6 at the top edge", () => {
    const toned = applyToneGrade({ r: 20, g: 20, b: 22 }); // (7, 8, 13)
    const top = expectedScreenColor({ r: 20, g: 20, b: 22 }, 0, 1000);
    expect(top).toEqual({
      r: Math.round(toned.r * 0.8 + 0xc7 * 0.2),
      g: Math.round(toned.g * 0.8 + 0xcd * 0.2),
      b: Math.round(toned.b * 0.8 + 0xd6 * 0.2)
    });
  });
});
