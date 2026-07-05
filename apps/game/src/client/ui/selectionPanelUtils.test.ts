import { describe, expect, it } from "vitest";
import type { UnitSnapshot } from "@asama/shared";
import { aggregateSelectedUnits, buildingTypeLabel, unitTypeLabel } from "./selectionPanelUtils";

function makeUnit(overrides: Partial<UnitSnapshot>): UnitSnapshot {
  return {
    id: "u1",
    owner: "player",
    type: "spear_ashigaru",
    position: { x: 0, y: 0 },
    destination: null,
    path: [],
    selected: true,
    hp: 100,
    maxHp: 100,
    attackDamage: 10,
    attackRange: 1,
    attackCooldownTicks: 20,
    attackCooldownRemaining: 0,
    targetId: null,
    assetId: "unit_spear",
    task: null,
    ...overrides,
  };
}

describe("unitTypeLabel", () => {
  it("returns Japanese labels for all unit types", () => {
    expect(unitTypeLabel("spear_ashigaru")).toBe("槍足軽");
    expect(unitTypeLabel("sword_ashigaru")).toBe("刀足軽");
    expect(unitTypeLabel("archer")).toBe("弓兵");
    expect(unitTypeLabel("engineer")).toBe("工兵");
  });
});

describe("buildingTypeLabel", () => {
  it("returns Japanese label for known building types", () => {
    expect(buildingTypeLabel("honmaru")).toBe("本丸");
    expect(buildingTypeLabel("storehouse")).toBe("蔵");
    expect(buildingTypeLabel("gate_wide_3")).toBe("門(広3 NW-SE)");
  });
});

describe("aggregateSelectedUnits", () => {
  it("returns empty array for no units", () => {
    expect(aggregateSelectedUnits([])).toEqual([]);
  });

  it("groups a single unit correctly", () => {
    const unit = makeUnit({ type: "archer", hp: 80, maxHp: 100, attackDamage: 15, attackRange: 3 });
    const groups = aggregateSelectedUnits([unit]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.type).toBe("archer");
    expect(groups[0]?.count).toBe(1);
    expect(groups[0]?.totalHp).toBe(80);
    expect(groups[0]?.maxTotalHp).toBe(100);
    expect(groups[0]?.attackDamage).toBe(15);
    expect(groups[0]?.attackRange).toBe(3);
  });

  it("aggregates multiple units of the same type", () => {
    const units = [
      makeUnit({ id: "u1", type: "spear_ashigaru", hp: 100, maxHp: 100 }),
      makeUnit({ id: "u2", type: "spear_ashigaru", hp: 60, maxHp: 100 }),
      makeUnit({ id: "u3", type: "spear_ashigaru", hp: 40, maxHp: 100 }),
    ];
    const groups = aggregateSelectedUnits(units);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(3);
    expect(groups[0]?.totalHp).toBe(200);
    expect(groups[0]?.maxTotalHp).toBe(300);
  });

  it("produces separate groups for different unit types", () => {
    const units = [
      makeUnit({ id: "u1", type: "spear_ashigaru" }),
      makeUnit({ id: "u2", type: "archer", attackRange: 3, attackDamage: 15 }),
      makeUnit({ id: "u3", type: "spear_ashigaru" }),
    ];
    const groups = aggregateSelectedUnits(units);
    expect(groups).toHaveLength(2);
    const spear = groups.find((g) => g.type === "spear_ashigaru");
    const archer = groups.find((g) => g.type === "archer");
    expect(spear?.count).toBe(2);
    expect(archer?.count).toBe(1);
  });

  it("uses stats from the first unit of each type", () => {
    const units = [
      makeUnit({ id: "u1", type: "archer", attackDamage: 15, attackRange: 3 }),
      makeUnit({ id: "u2", type: "archer", attackDamage: 20, attackRange: 4 }),
    ];
    const groups = aggregateSelectedUnits(units);
    expect(groups[0]?.attackDamage).toBe(15);
    expect(groups[0]?.attackRange).toBe(3);
  });
});
