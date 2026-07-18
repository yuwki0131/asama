import type { ContentScenarioDefinition } from "./index";
import { vLine } from "./scenario-parts";

/**
 * Five-tier keep scenario — 五段石垣の平山城.
 * Uses the full 0..5 elevation range: five stacked ishigaki terraces with the
 * tenshu on the summit (L5). All approach ramps zigzag up the south face so
 * the fixed isometric camera reads the whole h1..h5 stone wall stack, and the
 * high-ground bonus (+1 range / x1.25 damage) compounds tier over tier.
 *
 * Terraces: L1 x40..75 y48..82 / L2 x43..72 y48..76 / L3 x46..69 y48..71 /
 *           L4 x49..66 y51..66 / L5 x52..63 y54..62.
 * Slopes (south face switchback):
 *   0→1 (57..58,83)→N  1→2 (49..50,77)→N  2→3 (64..65,72)→N
 *   3→4 (53,67)→N      4→5 (58,63)→N (幅1の虎口)
 */
export const fiveTierKeepScenario: ContentScenarioDefinition = {
  id: "five-tier-keep",
  name: "五段積の城",
  description:
    "五段の石垣を積み上げた平山城。頂の天守へは南面を九十九折に登る坂しか道はない。段を追われるたび一段上から矢を浴びせ、最上段の虎口で敵を止めよ。",
  elevation: {
    patches: [
      { area: { kind: "rect", x: 40, y: 48, width: 36, height: 35 }, level: 1, skin: "ishigaki" },
      { area: { kind: "rect", x: 43, y: 48, width: 30, height: 29 }, level: 2, skin: "ishigaki" },
      { area: { kind: "rect", x: 46, y: 48, width: 24, height: 24 }, level: 3, skin: "ishigaki" },
      { area: { kind: "rect", x: 49, y: 51, width: 18, height: 16 }, level: 4, skin: "ishigaki" },
      { area: { kind: "rect", x: 52, y: 54, width: 12, height: 9 }, level: 5, skin: "ishigaki" },
    ],
    slopes: [
      // 大手 0→1 (幅2)
      { position: { x: 57, y: 83 }, toward: "N", width: 2 },
      // 1→2 (西へ振る幅2の坂)
      { position: { x: 49, y: 77 }, toward: "N", width: 2 },
      // 2→3 (東へ折り返す幅2の坂)
      { position: { x: 64, y: 72 }, toward: "N", width: 2 },
      // 3→4 (幅1)
      { position: { x: 53, y: 67 }, toward: "N" },
      // 4→5 虎口 (幅1・最後の防衛チョーク)
      { position: { x: 58, y: 63 }, toward: "N" },
    ],
  },
  initialBuildings: [
    // === L5 頂上 — 天守・本丸・詰の蔵・虎口門 ===
    { type: "tenshu", position: { x: 52, y: 54 } },
    { type: "honmaru", position: { x: 61, y: 56 } },
    { type: "storehouse", position: { x: 60, y: 59 } },
    // 虎口狭門 — 4→5 坂の坂下 (L4 側) を塞ぐ。中央 (58,64) のみ通行可。
    // (坂上の L5 南縁は幅1の回廊のため、3マス門は坂下に置く)
    { type: "gate_narrow_3", position: { x: 57, y: 64 } },

    // === L4 — 中段の狭門と隅櫓 ===
    { type: "gate_narrow_3", position: { x: 52, y: 66 } },
    { type: "yagura", position: { x: 60, y: 64 } },
    { type: "yagura", position: { x: 54, y: 64 } },

    // === L3 — 兵舎と西縁の櫓 ===
    { type: "barracks", position: { x: 56, y: 68 } },
    { type: "yagura", position: { x: 46, y: 58 } },

    // === L2 — 補給蔵と南東の櫓 ===
    { type: "storehouse", position: { x: 43, y: 73 } },
    { type: "yagura", position: { x: 67, y: 73 } },

    // === L1 — 市場と大手坂上の櫓 ===
    { type: "market", position: { x: 54, y: 79 } },
    { type: "yagura", position: { x: 44, y: 78 } },
    { type: "yagura", position: { x: 60, y: 78 } },

    // === 城下 (L0, 南麓) ===
    ...vLine("road", 57, 84, 97),
    { type: "town_block", position: { x: 48, y: 86 } },
    { type: "town_block", position: { x: 60, y: 86 } },
    { type: "samurai_residence", position: { x: 48, y: 93 } },
    { type: "farm", position: { x: 60, y: 93 } },
    { type: "farm", position: { x: 65, y: 93 } },

    // 敵の集結地 (南の街道口)
    { type: "gate_narrow_3", position: { x: 56, y: 105 }, owner: "enemy" },
  ],
  initialUnits: [
    // L5 — 本丸詰め。刀は本丸マーカー上。
    { type: "sword_ashigaru", position: { x: 61, y: 56 }, owner: "player" },
    { type: "archer", position: { x: 55, y: 61 }, owner: "player" },
    { type: "archer", position: { x: 56, y: 61 }, owner: "player" },
    { type: "archer", position: { x: 59, y: 61 }, owner: "player" },
    // L4 — 虎口狭門 (57..59,64) の後詰め。(58,63..66) の補給路セルは空けておく。
    { type: "spear_ashigaru", position: { x: 57, y: 65 }, owner: "player" },
    { type: "archer", position: { x: 59, y: 65 }, owner: "player" },
    // L3 — 3→4 坂の側衛と南縁の射撃線。(53,66..68) は補給路のため空ける。
    { type: "spear_ashigaru", position: { x: 52, y: 68 }, owner: "player" },
    { type: "archer", position: { x: 56, y: 71 }, owner: "player" },
    { type: "archer", position: { x: 58, y: 71 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 63, y: 71 }, owner: "player" },
    // L2 — 2→3 坂下の受けと鉄砲。
    { type: "musketeer", position: { x: 52, y: 74 }, owner: "player" },
    { type: "archer", position: { x: 48, y: 74 }, owner: "player" },
    // L1 — 大手坂上と 1→2 坂の守り。(49..50,77..78) の坂口は片側を空ける。
    { type: "spear_ashigaru", position: { x: 51, y: 78 }, owner: "player" },
    { type: "archer", position: { x: 52, y: 79 }, owner: "player" },
    { type: "archer", position: { x: 59, y: 82 }, owner: "player" },
    // 城下 (L0) — 遅滞戦闘要員。
    { type: "spear_ashigaru", position: { x: 56, y: 97 }, owner: "player" },
    { type: "archer", position: { x: 58, y: 97 }, owner: "player" },

    // 敵の物見。
    { type: "spear_ashigaru", position: { x: 55, y: 100 }, owner: "enemy" },
    { type: "archer", position: { x: 59, y: 101 }, owner: "enemy" },
  ],
  waves: [
    {
      // 第1波: 大手前哨。槍のみ+荷車。
      tick: 3000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 54, y: 103 } },
        { type: "spear_ashigaru", position: { x: 60, y: 103 } },
        { type: "supply_cart", position: { x: 57, y: 107 } },
      ],
    },
    {
      // 第2波: 大手主力。弓の援護付き。
      tick: 7800,
      spawns: [
        { type: "spear_ashigaru", position: { x: 53, y: 103 } },
        { type: "spear_ashigaru", position: { x: 61, y: 103 } },
        { type: "sword_ashigaru", position: { x: 57, y: 103 } },
        { type: "archer", position: { x: 55, y: 105 } },
        { type: "archer", position: { x: 59, y: 105 } },
        { type: "supply_cart", position: { x: 57, y: 108 } },
      ],
    },
    {
      // 第3波: 攻城部隊。工兵と騎兵が加わる。
      tick: 12600,
      spawns: [
        { type: "sword_ashigaru", position: { x: 54, y: 103 } },
        { type: "sword_ashigaru", position: { x: 60, y: 103 } },
        { type: "spear_ashigaru", position: { x: 57, y: 103 } },
        { type: "engineer", position: { x: 55, y: 106 } },
        { type: "archer", position: { x: 57, y: 106 } },
        { type: "cavalry", position: { x: 52, y: 104 } },
        { type: "supply_cart", position: { x: 57, y: 109 } },
      ],
    },
    {
      // 第4波: 総攻撃。鉄砲の援護と荷車2台。
      tick: 17400,
      spawns: [
        { type: "sword_ashigaru", position: { x: 53, y: 103 } },
        { type: "sword_ashigaru", position: { x: 61, y: 103 } },
        { type: "spear_ashigaru", position: { x: 55, y: 103 } },
        { type: "spear_ashigaru", position: { x: 59, y: 103 } },
        { type: "archer", position: { x: 54, y: 105 } },
        { type: "archer", position: { x: 60, y: 105 } },
        { type: "musketeer", position: { x: 57, y: 107 } },
        { type: "engineer", position: { x: 59, y: 106 } },
        { type: "cavalry", position: { x: 62, y: 104 } },
        { type: "supply_cart", position: { x: 56, y: 110 } },
        { type: "supply_cart", position: { x: 58, y: 110 } },
      ],
    },
  ],
  victory: {
    holdTicks: 24000,
  },
};
