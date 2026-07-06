import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CameraState } from "./camera";

// Mock pixi.js before the module under test is imported.
vi.mock("pixi.js", () => {
  const makeMockGraphics = () => {
    const gfx: Record<string, unknown> = {
      x: 0,
      y: 0,
      alpha: 1,
      rotation: 0,
      scale: { set: vi.fn() },
      moveTo() { return gfx; },
      lineTo() { return gfx; },
      ellipse() { return gfx; },
      rect() { return gfx; },
      closePath() { return gfx; },
      fill() { return gfx; },
      stroke() { return gfx; },
      destroy: vi.fn()
    };
    return gfx;
  };

  class MockContainer {
    children: unknown[] = [];
    addChild(...items: unknown[]) {
      this.children.push(...items);
      return items[0];
    }
    removeChild(item: unknown) {
      const idx = this.children.indexOf(item);
      if (idx >= 0) this.children.splice(idx, 1);
    }
  }

  return {
    Graphics: vi.fn().mockImplementation(makeMockGraphics),
    Container: MockContainer
  };
});

import { EffectsLayer } from "./effectsLayer";
import type {
  CombatEventSnapshot,
  EconomySnapshot,
  FoodSnapshot,
  WorldSnapshot
} from "@asama/shared";

// --- Helpers ---

const MOCK_FOOD: FoodSnapshot = {
  available: 0,
  total: 0,
  capacity: 0,
  requiredPerCycle: 0,
  nextConsumptionInTicks: 0
};

const MOCK_ECONOMY: EconomySnapshot = {
  gold: 0,
  weapons: 0,
  population: 0,
  populationCapacity: 0,
  approval: 0,
  recruitPool: 0,
  recruitPoolMax: 0,
  season: "spring",
  year: 1,
  plantedFarms: 0
};

function makeSnapshot(tick: number, events: readonly CombatEventSnapshot[]): WorldSnapshot {
  return {
    currentTick: tick,
    events,
    invalidMoveTarget: null,
    outcome: null,
    food: MOCK_FOOD,
    economy: MOCK_ECONOMY,
    map: { width: 128, height: 128, cells: [], decorations: [] },
    units: [],
    buildings: [],
    supplyRetreat: { active: false, remainingTicks: 0 }
  };
}

const MOCK_CAMERA: CameraState = { x: 0, y: 0, zoom: 1 };
const MOCK_ASSETS = new Map() as unknown as ReadonlyMap<string, never>;

// --- Tests ---

