import type { BuildingType, ScenarioBuildingPlacement, ScenarioUnitSpawn } from "@asama/shared";
import type { ContentScenarioDefinition } from "./index";
import { hLine, ring, vLine } from "./scenario-parts";

const at = (type: BuildingType, x: number, y: number): ScenarioBuildingPlacement => ({
  type,
  position: { x, y },
});

function filledBorder(
  type: BuildingType,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  openings: ReadonlySet<string> = new Set()
): ScenarioBuildingPlacement[] {
  const result: ScenarioBuildingPlacement[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (x < x0 + thickness || x > x1 - thickness || y < y0 + thickness || y > y1 - thickness) {
        if (!openings.has(`${x},${y}`)) result.push(at(type, x, y));
      }
    }
  }
  return result;
}

function cells(type: BuildingType, coordinates: readonly (readonly [number, number])[]) {
  return coordinates.map(([x, y]) => at(type, x, y));
}

const shiftY = (placements: readonly ScenarioBuildingPlacement[], offset: number) =>
  placements.map((placement) => ({ ...placement, position: { x: placement.position.x, y: placement.position.y + offset } }));

const honmaruBridge = new Set([
  "63,52", "63,53", "63,54",
  "52,34", "53,34", "52,35", "72,34", "73,34", "73,35",
  "52,53", "52,54", "53,54", "72,54", "73,53", "73,54",
]);
for (let x = 55; x <= 70; x += 1) honmaruBridge.add(`${x},52`);
const ninomaruBridges = new Set([
  "63,55", "63,56", "63,57",
  "63,71", "63,72", "63,73",
]);

// The outer wall uses r4 corner pieces. Their seven-cell stair footprints join
// the straight runs at x=18/110 and y=16/108.
const outerGates = [
  at("gate_wide_3_ne_sw", 14, 60), // 京口（西）
  at("gate_wide_3_ne_sw", 114, 60), // 名古屋口（東）
  at("gate_wide_2", 62, 112), // 南口
  at("gate_wide_2", 34, 12), // 柳口
  at("gate_wide_2", 88, 12), // 竹橋口
  at("gate_wide_2_ne_sw", 14, 34), // 清水口
  at("gate_wide_2_ne_sw", 114, 88), // 辰之口
] as const;

const outerWall = [
  at("arc_wall_r4_nw", 14, 15),
  at("arc_wall_r4_ne", 114, 15),
  at("arc_wall_r4_sw", 14, 109),
  at("arc_wall_r4_se", 114, 109),
  ...hLine("wall", 18, 110, 12, [34, 35, 88, 89]),
  ...hLine("wall", 18, 110, 112, [62, 63]),
  // The procedural river itself closes the short gaps at both banks.
  ...vLine("wall", 14, 16, 108, [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 60, 61, 62]),
  ...vLine("wall", 114, 16, 108, [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 60, 61, 62, 88, 89]),
  ...outerGates,
];

const outerMoatOpenings = new Set<string>();
const addBridgeOpening = (points: readonly (readonly [number, number])[]) => {
  for (const [x, y] of points) outerMoatOpenings.add(`${x},${y}`);
};
const outerBridgeCells: (readonly [number, number])[] = [];
const bridge = (points: readonly (readonly [number, number])[]) => {
  addBridgeOpening(points);
  outerBridgeCells.push(...points);
};
bridge([[34, 7], [34, 8], [34, 9], [34, 10], [34, 11], [35, 7], [35, 8], [35, 9], [35, 10], [35, 11]]);
bridge([[88, 7], [88, 8], [88, 9], [88, 10], [88, 11], [89, 7], [89, 8], [89, 9], [89, 10], [89, 11]]);
bridge([[9, 34], [10, 34], [11, 34], [12, 34], [13, 34], [9, 35], [10, 35], [11, 35], [12, 35], [13, 35]]);
bridge([[9, 60], [10, 60], [11, 60], [12, 60], [13, 60], [9, 61], [10, 61], [11, 61], [12, 61], [13, 61], [9, 62], [10, 62], [11, 62], [12, 62], [13, 62]]);
bridge([[115, 60], [116, 60], [117, 60], [115, 61], [116, 61], [117, 61], [115, 62], [116, 62], [117, 62]]);
bridge([[115, 88], [116, 88], [117, 88], [115, 89], [116, 89], [117, 89]]);
bridge([[62, 113], [62, 114], [62, 115], [63, 113], [63, 114], [63, 115]]);

