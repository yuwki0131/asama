import type { BuildingType, UnitSnapshot, UnitType } from "@asama/shared";

export function unitTypeLabel(type: UnitType): string {
  switch (type) {
    case "spear_ashigaru":
      return "槍足軽";
    case "sword_ashigaru":
      return "刀足軽";
    case "archer":
      return "弓兵";
    case "engineer":
      return "工兵";
    case "musketeer":
      return "鉄砲兵";
    case "cavalry":
      return "騎兵";
    case "supply_cart":
      return "補給荷車";
  }
}

/** Converts a simulation tick count to a mm:ss display string. */
export function ticksToMmSs(ticks: number): string {
  const totalSeconds = Math.ceil(ticks / 20);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildingTypeLabel(type: BuildingType): string {
  const labels: Record<BuildingType, string> = {
    honmaru: "本丸",
    tenshu: "天守",
    yagura: "矢倉",
    wall: "石塀",
    fence: "木塀",
    gate_wide_2: "門(広2)",
    gate_wide_3: "門(広3 NW-SE)",
    gate_narrow_3: "門(狭3 NW-SE)",
    gate_wide_2_ne_sw: "門(広2 NE-SW)",
    gate_wide_3_ne_sw: "門(広3 NE-SW)",
    gate_narrow_3_ne_sw: "門(狭3 NE-SW)",
    dry_moat: "空堀",
    water_moat: "水堀",
    storehouse: "蔵",
    market: "市場",
    barracks: "兵舎",
    samurai_residence: "侍屋敷",
    town_block: "町区画",
    farm: "農地",
    road: "道",
    earth_bridge: "土橋",
    wood_bridge: "木橋",
  };
  return labels[type] ?? type;
}

export interface UnitTypeGroup {
  readonly type: UnitType;
  readonly label: string;
  readonly count: number;
  readonly totalHp: number;
  readonly maxTotalHp: number;
  readonly attackDamage: number;
  readonly attackRange: number;
}

export function aggregateSelectedUnits(units: readonly UnitSnapshot[]): readonly UnitTypeGroup[] {
  const groups = new Map<
    UnitType,
    { count: number; totalHp: number; maxTotalHp: number; attackDamage: number; attackRange: number }
  >();

  for (const unit of units) {
    const existing = groups.get(unit.type);
    if (existing !== undefined) {
      existing.count++;
      existing.totalHp += unit.hp;
      existing.maxTotalHp += unit.maxHp;
    } else {
      groups.set(unit.type, {
        count: 1,
        totalHp: unit.hp,
        maxTotalHp: unit.maxHp,
        attackDamage: unit.attackDamage,
        attackRange: unit.attackRange,
      });
    }
  }

  return [...groups.entries()].map(([type, data]) => ({
    type,
    label: unitTypeLabel(type),
    ...data,
  }));
}
