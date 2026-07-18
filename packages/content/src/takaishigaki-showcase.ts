import type { ContentScenarioDefinition } from "./index";
import { hLine, vLine } from "./scenario-parts";

/**
 * Takaishigaki showcase scenario — 高石垣の平山城.
 * Art-verification map for the tall ishigaki face assets
 * (terrain.ishigaki.face.{s,e}.h3/h4/h5 and corner.se.h3/h4/h5): three kuruwa
 * are laid out in echelon (雁行) NW→SE so every terrace's S and E edge drops
 * STRAIGHT to the L0 plain — the renderer then picks the full-height face
 * sprites instead of the stacked h1 steps a nested plan produces.
 *
 *   本丸  L5 x16..35 y50..65 — S face h5 (x20..29) / E face h5 (y50..59)
 *   二の丸 L4 x30..51 y60..77 — S face h4 (x34..43) / E face h4 (y60..71)
 *   三の丸 L3 x44..71 y72..95 — S face h3 (x44..55, x60..71) / E face h3 (y72..95)
 *
 * Corner coverage: SW-flush turret platforms (張り出し櫓台) on the honmaru and
 * ninomaru south faces produce convex corner.se.h5 / corner.se.h4 plus a
 * concave 入隅 against the main face; the sannomaru SE corner is a natural
 * corner.se.h3, and a 舟入 notch (x56..59 y90..95) in its south face adds an
 * h3 入隅 pair. A water moat hugs the sannomaru south/east foot so the h3
 * wall rises from the water (伊賀上野城風).
 *
 * Access: the 大手道 climbs a back staircase on the NE — L1/L2 terraces
 * (x54..63) with width-2 ramps at (58,55)→S, (58,63)→S, (58,71)→S — then
 * 3→4 at (46,78)→N and 4→5 at (32,66)→N, each gated at the top.
 */
