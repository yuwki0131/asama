import type { ContentScenarioDefinition } from "./index";

/**
 * Free-play sandbox scenario.
 * No enemy waves, no game-over condition, no time limit.
 * All building types and unit types are included in the initial setup so the
 * player can explore every mechanic immediately.
 *
 * Layout overview:
 *   Inner compound  — tenshu + honmaru + 4 storehouses + barracks/market/samurai_residence
 *                     enclosed by a stone wall ring with 4 corner yagura.
 *   Outer enclosure — fence ring with 4 corner yagura.
 *   Castle-town     — two town_blocks connected to the main road, 4 farms.
 *   Moat demo       — dry_moat and water_moat strips east of the castle.
 *   Elevation demo  — small ishigaki terrace in the NW corner (x 20-37, y 20-31)
 *                     with a slope at (28, 32) for trying high-ground mechanics.
 *
 * Sentinel wave: a single far-future wave (tick 9 999 999, no spawns) keeps
 * `nextWaveIndex < waves.length` so the simulation never fires the
 * "enemy_annihilated" victory and the game runs indefinitely.
 */
export const freePlayScenario: ContentScenarioDefinition = {
  id: "free-play",
  name: "自由演習",
  description:
    "資源無制限・ゲームオーバーなしのサンドボックスモード。建設・兵種・高低差のすべてを試せる。",
  elevation: {
    patches: [
      // 北西の小丘陵: ishigaki 段丘で高低差メカニクスのデモに使う。
      {
        area: { kind: "rect", x: 20, y: 20, width: 18, height: 12 },
        level: 1,
        skin: "ishigaki"
      }
    ],
    slopes: [
      // 小丘陵への登り坂 — (28,32) が L0 の低位セル、北向きに登ると L1 へ。
      { position: { x: 28, y: 32 }, toward: "N" }
    ]
  },
  initialBuildings: [
    // ===================================================================
    // 天守曲輪 (内郭)
    // ===================================================================
    // 天守 (5×5): x=53..57, y=55..59
    { type: "tenshu", position: { x: 53, y: 55 } },
    // 本丸マーカー
    { type: "honmaru", position: { x: 62, y: 59 } },
    // 兵糧蔵 (3×3) × 2: 天守の東側
    { type: "storehouse", position: { x: 59, y: 53 } },
    { type: "storehouse", position: { x: 59, y: 56 } },
    // 内郭四隅の矢倉 (2×2)
    { type: "yagura", position: { x: 50, y: 53 } },
    { type: "yagura", position: { x: 65, y: 53 } },
    { type: "yagura", position: { x: 50, y: 60 } },
    { type: "yagura", position: { x: 65, y: 60 } },

    // --- 内郭 石垣 (x=49..67, y=52..62) --------------------------
    // 北壁 (y=52)
    { type: "wall", position: { x: 49, y: 52 } },
    { type: "wall", position: { x: 50, y: 52 } },
    { type: "wall", position: { x: 51, y: 52 } },
    { type: "wall", position: { x: 52, y: 52 } },
    { type: "wall", position: { x: 53, y: 52 } },
    { type: "wall", position: { x: 54, y: 52 } },
    { type: "wall", position: { x: 55, y: 52 } },
    { type: "wall", position: { x: 56, y: 52 } },
    { type: "wall", position: { x: 57, y: 52 } },
    { type: "wall", position: { x: 58, y: 52 } },
    { type: "wall", position: { x: 59, y: 52 } },
    { type: "wall", position: { x: 60, y: 52 } },
    { type: "wall", position: { x: 61, y: 52 } },
    { type: "wall", position: { x: 62, y: 52 } },
    { type: "wall", position: { x: 63, y: 52 } },
    { type: "wall", position: { x: 64, y: 52 } },
    { type: "wall", position: { x: 65, y: 52 } },
    { type: "wall", position: { x: 66, y: 52 } },
    { type: "wall", position: { x: 67, y: 52 } },
    // 南壁 (y=62) — gate_wide_3 at x=63 (spans x=63,64,65)
    { type: "wall", position: { x: 49, y: 62 } },
    { type: "wall", position: { x: 50, y: 62 } },
    { type: "wall", position: { x: 51, y: 62 } },
    { type: "wall", position: { x: 52, y: 62 } },
    { type: "wall", position: { x: 53, y: 62 } },
    { type: "wall", position: { x: 54, y: 62 } },
    { type: "wall", position: { x: 55, y: 62 } },
    { type: "wall", position: { x: 56, y: 62 } },
    { type: "wall", position: { x: 57, y: 62 } },
    { type: "wall", position: { x: 58, y: 62 } },
    { type: "wall", position: { x: 59, y: 62 } },
    { type: "wall", position: { x: 60, y: 62 } },
    { type: "wall", position: { x: 61, y: 62 } },
    { type: "wall", position: { x: 62, y: 62 } },
    { type: "gate_wide_3", position: { x: 63, y: 62 } },
    { type: "wall", position: { x: 66, y: 62 } },
    { type: "wall", position: { x: 67, y: 62 } },
    // 西壁 (x=49, y=53..61)
    { type: "wall", position: { x: 49, y: 53 } },
    { type: "wall", position: { x: 49, y: 54 } },
    { type: "wall", position: { x: 49, y: 55 } },
    { type: "wall", position: { x: 49, y: 56 } },
    { type: "wall", position: { x: 49, y: 57 } },
    { type: "wall", position: { x: 49, y: 58 } },
    { type: "wall", position: { x: 49, y: 59 } },
    { type: "wall", position: { x: 49, y: 60 } },
    { type: "wall", position: { x: 49, y: 61 } },
    // 東壁 (x=67, y=53..61)
    { type: "wall", position: { x: 67, y: 53 } },
    { type: "wall", position: { x: 67, y: 54 } },
    { type: "wall", position: { x: 67, y: 55 } },
    { type: "wall", position: { x: 67, y: 56 } },
    { type: "wall", position: { x: 67, y: 57 } },
    { type: "wall", position: { x: 67, y: 58 } },
    { type: "wall", position: { x: 67, y: 59 } },
    { type: "wall", position: { x: 67, y: 60 } },
    { type: "wall", position: { x: 67, y: 61 } },

    // ===================================================================
    // 中郭 (二之丸) — 内郭南門の外側
    // ===================================================================
    { type: "barracks", position: { x: 50, y: 64 } },
    { type: "samurai_residence", position: { x: 56, y: 64 } },
    { type: "market", position: { x: 62, y: 64 } },
    { type: "storehouse", position: { x: 66, y: 64 } },
    { type: "storehouse", position: { x: 66, y: 68 } },
    // 南門からの大手道 (内郭内→中郭)
    { type: "road", position: { x: 63, y: 63 } },

    // ===================================================================
    // 堀 (デモ用)
    // ===================================================================
    // 空堀 (西)
    { type: "dry_moat", position: { x: 76, y: 64 } },
    { type: "dry_moat", position: { x: 76, y: 65 } },
    { type: "dry_moat", position: { x: 76, y: 66 } },
    // 水堀 (東)
    { type: "water_moat", position: { x: 80, y: 64 } },
    { type: "water_moat", position: { x: 80, y: 65 } },
    { type: "water_moat", position: { x: 80, y: 66 } },

    // ===================================================================
    // 外郭 柵 (x=44..74, y=47..87)
    // ===================================================================
    // 北柵 (y=47)
    { type: "fence", position: { x: 44, y: 47 } },
    { type: "fence", position: { x: 45, y: 47 } },
    { type: "fence", position: { x: 46, y: 47 } },
    { type: "fence", position: { x: 47, y: 47 } },
    { type: "fence", position: { x: 48, y: 47 } },
    { type: "fence", position: { x: 49, y: 47 } },
    { type: "fence", position: { x: 50, y: 47 } },
    { type: "fence", position: { x: 51, y: 47 } },
    { type: "fence", position: { x: 52, y: 47 } },
    { type: "fence", position: { x: 53, y: 47 } },
    { type: "fence", position: { x: 54, y: 47 } },
    { type: "fence", position: { x: 55, y: 47 } },
    { type: "fence", position: { x: 56, y: 47 } },
    { type: "fence", position: { x: 57, y: 47 } },
    { type: "fence", position: { x: 58, y: 47 } },
    { type: "fence", position: { x: 59, y: 47 } },
    { type: "fence", position: { x: 60, y: 47 } },
    { type: "fence", position: { x: 61, y: 47 } },
    { type: "fence", position: { x: 62, y: 47 } },
    { type: "fence", position: { x: 63, y: 47 } },
    { type: "fence", position: { x: 64, y: 47 } },
    { type: "fence", position: { x: 65, y: 47 } },
    { type: "fence", position: { x: 66, y: 47 } },
    { type: "fence", position: { x: 67, y: 47 } },
    { type: "fence", position: { x: 68, y: 47 } },
    { type: "fence", position: { x: 69, y: 47 } },
    { type: "fence", position: { x: 70, y: 47 } },
    { type: "fence", position: { x: 71, y: 47 } },
    { type: "fence", position: { x: 72, y: 47 } },
    { type: "fence", position: { x: 73, y: 47 } },
    { type: "fence", position: { x: 74, y: 47 } },
    // 南柵 (y=87) — gate_wide_3 at x=60 (spans x=60,61,62)
    { type: "fence", position: { x: 44, y: 87 } },
    { type: "fence", position: { x: 45, y: 87 } },
    { type: "fence", position: { x: 46, y: 87 } },
    { type: "fence", position: { x: 47, y: 87 } },
    { type: "fence", position: { x: 48, y: 87 } },
    { type: "fence", position: { x: 49, y: 87 } },
    { type: "fence", position: { x: 50, y: 87 } },
    { type: "fence", position: { x: 51, y: 87 } },
    { type: "fence", position: { x: 52, y: 87 } },
    { type: "fence", position: { x: 53, y: 87 } },
    { type: "fence", position: { x: 54, y: 87 } },
    { type: "fence", position: { x: 55, y: 87 } },
    { type: "fence", position: { x: 56, y: 87 } },
    { type: "fence", position: { x: 57, y: 87 } },
    { type: "fence", position: { x: 58, y: 87 } },
    { type: "fence", position: { x: 59, y: 87 } },
    { type: "gate_wide_3", position: { x: 60, y: 87 } },
    { type: "fence", position: { x: 63, y: 87 } },
    { type: "fence", position: { x: 64, y: 87 } },
    { type: "fence", position: { x: 65, y: 87 } },
    { type: "fence", position: { x: 66, y: 87 } },
    { type: "fence", position: { x: 67, y: 87 } },
    { type: "fence", position: { x: 68, y: 87 } },
    { type: "fence", position: { x: 69, y: 87 } },
    { type: "fence", position: { x: 70, y: 87 } },
    { type: "fence", position: { x: 71, y: 87 } },
    { type: "fence", position: { x: 72, y: 87 } },
    { type: "fence", position: { x: 73, y: 87 } },
    { type: "fence", position: { x: 74, y: 87 } },
    // 西柵 (x=44, y=48..86)
    { type: "fence", position: { x: 44, y: 48 } },
    { type: "fence", position: { x: 44, y: 49 } },
    { type: "fence", position: { x: 44, y: 50 } },
    { type: "fence", position: { x: 44, y: 51 } },
    { type: "fence", position: { x: 44, y: 52 } },
    { type: "fence", position: { x: 44, y: 53 } },
    { type: "fence", position: { x: 44, y: 54 } },
    { type: "fence", position: { x: 44, y: 55 } },
    { type: "fence", position: { x: 44, y: 56 } },
    { type: "fence", position: { x: 44, y: 57 } },
    { type: "fence", position: { x: 44, y: 58 } },
    { type: "fence", position: { x: 44, y: 59 } },
    { type: "fence", position: { x: 44, y: 60 } },
    { type: "fence", position: { x: 44, y: 61 } },
    { type: "fence", position: { x: 44, y: 62 } },
    { type: "fence", position: { x: 44, y: 63 } },
    { type: "fence", position: { x: 44, y: 64 } },
    { type: "fence", position: { x: 44, y: 65 } },
    { type: "fence", position: { x: 44, y: 66 } },
    { type: "fence", position: { x: 44, y: 67 } },
    { type: "fence", position: { x: 44, y: 68 } },
    { type: "fence", position: { x: 44, y: 69 } },
    { type: "fence", position: { x: 44, y: 70 } },
    { type: "fence", position: { x: 44, y: 71 } },
    { type: "fence", position: { x: 44, y: 72 } },
    { type: "fence", position: { x: 44, y: 73 } },
    { type: "fence", position: { x: 44, y: 74 } },
    { type: "fence", position: { x: 44, y: 75 } },
    { type: "fence", position: { x: 44, y: 76 } },
    { type: "fence", position: { x: 44, y: 77 } },
    { type: "fence", position: { x: 44, y: 78 } },
    { type: "fence", position: { x: 44, y: 79 } },
    { type: "fence", position: { x: 44, y: 80 } },
    { type: "fence", position: { x: 44, y: 81 } },
    { type: "fence", position: { x: 44, y: 82 } },
    { type: "fence", position: { x: 44, y: 83 } },
    { type: "fence", position: { x: 44, y: 84 } },
    { type: "fence", position: { x: 44, y: 85 } },
    { type: "fence", position: { x: 44, y: 86 } },
    // 東柵 (x=74, y=48..86)
    { type: "fence", position: { x: 74, y: 48 } },
    { type: "fence", position: { x: 74, y: 49 } },
    { type: "fence", position: { x: 74, y: 50 } },
    { type: "fence", position: { x: 74, y: 51 } },
    { type: "fence", position: { x: 74, y: 52 } },
    { type: "fence", position: { x: 74, y: 53 } },
    { type: "fence", position: { x: 74, y: 54 } },
    { type: "fence", position: { x: 74, y: 55 } },
    { type: "fence", position: { x: 74, y: 56 } },
    { type: "fence", position: { x: 74, y: 57 } },
    { type: "fence", position: { x: 74, y: 58 } },
    { type: "fence", position: { x: 74, y: 59 } },
    { type: "fence", position: { x: 74, y: 60 } },
    { type: "fence", position: { x: 74, y: 61 } },
    { type: "fence", position: { x: 74, y: 62 } },
    { type: "fence", position: { x: 74, y: 63 } },
    { type: "fence", position: { x: 74, y: 64 } },
    { type: "fence", position: { x: 74, y: 65 } },
    { type: "fence", position: { x: 74, y: 66 } },
    { type: "fence", position: { x: 74, y: 67 } },
    { type: "fence", position: { x: 74, y: 68 } },
    { type: "fence", position: { x: 74, y: 69 } },
    { type: "fence", position: { x: 74, y: 70 } },
    { type: "fence", position: { x: 74, y: 71 } },
    { type: "fence", position: { x: 74, y: 72 } },
    { type: "fence", position: { x: 74, y: 73 } },
    { type: "fence", position: { x: 74, y: 74 } },
    { type: "fence", position: { x: 74, y: 75 } },
    { type: "fence", position: { x: 74, y: 76 } },
    { type: "fence", position: { x: 74, y: 77 } },
    { type: "fence", position: { x: 74, y: 78 } },
    { type: "fence", position: { x: 74, y: 79 } },
    { type: "fence", position: { x: 74, y: 80 } },
    { type: "fence", position: { x: 74, y: 81 } },
    { type: "fence", position: { x: 74, y: 82 } },
    { type: "fence", position: { x: 74, y: 83 } },
    { type: "fence", position: { x: 74, y: 84 } },
    { type: "fence", position: { x: 74, y: 85 } },
    { type: "fence", position: { x: 74, y: 86 } },
    // 外郭四隅の矢倉
    { type: "yagura", position: { x: 45, y: 48 } },
    { type: "yagura", position: { x: 72, y: 48 } },
    { type: "yagura", position: { x: 45, y: 84 } },
    { type: "yagura", position: { x: 72, y: 84 } },

    // ===================================================================
    // 城下町
    // ===================================================================
    // 大手道 (外郭南門→城下)
    { type: "road", position: { x: 62, y: 88 } },
    { type: "road", position: { x: 62, y: 89 } },
    { type: "road", position: { x: 62, y: 90 } },
    { type: "road", position: { x: 62, y: 91 } },
    { type: "road", position: { x: 62, y: 92 } },
    { type: "road", position: { x: 62, y: 93 } },
    { type: "road", position: { x: 62, y: 94 } },
    { type: "road", position: { x: 62, y: 95 } },
    { type: "road", position: { x: 62, y: 96 } },
    { type: "road", position: { x: 62, y: 97 } },
    // 西枝道 (y=92) — 西側の町区画を活性化
    { type: "road", position: { x: 54, y: 92 } },
    { type: "road", position: { x: 55, y: 92 } },
    { type: "road", position: { x: 56, y: 92 } },
    { type: "road", position: { x: 57, y: 92 } },
    { type: "road", position: { x: 58, y: 92 } },
    { type: "road", position: { x: 59, y: 92 } },
    { type: "road", position: { x: 60, y: 92 } },
    { type: "road", position: { x: 61, y: 92 } },
    // 町区画 × 2 (6×6)
    { type: "town_block", position: { x: 48, y: 89 } },
    { type: "town_block", position: { x: 63, y: 89 } },
    // 農地 × 4 (4×4)
    { type: "farm", position: { x: 44, y: 96 } },
    { type: "farm", position: { x: 50, y: 96 } },
    { type: "farm", position: { x: 63, y: 96 } },
    { type: "farm", position: { x: 68, y: 96 } }
  ],

  initialUnits: [
    // プレイヤー全兵種 × 2 (中郭内・本丸から離して配置)
    // 注意: 本丸に隣接するセルを塞ぐと兵糧接続BFSが止まるため、
    // ユニットは本丸周辺を避けて中郭南寄りに配置する。
    { type: "spear_ashigaru",  position: { x: 55, y: 68 }, owner: "player" },
    { type: "sword_ashigaru",  position: { x: 56, y: 68 }, owner: "player" },
    { type: "archer",          position: { x: 57, y: 68 }, owner: "player" },
    { type: "engineer",        position: { x: 58, y: 68 }, owner: "player" },
    { type: "musketeer",       position: { x: 59, y: 68 }, owner: "player" },
    { type: "cavalry",         position: { x: 60, y: 68 }, owner: "player" },
    { type: "spear_ashigaru",  position: { x: 55, y: 69 }, owner: "player" },
    { type: "sword_ashigaru",  position: { x: 56, y: 69 }, owner: "player" },
    { type: "archer",          position: { x: 57, y: 69 }, owner: "player" },
    { type: "engineer",        position: { x: 58, y: 69 }, owner: "player" },
    { type: "musketeer",       position: { x: 59, y: 69 }, owner: "player" },
    { type: "cavalry",         position: { x: 60, y: 69 }, owner: "player" }
  ],

  // センチネルウェーブ: nextWaveIndex を waves.length 未満に保ち、
  // tick 0 での "enemy_annihilated" 即時勝利を防ぐ。
  // 実際にこの波が発火する tick には通常プレイで到達しない。
  waves: [{ tick: 9_999_999, spawns: [] }],

  victory: {
    holdTicks: null // タイム勝利なし = 無限プレイ
  }
};