const outerMoat = [
  ...filledBorder("water_moat", 9, 7, 117, 115, 0),
  // North and west are the broad Suimon-gawa reaches; east and south are three cells.
  ...cells("water_moat", []),
];
// Build the four differently-sized reaches explicitly (corners intentionally overlap
// geometrically only in water coverage, never as duplicate placements).
outerMoat.length = 0;
for (let y = 7; y <= 11; y += 1) for (let x = 9; x <= 117; x += 1) if (!outerMoatOpenings.has(`${x},${y}`)) outerMoat.push(at("water_moat", x, y));
for (let x = 9; x <= 13; x += 1) for (let y = 12; y <= 115; y += 1) if (!outerMoatOpenings.has(`${x},${y}`)) outerMoat.push(at("water_moat", x, y));
for (let x = 115; x <= 117; x += 1) for (let y = 12; y <= 112; y += 1) if (!outerMoatOpenings.has(`${x},${y}`)) outerMoat.push(at("water_moat", x, y));
for (let y = 113; y <= 115; y += 1) for (let x = 14; x <= 117; x += 1) if (!outerMoatOpenings.has(`${x},${y}`)) outerMoat.push(at("water_moat", x, y));
const proceduralRiverCells = new Set([
  "9,41", "9,42", "9,43", "9,44", "10,41", "10,42", "10,43", "10,44",
  "11,40", "11,41", "11,42", "11,43", "11,44", "12,40", "12,41", "12,42", "12,43",
  "13,40", "13,41", "13,42", "13,43", "115,38", "115,39", "115,40",
  "116,39", "116,40", "116,41", "117,39", "117,40", "117,41",
]);
for (let index = outerMoat.length - 1; index >= 0; index -= 1) {
  const placement = outerMoat[index]!;
  const riverBankGap = (placement.position.x <= 13 || placement.position.x >= 115)
    && placement.position.y >= 35 && placement.position.y <= 47;
  if (riverBankGap || proceduralRiverCells.has(`${placement.position.x},${placement.position.y}`)) outerMoat.splice(index, 1);
}

const townBlocks: ScenarioBuildingPlacement[] = [];
for (const [x, y] of [
  [19, 18], [27, 18], [37, 18], [45, 18], [55, 18], [65, 18], [75, 18], [93, 18], [101, 18],
  [19, 26], [27, 26], [91, 26], [99, 26],
  [19, 46], [27, 46], [19, 70], [27, 70], [19, 78], [27, 78],
  [19, 88], [27, 88],
  [19, 98], [27, 98], [19, 106], [27, 106],
] as const) townBlocks.push(at("town_block", x, y));

// 短冊型町割り: 間口が狭く奥行きの深い町屋が街路に軒を連ねる帯。town_blockの
// 面的な町区画はそのまま残し、通り沿いだけを町屋列に差し替えて粒度を出す。
const machiyaRows: ScenarioBuildingPlacement[] = [];
// 美濃路(y=61)両側町: 間口1セルの町屋が街道を挟んで向かい合う。
for (let x = 16; x <= 31; x += 1) {
  machiyaRows.push(at("machiya_ne_sw", x, 59), at("machiya_ne_sw", x, 62));
}
// 背割り長屋列: 南北通り(x=33 / x=39)に面する奥行き2セルの町屋。x=36 が背割り(裏路地)。
for (let y = 64; y <= 99; y += 1) {
  machiyaRows.push(at("machiya", 34, y), at("machiya", 37, y));
}
// 南横町(y=102)沿いの町屋テラス。南大手道(x=62..63)は通行帯として空け、
// 石尾根(道路と同じ x≈84+cos(y/11)*5 の帯、建設不能地形)も避ける。
for (let x = 42; x <= 89; x += 1) {
  if (x === 62 || x === 63) continue;
  const onStoneRidge = [103, 104].some((y) => Math.abs(x - 84 - Math.round(Math.cos(y / 11) * 5)) <= 1);
  if (onStoneRidge) continue;
  machiyaRows.push(at("machiya_ne_sw", x, 103));
}

const roads: ScenarioBuildingPlacement[] = [];
// Minoji: west/east moat approaches turn at both banks instead of forming one line.
roads.push(...hLine("road", 15, 39, 61), ...vLine("road", 39, 62, 102), ...hLine("road", 39, 91, 102), ...vLine("road", 91, 60, 101), ...hLine("road", 91, 113, 60));
// Sparse orthogonal town grid in reserved corridors.
roads.push(...vLine("road", 33, 16, 108), ...vLine("road", 107, 16, 102));
const seenRoads = new Set<string>();
for (let index = roads.length - 1; index >= 0; index -= 1) {
  const road = roads[index]!;
  const key = `${road.position.x},${road.position.y}`;
  const onStoneRidge = road.position.y > 20 && road.position.y < 104
    && Math.abs(road.position.x - 84 - Math.round(Math.cos(road.position.y / 11) * 5)) <= 1;
  const inRiverReserve = road.position.y >= 35 && road.position.y <= 46;
  if (seenRoads.has(key) || onStoneRidge || inRiverReserve) roads.splice(index, 1);
  else seenRoads.add(key);
}

