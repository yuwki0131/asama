import { describe, expect, it } from "vitest";
import { parseRendererMode } from "./rendererMode";

describe("parseRendererMode", () => {
  it("returns 2d by default", () => {
    expect(parseRendererMode("")).toBe("2d");
    expect(parseRendererMode("?scenario=concentric-castle")).toBe("2d");
  });
  it("returns 3d when ?renderer=3d", () => {
    expect(parseRendererMode("?renderer=3d")).toBe("3d");
    expect(parseRendererMode("?scenario=hybrid-renderer-trial&renderer=3d")).toBe("3d");
  });
  it("returns 2d for explicit ?renderer=2d", () => {
    expect(parseRendererMode("?renderer=2d")).toBe("2d");
  });
  it("falls back to 2d for unknown values", () => {
    expect(parseRendererMode("?renderer=vr")).toBe("2d");
    expect(parseRendererMode("?renderer=")).toBe("2d");
  });
});
