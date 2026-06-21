import { describe, expect, it } from "vitest";
import { createInitialWorld, snapshotWorld } from "./index";

describe("connected terrain asset masks", () => {
  it("assigns a N,E,S,W mask to every terrain cell", () => {
    const snapshot = snapshotWorld(createInitialWorld());

    for (const cell of snapshot.map.cells) {
      expect(cell.assetId).toMatch(new RegExp(`^terrain\\.${cell.terrain}\\.connected\\.[01]{4}$`));
    }
  });

  it("uses a full connection mask for cells surrounded by the same terrain", () => {
    const snapshot = snapshotWorld(createInitialWorld());
    const cell = snapshot.map.cells.find((candidate) => candidate.assetId.endsWith(".connected.1111"));

    expect(cell).toBeDefined();
  });
});
