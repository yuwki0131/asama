import type { ContentScenarioDefinition } from "./index";
import { hLine, vLine } from "./scenario-parts";

/**
 * Stepped fortress scenario — 東向き三段連郭の城.
 * Three walled kuruwa (L1..L3, all ishigaki) strung east-to-west in a renkaku
 * plan: the enemy pushes in from the eastern plain, and every terrace lost
 * pulls the defence back one step higher. Each tier's only entrance is a
 * west-facing slope guarded by a gate (ne_sw variants — the doors face east).
 *
 * Terraces: L1 x24..70 y52..70 / L2 x24..54 y54..68 / L3 x24..38 y56..66.
 * Slopes (all toward W, positions are the low-side cells):
 *   0→1 (71,60..62) w3   1→2 (55,60..61) w2   2→3 (39,61) w1
 */
export const steppedFortressScenario: ContentScenarioDefinition = {
  id: "stepped-fortress",
  name: "段郭の城",
  description:
    "三つの曲輪を東へ段々に連ねた連郭の城。曲輪を一つ破られるたび、戦線は一段高い石垣へ退く。三の丸、二の丸、そして本丸——退くたびに狭まる坂口で、敵の勢いを削ぎ落とせ。",
  elevation: {
    patches: [
      { area: { kind: "rect", x: 24, y: 52, width: 47, height: 19 }, level: 1, skin: "ishigaki" },
      { area: { kind: "rect", x: 24, y: 54, width: 31, height: 15 }, level: 2, skin: "ishigaki" },
      { area: { kind: "rect", x: 24, y: 56, width: 15, height: 11 }, level: 3, skin: "ishigaki" },
    ],
    slopes: [
      // 三の丸大手 0→1 (幅3)
      { position: { x: 71, y: 60 }, toward: "W", width: 3 },
      // 二の丸 1→2 (幅2)
      { position: { x: 55, y: 60 }, toward: "W", width: 2 },
      // 本丸 2→3 (幅1の虎口)
      { position: { x: 39, y: 61 }, toward: "W" },
    ],
  },
  initialBuildings: [
    // === 本丸 (L3) ===
    { type: "tenshu", position: { x: 26, y: 58 } },
    { type: "honmaru", position: { x: 35, y: 58 } },
    { type: "storehouse", position: { x: 33, y: 62 } },
    { type: "gate_ne_sw", position: { x: 38, y: 61 } },
    { type: "yagura", position: { x: 36, y: 64 } },

    // === 二の丸 (L2) ===
    { type: "barracks", position: { x: 44, y: 55 } },
    { type: "storehouse", position: { x: 50, y: 55 } },
    { type: "gate_wide_2_ne_sw", position: { x: 54, y: 60 } },
    { type: "yagura", position: { x: 52, y: 63 } },
    { type: "yagura", position: { x: 41, y: 64 } },

    // === 三の丸 (L1) ===
    { type: "samurai_residence", position: { x: 58, y: 53 } },
    { type: "market", position: { x: 58, y: 64 } },
    { type: "gate_wide_3_ne_sw", position: { x: 70, y: 60 } },
    { type: "yagura", position: { x: 67, y: 55 } },
    { type: "yagura", position: { x: 67, y: 65 } },

    // === 東麓 (L0) — 大手道と町 ===
    ...hLine("road", 72, 76, 61),
    ...vLine("road", 74, 62, 72),
    { type: "town_block", position: { x: 44, y: 75 } },
    { type: "town_block", position: { x: 56, y: 74 } },
    { type: "farm", position: { x: 36, y: 74 } },
    { type: "farm", position: { x: 64, y: 82 } },

    // 敵の集結地 (南東の街道口)
    { type: "gate", position: { x: 75, y: 95 }, owner: "enemy" },
  ],
  initialUnits: [
    // 本丸 (L3) — 刀は本丸マーカー上。虎口裏 (37..39,61) は補給路のため空ける。
    { type: "sword_ashigaru", position: { x: 35, y: 58 }, owner: "player" },
    { type: "archer", position: { x: 36, y: 60 }, owner: "player" },
    { type: "archer", position: { x: 37, y: 63 }, owner: "player" },
    // 二の丸 (L2) — 東門裏の槍衾と射撃線。門セル (54,60..61) は空ける。
    { type: "spear_ashigaru", position: { x: 53, y: 60 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 53, y: 61 }, owner: "player" },
    { type: "archer", position: { x: 50, y: 59 }, owner: "player" },
    { type: "archer", position: { x: 48, y: 60 }, owner: "player" },
    { type: "musketeer", position: { x: 46, y: 59 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 40, y: 60 }, owner: "player" },
    // 三の丸 (L1) — 大手門裏の受け。門セル (70,60..62) は空ける。
    { type: "spear_ashigaru", position: { x: 69, y: 60 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 69, y: 62 }, owner: "player" },
    { type: "archer", position: { x: 68, y: 61 }, owner: "player" },
    { type: "archer", position: { x: 66, y: 59 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 66, y: 63 }, owner: "player" },

    // 敵の物見 (東の街道)。
    { type: "spear_ashigaru", position: { x: 74, y: 88 }, owner: "enemy" },
    { type: "archer", position: { x: 76, y: 91 }, owner: "enemy" },
  ],
  waves: [
    {
      // 第1波: 東街道の前哨。
      tick: 3000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 74, y: 92 } },
        { type: "spear_ashigaru", position: { x: 76, y: 93 } },
        { type: "supply_cart", position: { x: 75, y: 98 } },
      ],
    },
    {
      // 第2波: 大手筋の主力。弓の援護付き。
      tick: 7800,
      spawns: [
        { type: "spear_ashigaru", position: { x: 73, y: 92 } },
        { type: "spear_ashigaru", position: { x: 77, y: 92 } },
        { type: "sword_ashigaru", position: { x: 75, y: 92 } },
        { type: "archer", position: { x: 74, y: 94 } },
        { type: "archer", position: { x: 76, y: 94 } },
        { type: "supply_cart", position: { x: 75, y: 99 } },
      ],
    },
    {
      // 第3波: 攻城部隊。工兵と南回りの騎兵。
      tick: 12600,
      spawns: [
        { type: "sword_ashigaru", position: { x: 74, y: 92 } },
        { type: "sword_ashigaru", position: { x: 76, y: 92 } },
        { type: "spear_ashigaru", position: { x: 75, y: 93 } },
        { type: "engineer", position: { x: 74, y: 96 } },
        { type: "archer", position: { x: 76, y: 96 } },
        { type: "cavalry", position: { x: 66, y: 90 } },
        { type: "supply_cart", position: { x: 75, y: 100 } },
      ],
    },
    {
      // 第4波: 総攻撃。鉄砲援護と両翼の騎馬、荷車2台。
      tick: 17400,
      spawns: [
        { type: "sword_ashigaru", position: { x: 73, y: 92 } },
        { type: "sword_ashigaru", position: { x: 77, y: 92 } },
        { type: "spear_ashigaru", position: { x: 74, y: 93 } },
        { type: "spear_ashigaru", position: { x: 76, y: 93 } },
        { type: "archer", position: { x: 73, y: 95 } },
        { type: "archer", position: { x: 77, y: 95 } },
        { type: "musketeer", position: { x: 75, y: 96 } },
        { type: "engineer", position: { x: 74, y: 97 } },
        { type: "cavalry", position: { x: 64, y: 90 } },
        { type: "cavalry", position: { x: 68, y: 92 } },
        { type: "supply_cart", position: { x: 74, y: 100 } },
        { type: "supply_cart", position: { x: 76, y: 100 } },
      ],
    },
  ],
  victory: {
    holdTicks: 24000,
  },
};
