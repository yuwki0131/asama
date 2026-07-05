import { describe, expect, it } from "vitest";
import { createInitialWorld, snapshotWorld } from "./index";

describe("connected terrain asset masks", () => {
  it("assigns a connected-mask or macro asset id to every terrain cell", () => {
    const snapshot = snapshotWorld(createInitialWorld());

    // Cells under lot building footprints receive a dirt visual override;
    // exempt them from the terrain-prefix check.
    const buildingFootprint = new Set(
      snapshot.buildings.flatMap(b => b.footprint.map(fc => `${fc.x},${fc.y}`))
    );

    // Border cells carry NESW connection masks (water shores also carry a
    // wavy-bank variant suffix); interior cells sample the world-anchored
    // macro field except for stone, which has no macro set.
    const connected = /^terrain\.(grass|dirt|stone|water)\.connected\.[01]{4}(\.v[12])?$/;
    const macro = /^terrain\.(grass|dirt|water)\.macro\.v[01]\.[0-3]\.[0-3]$/;
    for (const cell of snapshot.map.cells) {
      const ok = connected.test(cell.assetId) || macro.test(cell.assetId);
      expect(ok, `unexpected terrain assetId: ${cell.assetId}`).toBe(true);
      if (!buildingFootprint.has(`${cell.coord.x},${cell.coord.y}`)) {
        expect(cell.assetId.startsWith(`terrain.${cell.terrain}.`)).toBe(true);
      }
    }
  });

  it("uses macro tiles for interior cells and masks at boundaries", () => {
    const snapshot = snapshotWorld(createInitialWorld());
    const macroCell = snapshot.map.cells.find((candidate) => candidate.assetId.includes(".macro."));
    const maskCell = snapshot.map.cells.find((candidate) => /\.connected\.[01]{4}/.test(candidate.assetId));

    expect(macroCell).toBeDefined();
    expect(maskCell).toBeDefined();
  });
});