describe("EffectsLayer", () => {
  let layer: EffectsLayer;

  beforeEach(() => {
    layer = new EffectsLayer();
  });

  describe("triggerFromSnapshot — effect creation", () => {
    it("creates one arrow for a ranged attack from an archer", () => {
      const snapshot = makeSnapshot(1, [
        {
          kind: "attack_ranged",
          tick: 1,
          attackerId: "u1",
          attackerOwner: "player",
          unitType: "archer",
          attackerPos: { x: 5, y: 5 },
          targetId: "u2",
          targetBuildingId: null,
          targetPos: { x: 10, y: 10 },
          highGround: false
        }
      ]);

      layer.triggerFromSnapshot(snapshot, MOCK_CAMERA, MOCK_ASSETS);
      expect(layer.root.children).toHaveLength(1);
    });

    it("creates flash + smoke (2 effects) for a musketeer ranged attack", () => {
      const snapshot = makeSnapshot(1, [
        {
          kind: "attack_ranged",
          tick: 1,
          attackerId: "u1",
          attackerOwner: "enemy",
          unitType: "musketeer",
          attackerPos: { x: 5, y: 5 },
          targetId: "u2",
          targetBuildingId: null,
          targetPos: { x: 8, y: 5 },
          highGround: false
        }
      ]);

      layer.triggerFromSnapshot(snapshot, MOCK_CAMERA, MOCK_ASSETS);
      expect(layer.root.children).toHaveLength(2); // flash + smoke
    });

    it("creates one spark for a damage event paired with melee attack", () => {
      const snapshot = makeSnapshot(1, [
        {
          kind: "attack_melee",
          tick: 1,
          attackerId: "u1",
          attackerOwner: "enemy",
          unitType: "spear_ashigaru",
          attackerPos: { x: 5, y: 5 },
          targetId: "u2",
          targetBuildingId: null,
          targetPos: { x: 6, y: 5 },
          highGround: false
        },
        {
          kind: "damage",
          tick: 1,
          attackerId: "u1",
          targetId: "u2",
          targetBuildingId: null,
          targetPos: { x: 6, y: 5 },
          amount: 15
        }
      ]);

      layer.triggerFromSnapshot(snapshot, MOCK_CAMERA, MOCK_ASSETS);
      // melee attack itself has no visual; only the damage spark
      expect(layer.root.children).toHaveLength(1);
    });

    it("creates one puff for a building_destroyed event", () => {
      const snapshot = makeSnapshot(1, [
        {
          kind: "building_destroyed",
          tick: 1,
          buildingId: "b1",
          buildingType: "wall",
          owner: "player",
          position: { x: 5, y: 5 },
          footprint: [{ x: 5, y: 5 }, { x: 6, y: 5 }]
        }
      ]);

      layer.triggerFromSnapshot(snapshot, MOCK_CAMERA, MOCK_ASSETS);
      expect(layer.root.children).toHaveLength(1);
    });

    it("handles a combined snapshot with multiple event types", () => {
      // archer attack + damage + building destroyed = 1 arrow + 1 spark + 1 puff = 3
      const snapshot = makeSnapshot(1, [
        {
          kind: "attack_ranged",
          tick: 1,
          attackerId: "u1",
          attackerOwner: "player",
          unitType: "archer",
          attackerPos: { x: 5, y: 5 },
          targetId: "b1",
          targetBuildingId: "b1",
          targetPos: { x: 10, y: 10 },
          highGround: false
        },
        {
          kind: "damage",
          tick: 1,
          attackerId: "u1",
          targetId: null,
          targetBuildingId: "b1",
          targetPos: { x: 10, y: 10 },
          amount: 50
        },
        {
          kind: "building_destroyed",
          tick: 1,
          buildingId: "b1",
          buildingType: "wall",
          owner: "enemy",
          position: { x: 10, y: 10 },
          footprint: [{ x: 10, y: 10 }]
        }
      ]);

      layer.triggerFromSnapshot(snapshot, MOCK_CAMERA, MOCK_ASSETS);
      expect(layer.root.children).toHaveLength(3);
    });

    it("does not re-process the same tick (exactly-once delivery)", () => {
      const snapshot = makeSnapshot(1, [
        {
          kind: "building_destroyed",
          tick: 1,
          buildingId: "b1",
          buildingType: "wall",
          owner: "player",
          position: { x: 5, y: 5 },
          footprint: [{ x: 5, y: 5 }]
        }
      ]);

      layer.triggerFromSnapshot(snapshot, MOCK_CAMERA, MOCK_ASSETS);
      layer.triggerFromSnapshot(snapshot, MOCK_CAMERA, MOCK_ASSETS); // same tick again
      expect(layer.root.children).toHaveLength(1); // spawned only once
    });

    it("processes a later tick after an earlier one", () => {
      layer.triggerFromSnapshot(
        makeSnapshot(1, [
          {
            kind: "building_destroyed",
            tick: 1,
            buildingId: "b1",
            buildingType: "wall",
            owner: "player",
            position: { x: 5, y: 5 },
            footprint: [{ x: 5, y: 5 }]
          }
        ]),
        MOCK_CAMERA,
        MOCK_ASSETS
      );
      layer.triggerFromSnapshot(
        makeSnapshot(2, [
          {
            kind: "building_destroyed",
            tick: 2,
            buildingId: "b2",
            buildingType: "fence",
            owner: "player",
            position: { x: 6, y: 6 },
            footprint: [{ x: 6, y: 6 }]
          }
        ]),
        MOCK_CAMERA,
        MOCK_ASSETS
      );
      expect(layer.root.children).toHaveLength(2);
    });

    it("ignores snapshots with no events", () => {
      layer.triggerFromSnapshot(makeSnapshot(1, []), MOCK_CAMERA, MOCK_ASSETS);
      expect(layer.root.children).toHaveLength(0);
    });
  });

  describe("updateFrame — lifecycle", () => {
    it("keeps an effect alive while elapsed < duration", () => {
      layer.triggerFromSnapshot(
        makeSnapshot(1, [
          {
            kind: "attack_ranged",
            tick: 1,
            attackerId: "u1",
            attackerOwner: "player",
            unitType: "archer",
            attackerPos: { x: 5, y: 5 },
            targetId: "u2",
            targetBuildingId: null,
            targetPos: { x: 10, y: 10 },
            highGround: false
          }
        ]),
        MOCK_CAMERA,
        MOCK_ASSETS
      );
      layer.updateFrame(200); // arrow duration is 400ms — still alive at 200ms
      expect(layer.root.children).toHaveLength(1);
    });

    it("removes an effect once elapsed >= duration", () => {
      layer.triggerFromSnapshot(
        makeSnapshot(1, [
          {
            kind: "attack_ranged",
            tick: 1,
            attackerId: "u1",
            attackerOwner: "player",
            unitType: "archer",
            attackerPos: { x: 5, y: 5 },
            targetId: "u2",
            targetBuildingId: null,
            targetPos: { x: 10, y: 10 },
            highGround: false
          }
        ]),
        MOCK_CAMERA,
        MOCK_ASSETS
      );
      layer.updateFrame(401); // arrow duration is 400ms — expires at 401ms
      expect(layer.root.children).toHaveLength(0);
    });

    it("removes only the expired effects when durations differ", () => {
      // Musketeer: flash (200ms) + smoke (700ms)
      layer.triggerFromSnapshot(
        makeSnapshot(1, [
          {
            kind: "attack_ranged",
            tick: 1,
            attackerId: "u1",
            attackerOwner: "player",
            unitType: "musketeer",
            attackerPos: { x: 5, y: 5 },
            targetId: "u2",
            targetBuildingId: null,
            targetPos: { x: 8, y: 5 },
            highGround: false
          }
        ]),
        MOCK_CAMERA,
        MOCK_ASSETS
      );
      expect(layer.root.children).toHaveLength(2);

      layer.updateFrame(250); // past flash (200ms), before smoke (700ms)
      expect(layer.root.children).toHaveLength(1); // only smoke remains
    });
  });

  describe("clear", () => {
    it("removes all active effects and resets lastProcessedTick", () => {
      layer.triggerFromSnapshot(
        makeSnapshot(5, [
          {
            kind: "attack_ranged",
            tick: 5,
            attackerId: "u1",
            attackerOwner: "player",
            unitType: "archer",
            attackerPos: { x: 1, y: 1 },
            targetId: "u2",
            targetBuildingId: null,
            targetPos: { x: 5, y: 5 },
            highGround: false
          }
        ]),
        MOCK_CAMERA,
        MOCK_ASSETS
      );
      expect(layer.root.children).toHaveLength(1);

      layer.clear();
      expect(layer.root.children).toHaveLength(0);

      // After clear, the same tick should be processable again.
      layer.triggerFromSnapshot(
        makeSnapshot(5, [
          {
            kind: "building_destroyed",
            tick: 5,
            buildingId: "b1",
            buildingType: "wall",
            owner: "player",
            position: { x: 5, y: 5 },
            footprint: [{ x: 5, y: 5 }]
          }
        ]),
        MOCK_CAMERA,
        MOCK_ASSETS
      );
      expect(layer.root.children).toHaveLength(1);
    });
  });
});