export const takaishigakiShowcaseScenario: ContentScenarioDefinition = {
  id: "takaishigaki-showcase",
  name: "高石垣の城",
  description:
    "三/四/五段の高石垣が南面と東面に一気に立ち上がる平山城。堀から聳える三の丸、櫓台の算木積を見せる二の丸と本丸——北東の大手道を九十九折に登る敵を、段ごとの門で受け止めよ。",
  elevation: {
    patches: [
      // 本丸 (L5) と南西張り出し櫓台
      { area: { kind: "rect", x: 16, y: 50, width: 20, height: 16 }, level: 5, skin: "ishigaki" },
      { area: { kind: "rect", x: 16, y: 66, width: 4, height: 2 }, level: 5, skin: "ishigaki" },
      // 二の丸 (L4) と南張り出し櫓台
      { area: { kind: "rect", x: 30, y: 60, width: 22, height: 18 }, level: 4, skin: "ishigaki" },
      { area: { kind: "rect", x: 30, y: 78, width: 4, height: 2 }, level: 4, skin: "ishigaki" },
      // 三の丸 (L3) — 南面の舟入 (x56..59 y90..95) を挟む三矩形
      { area: { kind: "rect", x: 44, y: 72, width: 28, height: 18 }, level: 3, skin: "ishigaki" },
      { area: { kind: "rect", x: 44, y: 72, width: 12, height: 24 }, level: 3, skin: "ishigaki" },
      { area: { kind: "rect", x: 60, y: 72, width: 12, height: 24 }, level: 3, skin: "ishigaki" },
      // 大手道の裏階段 (北東, L1/L2)
      { area: { kind: "rect", x: 54, y: 64, width: 10, height: 8 }, level: 2, skin: "ishigaki" },
      { area: { kind: "rect", x: 54, y: 56, width: 10, height: 8 }, level: 1, skin: "ishigaki" },
    ],
    slopes: [
      // 大手 0→1→2→3 (北東の裏階段, いずれも南向き・幅2)
      { position: { x: 58, y: 55 }, toward: "S", width: 2 },
      { position: { x: 58, y: 63 }, toward: "S", width: 2 },
      { position: { x: 58, y: 71 }, toward: "S", width: 2 },
      // 三の丸 → 二の丸 3→4 (幅2)
      { position: { x: 46, y: 78 }, toward: "N", width: 2 },
      // 二の丸 → 本丸 4→5 (幅2)
      { position: { x: 32, y: 66 }, toward: "N", width: 2 },
    ],
  },
  initialBuildings: [
    // === 本丸 (L5) — 天守・詰の蔵・虎口門・櫓台の隅櫓 ===
    { type: "tenshu", position: { x: 18, y: 52 } },
    { type: "honmaru", position: { x: 31, y: 58 } },
    { type: "storehouse", position: { x: 27, y: 52 } },
    { type: "gate_wide_2", position: { x: 32, y: 65 } },
    { type: "yagura", position: { x: 16, y: 66 } },
    // 東縁の土塀 (h5東面の天端)
    ...vLine("wall", 35, 52, 57),

    // === 二の丸 (L4) — 兵舎・蔵・門・隅櫓 ===
    { type: "barracks", position: { x: 37, y: 61 } },
    { type: "storehouse", position: { x: 43, y: 61 } },
    { type: "gate_wide_2", position: { x: 46, y: 77 } },
    { type: "yagura", position: { x: 49, y: 60 } },
    { type: "yagura", position: { x: 30, y: 78 } },
    // 南縁・東縁の土塀 (h4面の天端)
    ...hLine("wall", 38, 43, 77),
    ...vLine("wall", 51, 63, 69),

    // === 三の丸 (L3) — 侍屋敷・舟入見張り櫓・隅櫓・門 ===
    { type: "samurai_residence", position: { x: 64, y: 75 } },
    { type: "gate_wide_2", position: { x: 58, y: 72 } },
    { type: "yagura", position: { x: 57, y: 87 } },
    { type: "yagura", position: { x: 69, y: 93 } },
    // 東縁の土塀 (h3東面の天端)
    ...vLine("wall", 71, 74, 79),

    // === 大手裏階段 (L1/L2) — 段ごとの門と見張り櫓 ===
    { type: "gate_wide_2", position: { x: 58, y: 64 } },
    { type: "gate_wide_2", position: { x: 58, y: 56 } },
    { type: "yagura", position: { x: 61, y: 66 } },

    // === 水堀 — 三の丸南・東の高石垣は堀から立ち上がる ===
    ...hLine("water_moat", 42, 74, 97),
    ...hLine("water_moat", 42, 74, 98),
    ...vLine("water_moat", 73, 71, 96),
    ...vLine("water_moat", 74, 71, 96),
    // 舟入 (南面の入り込み)
    ...hLine("water_moat", 57, 59, 91),
    ...hLine("water_moat", 57, 59, 92),
    ...hLine("water_moat", 57, 59, 93),
    ...hLine("water_moat", 57, 59, 94),
    ...hLine("water_moat", 57, 59, 95),
    ...hLine("water_moat", 57, 59, 96),

    // === 城下 (L0) — 南西の町と北東の大手口 ===
    { type: "market", position: { x: 29, y: 84 } },
    { type: "samurai_residence", position: { x: 36, y: 83 } },
    { type: "town_block", position: { x: 30, y: 90 } },
    { type: "farm", position: { x: 38, y: 90 } },
    ...vLine("road", 42, 80, 96),
    { type: "town_block", position: { x: 66, y: 58 } },
    { type: "farm", position: { x: 66, y: 66 } },
    ...hLine("road", 59, 74, 50),
    ...vLine("road", 58, 51, 54),

    // 敵の集結地 (北東の街道口)
    { type: "gate", position: { x: 75, y: 48 }, owner: "enemy" },
  ],
  initialUnits: [
    // 本丸 (L5) — 刀は本丸マーカー上、弓は南縁。
    { type: "sword_ashigaru", position: { x: 31, y: 58 }, owner: "player" },
    { type: "archer", position: { x: 21, y: 64 }, owner: "player" },
    { type: "archer", position: { x: 26, y: 64 }, owner: "player" },
    // 二の丸 (L4) — 本丸虎口下の受け。坂セル (32..33,66) は空ける。
    { type: "spear_ashigaru", position: { x: 32, y: 68 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 33, y: 68 }, owner: "player" },
    { type: "archer", position: { x: 35, y: 69 }, owner: "player" },
    { type: "archer", position: { x: 38, y: 70 }, owner: "player" },
    // 三の丸 (L3) — 二の丸門下の槍衾と南縁の射撃線。
    { type: "spear_ashigaru", position: { x: 45, y: 80 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 48, y: 80 }, owner: "player" },
    { type: "archer", position: { x: 46, y: 81 }, owner: "player" },
    { type: "archer", position: { x: 50, y: 93 }, owner: "player" },
    { type: "archer", position: { x: 53, y: 93 }, owner: "player" },
    { type: "musketeer", position: { x: 63, y: 93 }, owner: "player" },
    // 大手裏階段の門裏 (L3/L2/L1)。門セルと坂セルは空ける。
    { type: "spear_ashigaru", position: { x: 58, y: 73 }, owner: "player" },
    { type: "spear_ashigaru", position: { x: 59, y: 73 }, owner: "player" },
    { type: "archer", position: { x: 56, y: 68 }, owner: "player" },
    { type: "archer", position: { x: 61, y: 69 }, owner: "player" },
    { type: "archer", position: { x: 56, y: 60 }, owner: "player" },
    { type: "archer", position: { x: 61, y: 60 }, owner: "player" },
    // 城下 (L0) — 大手口の遅滞戦闘要員。
    { type: "spear_ashigaru", position: { x: 60, y: 52 }, owner: "player" },
    { type: "archer", position: { x: 62, y: 52 }, owner: "player" },

    // 敵の物見 (北東街道)。
    { type: "spear_ashigaru", position: { x: 70, y: 48 }, owner: "enemy" },
    { type: "archer", position: { x: 73, y: 49 }, owner: "enemy" },
  ],
  waves: [
    {
      // 第1波: 大手前哨。槍のみ+荷車。
      tick: 3000,
      spawns: [
        { type: "spear_ashigaru", position: { x: 72, y: 48 } },
        { type: "spear_ashigaru", position: { x: 74, y: 50 } },
        { type: "supply_cart", position: { x: 76, y: 49 } },
      ],
    },
    {
      // 第2波: 大手主力。弓の援護付き。
      tick: 7800,
      spawns: [
        { type: "spear_ashigaru", position: { x: 71, y: 47 } },
        { type: "spear_ashigaru", position: { x: 75, y: 50 } },
        { type: "sword_ashigaru", position: { x: 73, y: 48 } },
        { type: "archer", position: { x: 72, y: 51 } },
        { type: "archer", position: { x: 76, y: 51 } },
        { type: "supply_cart", position: { x: 77, y: 49 } },
      ],
    },
    {
      // 第3波: 攻城部隊。工兵と騎兵が加わる。
      tick: 12600,
      spawns: [
        { type: "sword_ashigaru", position: { x: 72, y: 48 } },
        { type: "sword_ashigaru", position: { x: 74, y: 48 } },
        { type: "spear_ashigaru", position: { x: 73, y: 50 } },
        { type: "engineer", position: { x: 75, y: 51 } },
        { type: "archer", position: { x: 71, y: 50 } },
        { type: "cavalry", position: { x: 69, y: 47 } },
        { type: "supply_cart", position: { x: 77, y: 50 } },
      ],
    },
    {
      // 第4波: 総攻撃。鉄砲援護と両翼の騎馬、荷車2台。
      tick: 17400,
      spawns: [
        { type: "sword_ashigaru", position: { x: 71, y: 48 } },
        { type: "sword_ashigaru", position: { x: 75, y: 48 } },
        { type: "spear_ashigaru", position: { x: 72, y: 50 } },
        { type: "spear_ashigaru", position: { x: 74, y: 50 } },
        { type: "archer", position: { x: 71, y: 51 } },
        { type: "archer", position: { x: 75, y: 51 } },
        { type: "musketeer", position: { x: 73, y: 51 } },
        { type: "engineer", position: { x: 74, y: 52 } },
        { type: "cavalry", position: { x: 68, y: 47 } },
        { type: "cavalry", position: { x: 70, y: 52 } },
        { type: "supply_cart", position: { x: 76, y: 52 } },
        { type: "supply_cart", position: { x: 77, y: 52 } },
      ],
    },
  ],
  victory: {
    holdTicks: 24000,
  },
};