const playerUnits: ScenarioUnitSpawn[] = [
  // 本丸: 天守台マウンド周縁の崖セル(南列・東列)を避けて配置
  { type: "sword_ashigaru", position: { x: 66, y: 46 }, owner: "player" },
  { type: "archer", position: { x: 60, y: 50 }, owner: "player" },
  { type: "archer", position: { x: 66, y: 50 }, owner: "player" },
  { type: "spear_ashigaru", position: { x: 63, y: 50 }, owner: "player" },
  { type: "spear_ashigaru", position: { x: 61, y: 65 }, owner: "player" },
  { type: "spear_ashigaru", position: { x: 65, y: 65 }, owner: "player" },
  { type: "archer", position: { x: 58, y: 66 }, owner: "player" },
  { type: "musketeer", position: { x: 68, y: 66 }, owner: "player" },
  { type: "spear_ashigaru", position: { x: 62, y: 77 }, owner: "player" },
  { type: "archer", position: { x: 52, y: 74 }, owner: "player" },
  { type: "archer", position: { x: 76, y: 74 }, owner: "player" },
  { type: "sword_ashigaru", position: { x: 64, y: 75 }, owner: "player" },
];

// 攻城軍の侵入口は東総門2ヶ所(名古屋口・辰之口)に限られるため、
// 分散させず両門の内側に槍前衛+射撃後衛で集結配置する(各個撃破対策)。
const eastDefense: ScenarioUnitSpawn[] = [
  { type: "spear_ashigaru", position: { x: 111, y: 59 }, owner: "player" },
  { type: "spear_ashigaru", position: { x: 111, y: 61 }, owner: "player" },
  { type: "spear_ashigaru", position: { x: 111, y: 63 }, owner: "player" },
  { type: "archer", position: { x: 109, y: 60 }, owner: "player" },
  { type: "archer", position: { x: 109, y: 62 }, owner: "player" },
  { type: "musketeer", position: { x: 108, y: 61 }, owner: "player" },
  { type: "spear_ashigaru", position: { x: 111, y: 88 }, owner: "player" },
  { type: "spear_ashigaru", position: { x: 111, y: 89 }, owner: "player" },
  { type: "archer", position: { x: 109, y: 88 }, owner: "player" },
  { type: "sword_ashigaru", position: { x: 100, y: 60 }, owner: "player" },
  { type: "archer", position: { x: 100, y: 62 }, owner: "player" },
];

