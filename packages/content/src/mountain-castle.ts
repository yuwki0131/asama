import type { ContentScenarioDefinition } from "./index";

/**
 * Mountain castle scenario (docs/10_development/yamajiro-scenario-design.md).
 * D: 山城「霞ヶ峰城」 — Release 2.0 showcase.
 *
 * A fictional yamajiro that stacks three stone-walled terraces (levels 1..3)
 * on a natural rock hill. All approaches climb the south/south-east face so
 * the isometric fixed camera always sees the main battle. Slopes are the only
 * way up — kuruwa edges are ishigaki cliffs — and every slope exit is watched
 * from higher ground, so the high-ground combat bonus (+1 range, x1.25 damage)
 * drives the defense.
 *
 * References: 岩村城 (stacked terraced ishigaki), 高取城 (long switchback
 * approach road), 備中松山城 (natural rock face merged with stone walls).
 * AI profile: 大手正面強襲 + 搦手(南東)側面攻撃の混合型.
 *
 * Terrain summary (elevation levels):
 *   L3 本丸  rect x51..62, y57..64 (tenshu + honmaru marker + koguchi gate)
 *   L2 二の丸 rect x47..68, y55..71 (storehouse, barracks, two yagura)
 *   L1 三の丸 rect x44..73, y52..85 + natural hill ellipse (cliff skin)
 *   L0 城下   south town below y>=87 (market, town blocks, farms, sōgamae)
 * Slopes (all on the S/SE faces):
 *   大手道  0→1 (56..57,86)→N   1→2 (52..53,72)→N   虎口 2→3 (60,65)→N
 *   搦手道  0→1 (74,79)→W       1→2 (68,72)→N
 */
