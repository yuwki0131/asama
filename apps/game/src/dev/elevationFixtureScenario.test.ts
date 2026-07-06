import { describe, expect, it } from "vitest";
import { createInitialWorld } from "@asama/simulation";
import { elevationFixtureScenario } from "./elevationFixtureScenario";

/** Boots the fixture through the real sim so the scenario's slopes/terraces
 *  pass `applyScenarioElevation`'s validation (which throws on bad ramps). */
describe("elevationFixtureScenario", () => {
  it("boots without validation errors", () => {
    expect(() => createInitialWorld(elevationFixtureScenario)).not.toThrow();
  });

  it("produces the expected terraces, slopes and skins", () => {
    const world = createInitialWorld(elevationFixtureScenario);
    const cell = (x: number, y: number) => world.map.cells[y * world.map.width + x]!;

    expect(cell(40, 72).elevation).toBe(0); // base plain
    expect(cell(37, 65).elevation).toBe(1); // rock terrace
    expect(cell(37, 65).elevationSkin).toBe("cliff");
    expect(cell(40, 57).elevation).toBe(3); // summit
    expect(cell(40, 57).elevationSkin).toBe("ishigaki");

    // Climbing route: 0→1, 1→2 (width 2), 2→3 (width 1).
    expect(cell(40, 68).slope).toBe("N");
    expect(cell(41, 68).slope).toBe("N");
    expect(cell(40, 68).elevation).toBe(0);
    expect(cell(40, 63).slope).toBe("N");
    expect(cell(40, 63).elevation).toBe(1);
    expect(cell(40, 60).slope).toBe("N");
    expect(cell(40, 60).elevation).toBe(2);
    expect(cell(41, 60).slope).toBeNull();

    // Units spawned where the fixture says, including on high ground.
    const archer = world.units.find((unit) => unit.type === "archer");
    expect(archer?.position).toEqual({ x: 39, y: 58 });
    expect(cell(39, 58).elevation).toBe(3);
  });

  it("keeps the session alive (honmaru present, no instant victory)", () => {
    const world = createInitialWorld(elevationFixtureScenario);
    expect(world.buildings.some((b) => b.type === "honmaru")).toBe(true);
    expect(world.outcome).toBeNull();
    // A pending far-future wave prevents the annihilation victory.
    expect(world.scenario.waves.length).toBeGreaterThan(0);
  });
});
