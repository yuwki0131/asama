import type { ContentScenarioDefinition } from "./index";
import { hLine, ring, vLine } from "./scenario-parts";

/**
 * Castle-town gate scenario — 大手筋の城下攻防戦.
 * A flat jokamachi map built around one straight 3-cell-wide main street
 * (大手筋) running from the sōgamae outer gate through the dense town to the
 * castle's gate_wide_3. Eight town blocks (auto v2..v5 variants) line the
 * street; the enemy column has to grind up the street while archers pick at
 * it from the flanking alleys. Late waves send cavalry around the fence ends.
 */
export const castleTownGateScenario: ContentScenarioDefinition = {
  id: "castle-town-gate",
  name: "大手筋の城下",
  description:
    "惣構の大手門から本城の三間門まで、一筋の大手筋が城下町を貫く平城。町屋の狭間で敵の縦列を削り、門前で受け止めよ。柵の切れ目を回り込む騎馬に用心せよ。",
  initialBuildings: [
    // === 本城 — 壁リング x40..60, y50..64 (南門 gate_wide_3 @49..51) ===
    ...ring("wall", 40, 50, 60, 64, ["49,64", "50,64", "51,64"]),
    { type: "gate_wide_3", position: { x: 49, y: 64 } },
    { type: "tenshu", position: { x: 43, y: 54 } },
    { type: "honmaru", position: { x: 55, y: 55 } },
    { type: "storehouse", position: { x: 53, y: 58 } },
    { type: "storehouse", position: { x: 56, y: 51 } },
    { type: "barracks", position: { x: 42, y: 60 } },
    { type: "yagura", position: { x: 41, y: 51 } },
    { type: "yagura", position: { x: 57, y: 61 } },

    // === 大手筋 — 三列の目抜き通り (城門から惣構門まで) ===
    ...vLine("road", 49, 65, 99),
    ...vLine("road", 50, 65, 99),
    ...vLine("road", 51, 65, 99),
    ...hLine("road", 42, 48, 79),
    ...hLine("road", 52, 58, 79),
    ...vLine("road", 50, 101, 106),

    // === 城下町 — 大手筋の東西に町区画8面 ===
    { type: "town_block", position: { x: 42, y: 66 } },
    { type: "town_block", position: { x: 53, y: 66 } },
    { type: "town_block", position: { x: 42, y: 73 } },
    { type: "town_block", position: { x: 53, y: 73 } },
    { type: "town_block", position: { x: 42, y: 80 } },
    { type: "town_block", position: { x: 53, y: 80 } },
    { type: "town_block", position: { x: 42, y: 87 } },
    { type: "town_block", position: { x: 53, y: 87 } },
    { type: "market", position: { x: 42, y: 94 } },
    { type: "samurai_residence", position: { x: 55, y: 94 } },

    // === 農地 (町の外縁) ===
    { type: "farm", position: { x: 36, y: 66 } },
    { type: "farm", position: { x: 36, y: 72 } },
    { type: "farm", position: { x: 61, y: 66 } },
    { type: "farm", position: { x: 61, y: 72 } },

    // === 惣構 — 南端の柵列 y=100 (大手門 gate_wide_3 @49..51) ===
    ...hLine("fence", 36, 64, 100, [49, 50, 51]),
    { type: "gate_wide_3", position: { x: 49, y: 100 } },
    { type: "yagura", position: { x: 46, y: 97 } },
    { type: "yagura", position: { x: 52, y: 97 } },

    // 敵の集結地 (南の街道口)
    { type: "gate", position: { x: 50, y: 110 }, owner: "enemy" },
  ],
  initialUnits: [
    // 本城 — 刀は本丸マーカー上。城門裏に槍と弓。
    { type: "sword_ashigaru", position: { x: 55, y: 55 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 50, y: 63 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 49, y: 62 }, owner: "player" },
    { type: "archer", position: { x: 50, y: 61 }, owner: "player" },
    { type: "archer", position: { x: 51, y: 62 }, owner: "player" },
    // 惣構大手門の門番と大手筋の射撃線。
    { type: "spear_ashigaru", position: { x: 50, y: 98 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 48, y: 98 }, owner: "player" },
    { type: "archer", position: { x: 49, y: 97 }, owner: "player" },
    { type: "archer", position: { x: 51, y: 97 }, owner: "player" },
    { type: "musketeer", position: { x: 50, y: 95 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 50, y: 93 }, owner: "player" },

    // 敵の物見 (街道)。
    { type: "spear_ashigaru", position: { x: 48, y: 104 }, owner: "enemy" },
    { type: "archer", position: { x: 52, y: 105 }, owner: "enemy" },
  ],
  waves: [
    {
      // 第1波: 大手門への前哨。
      tick: 2700,
      spawns: [
        { type: "spear_ashigaru", position: { x: 48, y: 106 } },
        { type: "spear_ashigaru", position: { x: 52, y: 106 } },
        { type: "supply_cart", position: { x: 50, y: 109 } },
      ],
    },
    {
      // 第2波: 大手筋を押し上る主力縦列。
      tick: 7200,
      spawns: [
        { type: "spear_ashigaru", position: { x: 47, y: 106 } },
        { type: "spear_ashigaru", position: { x: 53, y: 106 } },
        { type: "sword_ashigaru", position: { x: 50, y: 106 } },
        { type: "archer", position: { x: 48, y: 108 } },
        { type: "archer", position: { x: 52, y: 108 } },
        { type: "supply_cart", position: { x: 50, y: 111 } },
      ],
    },
    {
      // 第3波: 正面継続 + 柵の切れ目を突く騎馬の左右迂回。
      tick: 12000,
      spawns: [
        { type: "sword_ashigaru", position: { x: 48, y: 106 } },
        { type: "sword_ashigaru", position: { x: 52, y: 106 } },
        { type: "spear_ashigaru", position: { x: 50, y: 106 } },
        { type: "engineer", position: { x: 50, y: 108 } },
        { type: "archer", position: { x: 49, y: 108 } },
        { type: "supply_cart", position: { x: 50, y: 112 } },
        { type: "cavalry", position: { x: 32, y: 104 } },
        { type: "cavalry", position: { x: 66, y: 104 } },
      ],
    },
    {
      // 第4波: 総攻撃。正面の鉄砲援護と両翼の騎馬、荷車2台。
      tick: 16800,
      spawns: [
        { type: "sword_ashigaru", position: { x: 47, y: 106 } },
        { type: "sword_ashigaru", position: { x: 53, y: 106 } },
        { type: "spear_ashigaru", position: { x: 49, y: 106 } },
        { type: "spear_ashigaru", position: { x: 51, y: 106 } },
        { type: "archer", position: { x: 47, y: 108 } },
        { type: "archer", position: { x: 53, y: 108 } },
        { type: "musketeer", position: { x: 50, y: 109 } },
        { type: "engineer", position: { x: 48, y: 109 } },
        { type: "cavalry", position: { x: 33, y: 104 } },
        { type: "cavalry", position: { x: 67, y: 104 } },
        { type: "supply_cart", position: { x: 50, y: 113 } },
        { type: "supply_cart", position: { x: 66, y: 106 } },
      ],
    },
  ],
  victory: {
    holdTicks: 24000,
  },
};
