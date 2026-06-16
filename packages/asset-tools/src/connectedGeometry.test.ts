import { describe, expect, it } from "vitest";
import {
  CONNECTED_MASKS,
  connectedGeometry,
  connectedMaskDirections,
  connectedSegments,
  connectedSockets,
  normalizedAnchor,
  socketWorldPosition
} from "./connectedGeometry";
import { renderPlaceholderSvg } from "./templates";

describe("connected structure geometry", () => {
  const fenceGeometry = connectedGeometry(64, 64, 32, 48);
  const wallGeometry = connectedGeometry(64, 72, 32, 56);

  it("uses N,E,S,W bit order and produces 16 masks", () => {
    expect(CONNECTED_MASKS).toHaveLength(16);
    expect(connectedMaskDirections("1000")).toEqual(["n"]);
    expect(connectedMaskDirections("0100")).toEqual(["e"]);
    expect(connectedMaskDirections("0010")).toEqual(["s"]);
    expect(connectedMaskDirections("0001")).toEqual(["w"]);
  });

  it("classifies straight, corner, T, and cross masks", () => {
    expect(connectedMaskDirections("1010")).toEqual(["n", "s"]);
    expect(connectedMaskDirections("0101")).toEqual(["e", "w"]);
    expect(connectedMaskDirections("1100")).toEqual(["n", "e"]);
    expect(connectedMaskDirections("1110")).toEqual(["n", "e", "s"]);
    expect(connectedMaskDirections("1111")).toEqual(["n", "e", "s", "w"]);
  });

  it("anchors sockets to the requested ground point", () => {
    expect(connectedSockets(fenceGeometry)).toEqual({
      n: { x: 48, y: 40 },
      e: { x: 48, y: 56 },
      s: { x: 16, y: 56 },
      w: { x: 16, y: 40 }
    });
    expect(connectedSockets(wallGeometry)).toEqual({
      n: { x: 48, y: 48 },
      e: { x: 48, y: 64 },
      s: { x: 16, y: 64 },
      w: { x: 16, y: 48 }
    });
  });

  it("matches adjacent socket world positions within one pixel", () => {
    const east = socketWorldPosition({ x: 0, y: 0 }, fenceGeometry, "e");
    const west = socketWorldPosition({ x: 1, y: 0 }, fenceGeometry, "w");
    expect(Math.abs(east.x - west.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(east.y - west.y)).toBeLessThanOrEqual(1);

    const north = socketWorldPosition({ x: 0, y: 0 }, wallGeometry, "n");
    const south = socketWorldPosition({ x: 0, y: -1 }, wallGeometry, "s");
    expect(Math.abs(north.x - south.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(north.y - south.y)).toBeLessThanOrEqual(1);
  });

  it("draws straight masks as one socket-to-socket segment", () => {
    expect(connectedSegments("1010", fenceGeometry)).toEqual([[{ x: 48, y: 40 }, { x: 16, y: 56 }]]);
    expect(connectedSegments("0101", fenceGeometry)).toEqual([[{ x: 48, y: 56 }, { x: 16, y: 40 }]]);
  });

  it("keeps base and connected anchors identical for fence and wall", () => {
    expect(normalizedAnchor(32, 48, 64, 64)).toEqual({ x: 0.5, y: 0.75 });
    expect(normalizedAnchor(32, 56, 64, 72)).toEqual({ x: 0.5, y: 56 / 72 });

    const fenceSvg = renderPlaceholderSvg({
      assetId: "building.fence.wood.connected.1010",
      kind: "building",
      output: "building-fence-wood-connected-1010.png",
      width: 64,
      height: 64,
      fill: "#8a5f35",
      stroke: "#2f2116",
      pattern: "connected-fence",
      connectionMask: "1010",
      anchor: { x: 0.5, y: 0.75 }
    });
    expect(fenceSvg).not.toContain("<polygon points=\"32,22");

    const wallSvg = renderPlaceholderSvg({
      assetId: "building.wall.plaster.connected.0101",
      kind: "building",
      output: "building-wall-plaster-connected-0101.png",
      width: 64,
      height: 72,
      fill: "#ded9c5",
      stroke: "#3f3a31",
      accent: "#59616a",
      pattern: "connected-wall",
      connectionMask: "0101",
      anchor: { x: 0.5, y: 56 / 72 }
    });
    expect(wallSvg).not.toContain("rx=\"28\" ry=\"7\"");
  });
});
