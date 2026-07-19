import type { ContentScenarioDefinition } from "./index";
import { hLine, ring, vLine } from "./scenario-parts";

/**
 * Water castle scenario — 二重水堀の平城.
 * Two concentric water-moat rings around a walled core. Five bridges are the
 * only crossings; each ring the enemy breaches funnels them toward the next
 * bridge, so bridgehead control decides the battle. Engineers in later waves
 * threaten to fill/break the chokepoints.
 *
 * Layout:
 *   core wall ring x34..46, y58..70 (south gate_wide_3 at x39..41)
 *   inner moat ring x32..48, y56..72 (bridges N (40,56) wood / S (40,72) earth)
 *   outer moat ring x28..52, y52..76 (bridges S (40,76) earth / W (28,64) wood / E (52,64) wood)
 *   castle town on the south road (y78+)
 */
export const waterCastleScenario: ContentScenarioDefinition = {
  id: "water-castle",
  name: "浮城",
  description:
    "二重の水堀に浮かぶ平城。渡れる橋は五つのみ——外堀の橋頭を守り、破られれば内堀の橋で受け止める。工兵の橋落としと堀埋めが勝敗を分かつ。",
  initialBuildings: [
    // === 本丸 — 壁リング x34..46, y58..70 (南門 gate_wide_3 @39..41) ===
    ...ring("wall", 34, 58, 46, 70, ["39,70", "40,70", "41,70"]),
    { type: "gate_wide_3", position: { x: 39, y: 70 } },
    { type: "tenshu", position: { x: 36, y: 60 } },
    { type: "honmaru", position: { x: 43, y: 59 } },
    { type: "storehouse", position: { x: 43, y: 63 } },
    { type: "storehouse", position: { x: 35, y: 66 } },

    // === 内堀リング x32..48, y56..72 (北橋・南橋) ===
    ...ring("water_moat", 32, 56, 48, 72, ["40,56", "40,72"]),
    { type: "wood_bridge", position: { x: 40, y: 56 } },
    { type: "earth_bridge", position: { x: 40, y: 72 } },

    // === 外堀リング x28..52, y52..76 (南橋・西橋・東橋) ===
    ...ring("water_moat", 28, 52, 52, 76, ["40,76", "28,64", "52,64"]),
    { type: "earth_bridge", position: { x: 40, y: 76 } },
    { type: "wood_bridge", position: { x: 28, y: 64 } },
    { type: "wood_bridge", position: { x: 52, y: 64 } },

    // === 堀間の帯曲輪 — 四隅の櫓 ===
    { type: "yagura", position: { x: 29, y: 53 } },
    { type: "yagura", position: { x: 49, y: 53 } },
    { type: "yagura", position: { x: 29, y: 73 } },
    { type: "yagura", position: { x: 49, y: 73 } },

    // === 城下 — 南の大手道と町 ===
    ...vLine("road", 40, 78, 96),
    ...hLine("road", 37, 39, 82),
    ...hLine("road", 41, 42, 82),
    { type: "town_block", position: { x: 31, y: 80 } },
    { type: "town_block", position: { x: 43, y: 80 } },
    { type: "market", position: { x: 31, y: 88 } },
    { type: "samurai_residence", position: { x: 44, y: 88 } },
    { type: "farm", position: { x: 33, y: 93 } },
    { type: "farm", position: { x: 44, y: 93 } },

    // 敵の集結地 (南の街道口)
    { type: "gate_narrow_3", position: { x: 39, y: 104 }, owner: "enemy" },
  ],
  initialUnits: [
    // 本丸 — 刀足軽は本丸マーカー上 (在城中は敵の占拠が成立しない)
    { type: "sword_ashigaru", position: { x: 44, y: 60 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 44, y: 61 }, owner: "player" },
    // 東列 x42 は西蔵への補給路のため空け、射手は南東隅に置く。
    { type: "archer", position: { x: 45, y: 66 }, owner: "player" },
    { type: "archer", position: { x: 45, y: 68 }, owner: "player" },
    { type: "archer", position: { x: 44, y: 66 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 40, y: 68 }, owner: "player" },
    // 内堀南橋の橋頭守備 (堀間の帯曲輪)
    { type: "archer", position: { x: 39, y: 74 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 41, y: 74 }, owner: "player" },
    { type: "archer", position: { x: 38, y: 74 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 42, y: 74 }, owner: "player" },
    // 外堀東橋の橋頭守備
    { type: "archer", position: { x: 50, y: 63 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 50, y: 65 }, owner: "player" },
    { type: "archer", position: { x: 50, y: 62 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 50, y: 66 }, owner: "player" },

    // 敵の物見 (東岸)
    { type: "spear_ashigaru", position: { x: 58, y: 64 }, owner: "enemy" },
    { type: "archer", position: { x: 60, y: 68 }, owner: "enemy" },
    { type: "spear_ashigaru", position: { x: 58, y: 68 }, owner: "enemy" },
    { type: "archer", position: { x: 60, y: 64 }, owner: "enemy" },
  ],
  waves: [
    {
      // 第1波: 南からの前哨。橋のチョークポイントを見せる導入波。
      tick: 3000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 38, y: 102 } },
        { type: "spear_ashigaru", position: { x: 42, y: 102 } },
        { type: "spear_ashigaru", position: { x: 40, y: 102 } },
        { type: "spear_ashigaru", position: { x: 36, y: 102 } },
        { type: "supply_cart", position: { x: 40, y: 106 } },
      ],
    },
    {
      // 第2波: 南主力。弓が橋頭の守備を削りにくる。
      tick: 7800,
      spawns: [
        { type: "spear_ashigaru", position: { x: 37, y: 102 } },
        { type: "spear_ashigaru", position: { x: 43, y: 102 } },
        { type: "archer", position: { x: 38, y: 105 } },
        { type: "archer", position: { x: 42, y: 105 } },
        { type: "spear_ashigaru", position: { x: 39, y: 102 } },
        { type: "sword_ashigaru", position: { x: 41, y: 102 } },
        { type: "archer", position: { x: 40, y: 105 } },
        { type: "supply_cart", position: { x: 40, y: 108 } },
      ],
    },
    {
      // 第3波: 東橋への側面攻撃 + 南の工兵 (堀埋め・橋落とし)。
      tick: 12600,
      spawns: [
        { type: "spear_ashigaru", position: { x: 60, y: 62 } },
        { type: "sword_ashigaru", position: { x: 60, y: 66 } },
        { type: "archer", position: { x: 62, y: 64 } },
        { type: "archer", position: { x: 62, y: 62 } },
        { type: "supply_cart", position: { x: 64, y: 64 } },
        { type: "sword_ashigaru", position: { x: 40, y: 102 } },
        { type: "engineer", position: { x: 38, y: 104 } },
        { type: "spear_ashigaru", position: { x: 42, y: 103 } },
        { type: "sword_ashigaru", position: { x: 38, y: 103 } },
        { type: "supply_cart", position: { x: 40, y: 107 } },
      ],
    },
    {
      // 第4波: 総攻撃。南北二方向 + 騎兵の東迂回。
      tick: 17400,
      spawns: [
        { type: "spear_ashigaru", position: { x: 37, y: 103 } },
        { type: "spear_ashigaru", position: { x: 43, y: 103 } },
        { type: "sword_ashigaru", position: { x: 40, y: 103 } },
        { type: "musketeer", position: { x: 40, y: 105 } },
        { type: "engineer", position: { x: 42, y: 104 } },
        { type: "spear_ashigaru", position: { x: 39, y: 103 } },
        { type: "sword_ashigaru", position: { x: 41, y: 103 } },
        { type: "archer", position: { x: 38, y: 105 } },
        { type: "supply_cart", position: { x: 39, y: 108 } },
        { type: "cavalry", position: { x: 60, y: 64 } },
        { type: "spear_ashigaru", position: { x: 61, y: 66 } },
        { type: "cavalry", position: { x: 62, y: 65 } },
        { type: "supply_cart", position: { x: 64, y: 66 } },
      ],
    },
  ],
  victory: {
    holdTicks: 24000,
  },
};
