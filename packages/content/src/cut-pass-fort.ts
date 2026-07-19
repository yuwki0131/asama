import type { ContentScenarioDefinition } from "./index";
import { vLine } from "./scenario-parts";

/**
 * Cut-pass fort scenario — 切通しの土の砦.
 * A two-tier earthwork fort on natural rock (cliff skin, no ishigaki). Every
 * approach is a gentle 2-cell slope (length: 2) cut through the earth — the
 * slope2 dirt tiles are the visual centrepiece. Enemy waves are funnelled into
 * the south cutting (大手) and the narrow east cutting (搦手).
 *
 * Terrain: L1 x30..58 y82..102 / L2 x36..52 y86..96 (both natural rock faces).
 * Gentle slopes: 0→1 south (43..44,104→103)N / 0→1 east (60→59,90)W
 *                1→2 south (43..44,98→97)N / 1→2 east (54→53,91)W
 */
export const cutPassFortScenario: ContentScenarioDefinition = {
  id: "cut-pass-fort",
  name: "切通しの砦",
  description:
    "岩山を切り拓いた二段の土砦。石垣は持たず、切通しのなだらかな坂だけが上下を結ぶ。大手の切通しと搦手の細道、二筋の坂口を土塁の上から射すくめよ。",
  elevation: {
    patches: [
      { area: { kind: "rect", x: 30, y: 82, width: 29, height: 21 }, level: 1 },
      { area: { kind: "rect", x: 36, y: 86, width: 17, height: 11 }, level: 2 },
    ],
    slopes: [
      // 大手 0→1 (南の切通し、幅2のなだらか坂)
      { position: { x: 43, y: 104 }, toward: "N", width: 2, length: 2 },
      // 搦手 0→1 (東の細い切通し)
      { position: { x: 60, y: 90 }, toward: "W", length: 2 },
      // 大手 1→2 (幅2のなだらか坂)
      { position: { x: 43, y: 98 }, toward: "N", width: 2, length: 2 },
      // 搦手 1→2 (幅1のなだらか坂)
      { position: { x: 54, y: 91 }, toward: "W", length: 2 },
    ],
  },
  initialBuildings: [
    // === 本曲輪 (L2) ===
    { type: "tenshu", position: { x: 39, y: 88 } },
    { type: "honmaru", position: { x: 47, y: 87 } },
    { type: "storehouse", position: { x: 48, y: 90 } },
    // 大手虎口 — 1→2 坂の出口 (43,96)(44,96) を塞ぐ幅2の門。
    { type: "gate_wide_2", position: { x: 43, y: 96 } },
    // 搦手虎口 — 1→2 坂の出口 (52,91) を塞ぐ狭門 (中央 (52,91) のみ通行可)。
    { type: "gate_narrow_3_ne_sw", position: { x: 52, y: 90 } },
    { type: "yagura", position: { x: 36, y: 86 } },
    { type: "yagura", position: { x: 50, y: 94 } },

    // === 帯曲輪 (L1) ===
    { type: "barracks", position: { x: 31, y: 83 } },
    { type: "storehouse", position: { x: 31, y: 89 } },
    // 大手坂上の物見櫓と搦手側の物見櫓。
    { type: "yagura", position: { x: 46, y: 99 } },
    { type: "yagura", position: { x: 55, y: 88 } },

    // === 城下 (L0, 南麓) ===
    ...vLine("road", 44, 105, 112),
    { type: "town_block", position: { x: 47, y: 105 } },
    { type: "market", position: { x: 33, y: 105 } },
    { type: "samurai_residence", position: { x: 37, y: 109 } },
    { type: "farm", position: { x: 30, y: 113 } },
    { type: "farm", position: { x: 54, y: 105 } },

    // 敵の集結地 (南の街道口)
    { type: "gate_narrow_3", position: { x: 43, y: 116 }, owner: "enemy" },
  ],
  decorations: [
    // 切通しの岩肌を印象付ける岩と松。
    { assetId: "deco.rock.1", position: { x: 42, y: 104 } },
    { assetId: "deco.rock.1", position: { x: 45, y: 104 } },
    { assetId: "deco.rock.1", position: { x: 60, y: 88 } },
    { assetId: "deco.tree.pine.1", position: { x: 34, y: 97 } },
    { assetId: "deco.tree.pine.1", position: { x: 56, y: 84 } },
  ],
  initialUnits: [
    // 本曲輪 (L2) — 刀は本丸マーカー上。門裏の (43..44,95) は補給路のため空ける。
    { type: "sword_ashigaru", position: { x: 48, y: 88 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 47, y: 88 }, owner: "player" },
    { type: "archer", position: { x: 45, y: 94 }, owner: "player" },
    { type: "archer", position: { x: 46, y: 95 }, owner: "player" },
    { type: "archer", position: { x: 44, y: 94 }, owner: "player" },
    { type: "musketeer", position: { x: 47, y: 95 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 42, y: 95 }, owner: "player" },
    // 帯曲輪 (L1) — 大手坂の上とその左右。
    { type: "spear_ashigaru", position: { x: 43, y: 101 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 44, y: 101 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 45, y: 101 }, owner: "player" },
    { type: "archer", position: { x: 42, y: 102 }, owner: "player" },
    { type: "archer", position: { x: 45, y: 102 }, owner: "player" },
    { type: "archer", position: { x: 41, y: 102 }, owner: "player" },
    // 搦手 (L1 東縁) — 細道の受け。(58,90) の坂口セルは空けておく。
    { type: "spear_ashigaru", position: { x: 57, y: 90 }, owner: "player" },
    { type: "archer", position: { x: 56, y: 91 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 57, y: 91 }, owner: "player" },
    // 城下 (L0) — 遅滞戦闘要員。
    { type: "spear_ashigaru", position: { x: 44, y: 106 }, owner: "player" },
    { type: "archer", position: { x: 43, y: 106 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 45, y: 106 }, owner: "player" },

    // 敵の物見 (南の街道)。
    { type: "spear_ashigaru", position: { x: 46, y: 113 }, owner: "enemy" },
    { type: "archer", position: { x: 42, y: 114 }, owner: "enemy" },
    { type: "spear_ashigaru", position: { x: 44, y: 114 }, owner: "enemy" },
    { type: "archer", position: { x: 40, y: 113 }, owner: "enemy" },
  ],
  waves: [
    {
      // 第1波: 大手切通しへの前哨。
      tick: 3000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 42, y: 113 } },
        { type: "spear_ashigaru", position: { x: 46, y: 113 } },
        { type: "spear_ashigaru", position: { x: 44, y: 113 } },
        { type: "spear_ashigaru", position: { x: 40, y: 114 } },
        { type: "supply_cart", position: { x: 44, y: 117 } },
      ],
    },
    {
      // 第2波: 大手主力 + 搦手への偵察。
      tick: 7800,
      spawns: [
        { type: "spear_ashigaru", position: { x: 41, y: 113 } },
        { type: "spear_ashigaru", position: { x: 47, y: 113 } },
        { type: "archer", position: { x: 44, y: 115 } },
        { type: "spear_ashigaru", position: { x: 43, y: 113 } },
        { type: "sword_ashigaru", position: { x: 45, y: 113 } },
        { type: "archer", position: { x: 42, y: 115 } },
        { type: "supply_cart", position: { x: 44, y: 118 } },
        { type: "spear_ashigaru", position: { x: 66, y: 90 } },
        { type: "archer", position: { x: 68, y: 92 } },
      ],
    },
    {
      // 第3波: 二正面攻撃。搦手に騎兵、大手に工兵。
      tick: 12600,
      spawns: [
        { type: "sword_ashigaru", position: { x: 43, y: 113 } },
        { type: "sword_ashigaru", position: { x: 45, y: 113 } },
        { type: "engineer", position: { x: 43, y: 116 } },
        { type: "archer", position: { x: 42, y: 115 } },
        { type: "spear_ashigaru", position: { x: 41, y: 113 } },
        { type: "sword_ashigaru", position: { x: 47, y: 113 } },
        { type: "archer", position: { x: 46, y: 115 } },
        { type: "supply_cart", position: { x: 44, y: 119 } },
        { type: "cavalry", position: { x: 66, y: 89 } },
        { type: "spear_ashigaru", position: { x: 67, y: 92 } },
        { type: "supply_cart", position: { x: 69, y: 94 } },
      ],
    },
    {
      // 第4波: 総攻撃。鉄砲援護付きの大手強襲と搦手の同時圧力。
      tick: 17400,
      spawns: [
        { type: "sword_ashigaru", position: { x: 42, y: 113 } },
        { type: "sword_ashigaru", position: { x: 46, y: 113 } },
        { type: "spear_ashigaru", position: { x: 44, y: 113 } },
        { type: "musketeer", position: { x: 45, y: 116 } },
        { type: "archer", position: { x: 41, y: 115 } },
        { type: "archer", position: { x: 47, y: 115 } },
        { type: "spear_ashigaru", position: { x: 40, y: 113 } },
        { type: "sword_ashigaru", position: { x: 48, y: 113 } },
        { type: "archer", position: { x: 43, y: 115 } },
        { type: "supply_cart", position: { x: 44, y: 120 } },
        { type: "sword_ashigaru", position: { x: 66, y: 90 } },
        { type: "cavalry", position: { x: 67, y: 88 } },
        { type: "spear_ashigaru", position: { x: 68, y: 90 } },
        { type: "supply_cart", position: { x: 69, y: 92 } },
      ],
    },
  ],
  victory: {
    holdTicks: 24000,
  },
};