export const ogakiCastleScenario: ContentScenarioDefinition = {
  id: "ogaki-castle",
  name: "大垣城",
  description: "四重の水堀を圧縮した輪郭・連郭複合の大城郭。七口之門と巨大城下町を守り、木橋と鉄門だけが通じる孤島の本丸で東からの攻城軍を迎え撃て。",
  elevation: {
    // 壁・門・橋の帯を段丘に載せると崖セル挿入(高セルのS/E隣が崖化)が門や橋の
    // セルを食って兵糧BFS/移動が遮断されるため、壁環はL0のまま本丸内部に
    // 天守台マウンド(L2+中段L1)を築き、南向き虎口スロープ2段で郭床と接続する。
    patches: [
      // 天守台+本丸核 (x58..67, y60..66)
      { area: { kind: "rect", x: 58, y: 60, width: 10, height: 7 }, level: 2, skin: "ishigaki" },
      // 中段犬走り (x58..67, y67..68)
      { area: { kind: "rect", x: 58, y: 67, width: 10, height: 2 }, level: 1, skin: "ishigaki" },
    ],
    slopes: [
      // 虎口スロープ: L1→L2、L0→L1(いずれも北へ上がる)
      { position: { x: 62, y: 67 }, toward: "N", width: 3 },
      { position: { x: 62, y: 69 }, toward: "N", width: 3 },
    ],
  },
  initialBuildings: [
    ...outerMoat,
    ...cells("earth_bridge", outerBridgeCells),
    ...outerWall,

    ...shiftY([
    // Honmaru: four corner turrets replace the corner wall cells; the iron gate is its only opening.
    ...hLine("wall", 58, 67, 38),
    ...vLine("wall", 56, 40, 49),
    ...vLine("wall", 69, 40, 49),
    ...hLine("wall", 58, 67, 51, [62, 63, 64]),
    at("gate_yagura_3", 62, 51),
    at("yagura", 56, 38), at("yagura", 68, 38), at("yagura", 56, 50), at("yagura", 68, 50),
    at("tenshu_large", 58, 40), at("honmaru", 64, 42),
    ...filledBorder("water_moat", 52, 34, 73, 54, 3, honmaruBridge),
    ...cells("diagonal_water_moat_nesw", [[52, 34], [53, 34], [52, 35]]),
    ...cells("diagonal_water_moat_nwse", [[72, 34], [73, 34], [73, 35]]),
    ...cells("diagonal_water_moat_nwse", [[52, 53], [52, 54], [53, 54]]),
    ...cells("diagonal_water_moat_nesw", [[72, 54], [73, 53], [73, 54]]),
    ...cells("wood_bridge", [[63, 52], [63, 53], [63, 54]]),

    // Ninomaru and its independent moat, north wooden approach and south earthwork.
    ...ring("wall", 54, 58, 71, 70, ["62,58", "63,58", "64,58", "62,70", "63,70"]),
    at("gate_narrow_3", 62, 58), at("gate_wide_2", 62, 70),
    at("yagura", 55, 59), at("storehouse", 67, 63), at("barracks", 56, 65),
    ...filledBorder("water_moat", 51, 55, 74, 73, 2, ninomaruBridges),
    ...cells("wood_bridge", [[63, 55], [63, 56], [63, 57]]),
    ...cells("earth_bridge", [[63, 71], [63, 72], [63, 73]]),

    // Sannomaru enclosing both central compounds; its single south gate continues the depth axis.
    ...ring("wall", 40, 28, 86, 81, ["79,28", "80,28", "81,28", "82,28", "83,28", "84,28", ...[33,34,35,36,37,38,39,40,58,59,60,61,62,63,64,65].map((y) => `86,${y}`), "62,81", "63,81", "64,81", "76,81", "77,81", "78,81", "79,81", "80,81", "81,81"]),
    at("gate_wide_3", 62, 81),
    ...ring("fence", 43, 42, 50, 52, ["46,52", "47,52"]), at("gate_wide_2", 46, 52),
    ...ring("fence", 76, 43, 83, 53, ["79,53", "80,53"]), at("gate_wide_2", 79, 53),

    // Only the east has an extra middle moat and samurai quarter.
    ...filledBorder("water_moat", 88, 29, 90, 78, 1).filter((placement) => {
      const y = placement.position.y + 20;
      return Math.abs(placement.position.x - 84 - Math.round(Math.cos(y / 11) * 5)) > 1;
    }),
    at("samurai_residence", 94, 34), at("samurai_residence", 101, 34),
    at("samurai_residence", 94, 42), at("samurai_residence", 101, 42),
    at("samurai_residence", 94, 50), at("samurai_residence", 101, 50),
    at("barracks", 94, 68), at("storehouse", 102, 68),
    ], 20),

    ...townBlocks,
    ...machiyaRows,
    ...roads,
    at("market", 38, 106), at("market", 74, 106),
    at("storehouse", 55, 106), at("storehouse", 82, 106),
    at("farm", 92, 104), at("farm", 98, 104), at("farm", 104, 104),
  ],
  initialUnits: [
    ...playerUnits.map((unit) => ({ ...unit, position: { x: unit.position.x, y: unit.position.y + 20 } })),
    ...eastDefense,
    { type: "spear_ashigaru", position: { x: 121, y: 56 }, owner: "enemy" },
    { type: "archer", position: { x: 123, y: 59 }, owner: "enemy" },
    { type: "sword_ashigaru", position: { x: 121, y: 64 }, owner: "enemy" },
    { type: "engineer", position: { x: 124, y: 62 }, owner: "enemy" },
  ],
  waves: [
    { tick: 3000, spawns: [
      { type: "spear_ashigaru", position: { x: 122, y: 57 } }, { type: "spear_ashigaru", position: { x: 122, y: 63 } },
      { type: "archer", position: { x: 124, y: 60 } }, { type: "supply_cart", position: { x: 126, y: 61 } },
    ] },
    { tick: 8000, spawns: [
      { type: "spear_ashigaru", position: { x: 121, y: 56 } }, { type: "sword_ashigaru", position: { x: 121, y: 62 } },
      { type: "archer", position: { x: 123, y: 66 } }, { type: "engineer", position: { x: 124, y: 59 } },
      { type: "supply_cart", position: { x: 126, y: 62 } },
    ] },
    { tick: 14000, spawns: [
      { type: "sword_ashigaru", position: { x: 121, y: 55 } }, { type: "spear_ashigaru", position: { x: 121, y: 60 } },
      { type: "musketeer", position: { x: 123, y: 64 } }, { type: "cavalry", position: { x: 124, y: 68 } },
      { type: "engineer", position: { x: 125, y: 58 } }, { type: "supply_cart", position: { x: 126, y: 62 } },
    ] },
  ],
  victory: { holdTicks: 24000 },
};