export const mountainCastleScenario: ContentScenarioDefinition = {
  id: "mountain-castle",
  name: "霞ヶ峰城",
  description:
    "三段の石垣曲輪が南面の登城路を見下ろす山城シナリオ。坂だけが山上への道。高所の弓兵で大手道と搦手道を制圧し、波状攻撃から本丸を守り抜け。",
  elevation: {
    patches: [
      // 自然の山体(岩肌)。北・西面は急峻な死角として使う。
      { area: { kind: "ellipse", cx: 58, cy: 66, rx: 21, ry: 17 }, level: 1 },
      // 三の丸(帯曲輪)。南・東の縁は石垣、山側の縁は岩肌のまま残る。
      { area: { kind: "rect", x: 44, y: 52, width: 30, height: 34 }, level: 1, skin: "ishigaki" },
      // 二の丸段丘。
      { area: { kind: "rect", x: 47, y: 55, width: 22, height: 17 }, level: 2, skin: "ishigaki" },
      // 山頂の本丸。
      { area: { kind: "rect", x: 51, y: 57, width: 12, height: 8 }, level: 3, skin: "ishigaki" },
    ],
    slopes: [
      // 大手道 0→1 (幅2の大手坂。城下の大手門跡から三の丸南帯曲輪へ)
      { position: { x: 56, y: 86 }, toward: "N", width: 2 },
      // 搦手道 0→1 (南東面の細い裏坂。東の廊下から三の丸東縁へ)
      { position: { x: 74, y: 79 }, toward: "W" },
      // 大手道 1→2 (三の丸帯曲輪を西へ横断させてから登らせる幅2の坂)
      { position: { x: 52, y: 72 }, toward: "N", width: 2 },
      // 搦手道 1→2 (二の丸南東角への幅1の坂)
      { position: { x: 68, y: 72 }, toward: "N" },
      // 虎口 2→3 (本丸への唯一の入口。幅1の防衛チョーク)
      { position: { x: 60, y: 65 }, toward: "N" },
    ],
  },
  initialBuildings: [
    // === 本丸 (L3, x51..62 y57..64) ===
    { type: "tenshu", position: { x: 52, y: 58 } },
    { type: "honmaru", position: { x: 60, y: 60 } },
    // 虎口門 — 2→3 坂の出口を塞ぐ狭門 (中央 (60,64) のみ通行可)。破らない限り本丸に入れない。
    { type: "gate_narrow_3", position: { x: 59, y: 64 } },
    // 本丸の兵糧蔵 — マーカー隣接なので包囲されても補給が切れない (籠城の蓄え)。
    { type: "storehouse", position: { x: 60, y: 57 } },

    // === 二の丸 (L2, x47..68 y55..71) ===
    { type: "storehouse", position: { x: 64, y: 56 } },
    { type: "barracks", position: { x: 47, y: 58 } },
    // 南西隅櫓 — 大手 1→2 坂 (52..53,72) を見下ろす。
    { type: "yagura", position: { x: 49, y: 68 } },
    // 南東隅櫓 — 搦手 1→2 坂 (68,72) を見下ろす。
    { type: "yagura", position: { x: 66, y: 69 } },

    // === 三の丸 (L1 帯曲輪) ===
    // 大手門 — 0→1 大手坂の上端を塞ぐ幅2の門。
    { type: "gate_wide_2", position: { x: 56, y: 85 } },
    // 搦手門 — 0→1 搦手坂の上端を塞ぐ狭門 (東西向き、中央 (73,79) のみ通行可)。
    { type: "gate_narrow_3_ne_sw", position: { x: 73, y: 78 } },
    // 大手坂上の物見櫓と搦手側の物見櫓。
    { type: "yagura", position: { x: 54, y: 82 } },
    { type: "yagura", position: { x: 71, y: 81 } },

    // === 城下 (L0, 南麓) ===
    { type: "market", position: { x: 59, y: 92 } },
    { type: "town_block", position: { x: 46, y: 92 } },
    { type: "town_block", position: { x: 64, y: 92 } },
    { type: "samurai_residence", position: { x: 46, y: 87 } },
    { type: "farm", position: { x: 52, y: 100 } },
    { type: "farm", position: { x: 61, y: 100 } },

    // 大手道 (城下の目抜き通り。x=56 を南北に貫く)
    { type: "road", position: { x: 56, y: 88 } },
    { type: "road", position: { x: 56, y: 89 } },
    { type: "road", position: { x: 56, y: 90 } },
    { type: "road", position: { x: 56, y: 91 } },
    { type: "road", position: { x: 56, y: 92 } },
    { type: "road", position: { x: 56, y: 93 } },
    { type: "road", position: { x: 56, y: 94 } },
    { type: "road", position: { x: 56, y: 95 } },
    { type: "road", position: { x: 56, y: 96 } },
    { type: "road", position: { x: 56, y: 97 } },
    { type: "road", position: { x: 56, y: 98 } },
    { type: "road", position: { x: 56, y: 99 } },
    { type: "road", position: { x: 56, y: 100 } },
    { type: "road", position: { x: 56, y: 101 } },
    { type: "road", position: { x: 56, y: 102 } },
    { type: "road", position: { x: 56, y: 103 } },
    { type: "road", position: { x: 56, y: 104 } },
    { type: "road", position: { x: 56, y: 105 } },
    { type: "road", position: { x: 56, y: 106 } },
    { type: "road", position: { x: 56, y: 108 } },
    { type: "road", position: { x: 56, y: 109 } },
    { type: "road", position: { x: 56, y: 110 } },

    // === 惣構 (城下南端の柵列 y=107。門は大手道上) ===
    { type: "fence", position: { x: 44, y: 107 } },
    { type: "fence", position: { x: 45, y: 107 } },
    { type: "fence", position: { x: 46, y: 107 } },
    { type: "fence", position: { x: 47, y: 107 } },
    { type: "fence", position: { x: 48, y: 107 } },
    { type: "fence", position: { x: 49, y: 107 } },
    { type: "fence", position: { x: 50, y: 107 } },
    { type: "fence", position: { x: 51, y: 107 } },
    { type: "fence", position: { x: 52, y: 107 } },
    { type: "fence", position: { x: 53, y: 107 } },
    { type: "fence", position: { x: 54, y: 107 } },
    { type: "gate_wide_3", position: { x: 55, y: 107 } },
    { type: "fence", position: { x: 58, y: 107 } },
    { type: "fence", position: { x: 59, y: 107 } },
    { type: "fence", position: { x: 60, y: 107 } },
    { type: "fence", position: { x: 61, y: 107 } },
    { type: "fence", position: { x: 62, y: 107 } },
    { type: "fence", position: { x: 63, y: 107 } },
    { type: "fence", position: { x: 64, y: 107 } },
    { type: "fence", position: { x: 65, y: 107 } },
    { type: "fence", position: { x: 66, y: 107 } },
    { type: "fence", position: { x: 67, y: 107 } },
    { type: "fence", position: { x: 68, y: 107 } },
    { type: "fence", position: { x: 69, y: 107 } },
    { type: "fence", position: { x: 70, y: 107 } },
    { type: "fence", position: { x: 71, y: 107 } },
    { type: "fence", position: { x: 72, y: 107 } },
    { type: "fence", position: { x: 73, y: 107 } },

    // 敵の集結地 (南の街道口)。
    { type: "gate_narrow_3", position: { x: 55, y: 116 }, owner: "enemy" },
  ],
  initialUnits: [
    // 本丸 (L3) — 詰めの守備と南縁の高所射撃 (段3から段2・段1を制圧)。
    // 刀足軽は本丸マーカーセル上に置く (在城中は敵の本丸占拠が成立しない)。
    { type: "sword_ashigaru", position: { x: 60, y: 60 }, owner: "player" },
    // 虎口狭門 (59..61,64) の両脇に射手を展開。
    { type: "archer", position: { x: 57, y: 64 }, owner: "player" },
    { type: "archer", position: { x: 62, y: 64 }, owner: "player" },
    { type: "archer", position: { x: 58, y: 64 }, owner: "player" },
    // 虎口門の後詰め。(60,63) は本丸への唯一の補給路セルなので空けておく。
    { type: "spear_ashigaru", position: { x: 59, y: 63 }, owner: "player" },
    // 二の丸 (L2) — 大手 1→2 坂上の槍衾と南縁の射撃線。
    { type: "spear_ashigaru", position: { x: 52, y: 70 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 53, y: 70 }, owner: "player" },
    { type: "archer", position: { x: 55, y: 71 }, owner: "player" },
    { type: "archer", position: { x: 61, y: 66 }, owner: "player" },
    // 注意: (60,66) の虎口直下セルには置かない — 唯一の補給路セルを味方が
    // 塞ぐと兵糧接続BFSが切れて兵糧切れ判定になる。
    { type: "spear_ashigaru", position: { x: 59, y: 66 }, owner: "player" },
    { type: "musketeer", position: { x: 66, y: 71 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 68, y: 71 }, owner: "player" },
    // 三の丸 (L1) — 大手門・搦手門の門番と帯曲輪の射手。
    { type: "spear_ashigaru", position: { x: 56, y: 84 }, owner: "player" },
    { type: "sword_ashigaru", position: { x: 57, y: 84 }, owner: "player" },
    { type: "archer", position: { x: 55, y: 84 }, owner: "player" },
    { type: "archer", position: { x: 58, y: 84 }, owner: "player" },
    { type: "archer", position: { x: 54, y: 84 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 73, y: 78 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 72, y: 79 }, owner: "player" },
    { type: "archer", position: { x: 72, y: 80 }, owner: "player" },
    // 城下 (L0) — 惣構門前の遅滞戦闘要員。
    { type: "spear_ashigaru", position: { x: 55, y: 106 }, owner: "player" },
    { type: "archer", position: { x: 57, y: 106 }, owner: "player" },

    // 敵の物見 (南の街道)。
    { type: "spear_ashigaru", position: { x: 54, y: 112 }, owner: "enemy" },
    { type: "archer", position: { x: 58, y: 113 }, owner: "enemy" },
  ],
  waves: [
    {
      // 第1波 (tick 3000 ≈ 2.5分): 大手からの前哨攻撃。槍のみ+荷車。
      // 惣構と大手坂の防衛ラインを観客に見せる導入波。
      tick: 3000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 52, y: 114 } },
        { type: "spear_ashigaru", position: { x: 56, y: 115 } },
        { type: "spear_ashigaru", position: { x: 60, y: 114 } },
        { type: "supply_cart", position: { x: 56, y: 119 } },
      ],
    },
    {
      // 第2波 (tick 7200 = 6分): 大手主力。弓が加わり城下の柵が抜かれる想定。
      tick: 7200,
      spawns: [
        { type: "spear_ashigaru", position: { x: 51, y: 114 } },
        { type: "spear_ashigaru", position: { x: 61, y: 114 } },
        { type: "sword_ashigaru", position: { x: 56, y: 114 } },
        { type: "archer", position: { x: 53, y: 116 } },
        { type: "archer", position: { x: 59, y: 116 } },
        { type: "supply_cart", position: { x: 56, y: 120 } },
      ],
    },
    {
      // 第3波 (tick 12000 = 10分): 大手攻撃の継続 + 騎馬の搦手(南東)側面攻撃。
      // 東の廊下から裏坂に取り付く二正面戦の開始。
      tick: 12000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 53, y: 114 } },
        { type: "sword_ashigaru", position: { x: 56, y: 114 } },
        { type: "sword_ashigaru", position: { x: 59, y: 114 } },
        { type: "archer", position: { x: 52, y: 116 } },
        { type: "engineer", position: { x: 56, y: 117 } },
        { type: "supply_cart", position: { x: 56, y: 121 } },
        // 搦手側面隊 (山と東の岩尾根の間の廊下を北上する)
        { type: "cavalry", position: { x: 76, y: 104 } },
        { type: "spear_ashigaru", position: { x: 75, y: 102 } },
      ],
    },
    {
      // 第4波 (tick 17000 ≈ 14分): 総攻撃。大手・搦手同時、鉄砲の援護射撃付き。
      // 荷車2台 — 両方向の荷車撃破で撤退タイマーを狙える。
      tick: 17000,
      spawns: [
        { type: "sword_ashigaru", position: { x: 54, y: 113 } },
        { type: "sword_ashigaru", position: { x: 58, y: 113 } },
        { type: "spear_ashigaru", position: { x: 51, y: 114 } },
        { type: "spear_ashigaru", position: { x: 61, y: 114 } },
        { type: "archer", position: { x: 53, y: 115 } },
        { type: "archer", position: { x: 59, y: 115 } },
        { type: "musketeer", position: { x: 56, y: 115 } },
        { type: "engineer", position: { x: 54, y: 117 } },
        { type: "supply_cart", position: { x: 55, y: 120 } },
        // 搦手総攻撃隊
        { type: "sword_ashigaru", position: { x: 75, y: 103 } },
        { type: "spear_ashigaru", position: { x: 76, y: 105 } },
        { type: "archer", position: { x: 77, y: 107 } },
        { type: "cavalry", position: { x: 74, y: 101 } },
        { type: "supply_cart", position: { x: 76, y: 110 } },
      ],
    },
  ],
  victory: {
    holdTicks: 24000,
  },
};
