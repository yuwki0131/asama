// Generates three realistic castle-map scenes as JSON for the composer.
// Run from apps/game with: node --import tsx build-layouts.mjs
import { buildingSpecs } from "@asama/content";
import { writeFileSync } from "fs";

const W = 46;
const H = 44;

const FOOT = Object.fromEntries(
  Object.values(buildingSpecs).map((s) => [s.type, s.footprint])
);

function hash(x, y, salt) {
  let v = (x * 374761393 + y * 668265263 + salt * 2246822519) >>> 0;
  v = (v ^ (v >>> 13)) >>> 0;
  v = Math.imul(v, 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 0x100000000;
}

class Scene {
  constructor(name) {
    this.name = name;
    this.terrain = Array.from({ length: H }, () => Array(W).fill("grass"));
    this.kits = new Map(); // "x,y" -> kit name (wall|fence|road|dry_moat|water_moat)
    this.buildings = []; // {assetId, type, footprint}
    this.decos = []; // {assetId, x, y}
    this.occupied = new Set();
  }
  setTerrain(x, y, t) {
    if (x >= 0 && y >= 0 && x < W && y < H) this.terrain[y][x] = t;
  }
  kit(x, y, kind) {
    if (x >= 0 && y >= 0 && x < W && y < H) {
      this.kits.set(`${x},${y}`, kind);
      this.occupied.add(`${x},${y}`);
    }
  }
  kitRect(x0, y0, x1, y1, kind, hollow = true) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (hollow && x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
        this.kit(x, y, kind);
      }
  }
  kitLine(x0, y0, x1, y1, kind) {
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    let x = x0;
    let y = y0;
    for (;;) {
      this.kit(x, y, kind);
      if (x === x1 && y === y1) break;
      if (x !== x1) x += dx;
      else y += dy;
    }
  }
  clearKit(x, y) {
    this.kits.delete(`${x},${y}`);
  }
  building(type, assetId, sx, sy) {
    const f = FOOT[type] ?? { width: 1, height: 1 };
    const cells = [];
    for (let dy = 0; dy < f.height; dy++)
      for (let dx = 0; dx < f.width; dx++) {
        cells.push({ x: sx + dx, y: sy + dy });
        this.occupied.add(`${sx + dx},${sy + dy}`);
      }
    this.buildings.push({ assetId, type, footprint: cells });
  }
  gate(orientation, sx, sy) {
    // width-3 gates; nw_se spans x, ne_sw spans y. Remove wall cells under it.
    const type = orientation === "nw_se" ? "gate_wide_3" : "gate_wide_3_ne_sw";
    const mask = orientation === "nw_se" ? "0101" : "1010";
    const assetId = `building.gate.wood.closed.${orientation}.width3.connected.${mask}`;
    const cells = [];
    for (let i = 0; i < 3; i++) {
      const x = orientation === "nw_se" ? sx + i : sx;
      const y = orientation === "nw_se" ? sy : sy + i;
      this.clearKit(x, y);
      cells.push({ x, y });
      this.occupied.add(`${x},${y}`);
    }
    this.buildings.push({ assetId, type, footprint: cells });
  }
  deco(assetId, x, y) {
    if (this.occupied.has(`${x},${y}`)) return;
    if (this.terrain[y]?.[x] !== "grass") return;
    this.decos.push({ assetId, x, y });
    this.occupied.add(`${x},${y}`);
  }
  grove(cx, cy, r, species, density, salt) {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        if (hash(x, y, salt) < density) {
          const pick = species[Math.floor(hash(x, y, salt + 1) * species.length)];
          this.deco(pick, x, y);
        }
      }
  }
  sprinkle(salt) {
    // Ambient bushes and weeds over remaining grass.
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const r = hash(x, y, salt);
        if (r < 0.012) this.deco("deco.bush.1", x, y);
        else if (r < 0.045) this.deco("deco.weeds.1", x, y);
      }
    // Reeds along water.
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        if (this.terrain[y][x] !== "grass") continue;
        const nearWater = [this.terrain[y][x + 1], this.terrain[y][x - 1], this.terrain[y + 1]?.[x], this.terrain[y - 1]?.[x]].includes("water");
        if (nearWater && hash(x, y, salt + 9) < 0.5) this.deco("deco.reeds.1", x, y);
      }
  }
  serialize() {
    // Terrain assetIds via NESW same-terrain mask.
    const cells = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = this.terrain[y][x];
        const mask = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ]
          .map(([dx, dy]) => {
            const nt = this.terrain[y + dy]?.[x + dx];
            return nt === undefined ? "0" : nt === t ? "1" : "0";
          })
          .join("");
        if (mask === "1111" && t !== "stone") {
          const bx = x >> 2;
          const by = y >> 2;
          let h = (bx * 374761393 + by * 668265263 + 1013904223) >>> 0;
          h = (h ^ (h >>> 13)) >>> 0;
          cells.push({ x, y, assetId: `terrain.${t}.macro.v${h % 2}.${x % 4}.${y % 4}` });
        } else if (t === "water") {
          let h = (x * 374761393 + y * 668265263 + 40503) >>> 0;
          h = (h ^ (h >>> 13)) >>> 0;
          const pick = h % 3;
          cells.push({ x, y, assetId: pick === 0 ? `terrain.water.connected.${mask}` : `terrain.water.connected.${mask}.v${pick}` });
        } else {
          cells.push({ x, y, assetId: `terrain.${t}.connected.${mask}` });
        }
      }
    // Kit assetIds via NESW same-kit mask (gates count as connectors for walls/fences).
    const kitAsset = { wall: "building.wall.plaster", fence: "building.fence.wood", road: "building.road", dry_moat: "building.dry_moat", water_moat: "building.water_moat" };
    const gateCells = new Set(this.buildings.filter((b) => b.type.startsWith("gate")).flatMap((b) => b.footprint.map((c) => `${c.x},${c.y}`)));
    const kitBuildings = [];
    for (const [key, kind] of this.kits) {
      const [x, y] = key.split(",").map(Number);
      const mask = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]
        .map(([dx, dy]) => {
          const nk = this.kits.get(`${x + dx},${y + dy}`);
          if (nk === kind) return "1";
          if ((kind === "wall" || kind === "fence") && gateCells.has(`${x + dx},${y + dy}`)) return "1";
          if (kind === "road" && this.buildings.some((b) => (b.type === "earth_bridge" || b.type === "wood_bridge") && b.footprint.some((c) => c.x === x + dx && c.y === y + dy))) return "1";
          return "0";
        })
        .join("");
      let kitAssetId = `${kitAsset[kind]}.connected.${mask}`;
      if (kind === "dry_moat" || kind === "water_moat") {
        if (mask === "0101") {
          const phase = ((x % 4) + 4) % 4;
          if (phase !== 0) kitAssetId += `.p${phase}`;
        } else if (mask === "1010") {
          const phase = ((y % 4) + 4) % 4;
          if (phase !== 0) kitAssetId += `.p${phase}`;
        } else {
          let h = (x * 374761393 + y * 668265263 + 77003) >>> 0;
          h = (h ^ (h >>> 13)) >>> 0;
          if (h % 2 === 1) kitAssetId += ".v1";
        }
      }
      kitBuildings.push({ assetId: kitAssetId, type: kind === "wall" ? "wall" : kind === "fence" ? "fence" : kind, footprint: [{ x, y }] });
    }
    return { cells, buildings: [...kitBuildings, ...this.buildings], decos: this.decos.map((d) => ({ assetId: d.assetId, position: { x: d.x, y: d.y } })) };
  }
}

const PINES = ["deco.tree.pine.1", "deco.tree.pine.2"];
const MIXED = ["deco.tree.pine.1", "deco.tree.pine.2", "deco.tree.broadleaf.1", "deco.tree.cedar.1"];
const CEDARS = ["deco.tree.cedar.1", "deco.tree.cedar.1", "deco.tree.broadleaf.1"];

// ---------------------------------------------------------------- Pattern A
// Concentric hirajiro: honmaru + water moat ring + ninomaru, main road south
// through the town, farms SE, pine grove W, river E.
function patternA() {
  const s = new Scene("A");
  // River along the east edge.
  for (let y = 0; y < H; y++) {
    const cx = 41 + Math.round(1.5 * Math.sin(y / 6));
    for (let x = cx; x < Math.min(W, cx + 3); x++) s.setTerrain(x, y, "water");
  }
  // Honmaru: walls 14..24 x 8..17, tenshu + marker inside.
  s.kitRect(14, 8, 24, 17, "wall");
  s.gate("nw_se", 18, 17);
  s.building("tenshu", "building.tenshu.test", 17, 10);
  s.building("honmaru", "building.honmaru.marker", 21, 14);
  // Water moat ring around honmaru.
  s.kitRect(12, 6, 26, 19, "water_moat");
  s.building("earth_bridge", "building.earth_bridge", 19, 19);
  s.clearKit(19, 19);
  s.clearKit(18, 19);
  s.clearKit(20, 19);
  s.kit(18, 19, "water_moat");
  s.kit(20, 19, "water_moat");
  // Ninomaru fence ring with south gate.
  s.kitRect(8, 3, 32, 25, "fence");
  s.gate("nw_se", 18, 25);
  // Ninomaru content.
  s.building("yagura", "building.yagura.small.normal", 9, 4);
  s.building("yagura", "building.yagura.small.normal", 28, 4);
  s.building("storehouse", "building.storehouse", 9, 10);
  s.building("storehouse", "building.storehouse", 9, 14);
  s.building("barracks", "building.barracks", 27, 10);
  s.building("samurai_residence", "building.samurai_residence", 27, 15);
  // Main road from the honmaru gate through town to the map edge.
  for (let y = 18; y < H; y++) s.kit(19, y, "road");
  s.clearKit(19, 19);
  for (let x = 8; x < 19; x++) s.kit(x, 33, "road");
  for (let x = 20; x < 34; x++) s.kit(x, 33, "road");
  // Town: machiya blocks flanking the road, market at the crossroads.
  s.building("town_block", "building.town_block", 12, 27);
  s.building("town_block", "building.town_block", 21, 27);
  s.building("town_block", "building.town_block", 12, 35);
  s.building("town_block", "building.town_block", 21, 35);
  s.building("market", "building.market", 28, 29);
  s.building("samurai_residence", "building.samurai_residence", 3, 27);
  // Farms SE and SW of town.
  s.building("farm", "building.farm", 29, 36);
  s.building("farm", "building.farm", 34, 33);
  s.building("farm", "building.farm", 3, 36);
  // Groves: pines west, cedar shrine wood north, roadside pines.
  s.grove(4, 12, 4, PINES, 0.5, 11);
  s.grove(4, 19, 3, PINES, 0.45, 12);
  s.grove(20, 1, 6, CEDARS, 0.35, 13);
  for (const y of [21, 23]) {
    s.deco("deco.tree.pine.1", 17, y);
    s.deco("deco.tree.pine.2", 21, y);
  }
  s.grove(36, 20, 3, MIXED, 0.4, 14);
  s.grove(6, 41, 3, ["deco.bamboo.1"], 0.5, 15);
  s.sprinkle(21);
  return s;
}

// ---------------------------------------------------------------- Pattern B
// Renkaku-shiki: two baileys chained on a diagonal with dry moats between,
// dense forest north, town SE along the road, farms on the south floodplain.
function patternB() {
  const s = new Scene("B");
  // South river / floodplain.
  for (let x = 0; x < W; x++) {
    const cy = 39 + Math.round(1.2 * Math.sin(x / 5));
    for (let y = cy; y < Math.min(H, cy + 3); y++) s.setTerrain(x, y, "water");
  }
  // Honmaru NW.
  s.kitRect(4, 4, 14, 13, "wall");
  s.gate("ne_sw", 14, 8);
  s.building("tenshu", "building.tenshu.test", 6, 6);
  s.building("honmaru", "building.honmaru.marker", 10, 10);
  // Dry moat between honmaru and ninomaru.
  s.kitLine(16, 2, 16, 16, "dry_moat");
  s.kitLine(17, 2, 17, 16, "dry_moat");
  s.building("earth_bridge", "building.earth_bridge", 16, 9);
  s.building("earth_bridge", "building.earth_bridge", 17, 9);
  s.clearKit(16, 9);
  s.clearKit(17, 9);
  // Ninomaru: fence compound with military quarter.
  s.kitRect(19, 3, 33, 16, "fence");
  s.gate("ne_sw", 33, 8);
  s.building("yagura", "building.yagura.small.normal", 20, 4);
  s.building("yagura", "building.yagura.small.normal", 30, 13);
  s.building("barracks", "building.barracks", 21, 8);
  s.building("storehouse", "building.storehouse", 27, 4);
  s.building("storehouse", "building.storehouse", 21, 12);
  // Road east from ninomaru gate, turning south into the town.
  for (let x = 34; x < 38; x++) s.kit(x, 9, "road");
  for (let y = 9; y < 34; y++) s.kit(37, y, "road");
  for (let x = 24; x < 37; x++) s.kit(x, 26, "road");
  // Town SE.
  s.building("town_block", "building.town_block", 30, 19);
  s.building("town_block", "building.town_block", 30, 28);
  s.building("market", "building.market", 24, 21);
  s.building("samurai_residence", "building.samurai_residence", 24, 29);
  s.building("samurai_residence", "building.samurai_residence", 19, 20);
  // Farms along the floodplain.
  s.building("farm", "building.farm", 5, 32);
  s.building("farm", "building.farm", 10, 34);
  s.building("farm", "building.farm", 16, 32);
  s.building("wood_bridge", "building.wood_bridge", 37, 39);
  s.building("wood_bridge", "building.wood_bridge", 37, 40);
  s.building("wood_bridge", "building.wood_bridge", 37, 41);
  // Deep mixed forest north band + scattered rocks.
  s.grove(8, 1, 5, MIXED, 0.5, 31);
  s.grove(22, 0, 6, CEDARS, 0.5, 32);
  s.grove(40, 3, 5, MIXED, 0.45, 33);
  s.grove(2, 22, 4, PINES, 0.4, 34);
  s.deco("deco.rock.1", 3, 16);
  s.deco("deco.rock.1", 40, 14);
  s.deco("deco.rock.1", 12, 20);
  s.grove(42, 25, 3, ["deco.bamboo.1"], 0.5, 35);
  s.sprinkle(41);
  return s;
}

// ---------------------------------------------------------------- Pattern C
// River castle with a temple-town across the water: the river is the moat,
// a wood bridge links castle bank and town bank.
function patternC() {
  const s = new Scene("C");
  // Diagonal river.
  for (let y = 0; y < H; y++) {
    const cx = 24 - Math.round(y * 0.25) + Math.round(1.4 * Math.sin(y / 4.5));
    for (let x = cx; x < Math.min(W, cx + 4); x++) s.setTerrain(x, y, "water");
  }
  // Castle west bank: honmaru walls with river to the east.
  s.kitRect(5, 6, 16, 16, "wall");
  s.gate("nw_se", 9, 16);
  s.building("tenshu", "building.tenshu.test", 7, 8);
  s.building("honmaru", "building.honmaru.marker", 12, 12);
  // Dry moat guarding the west approach.
  s.kitLine(3, 4, 3, 18, "dry_moat");
  s.kitLine(4, 4, 4, 18, "dry_moat");
  // Outer fence yard with yagura + stores.
  s.kitRect(2, 2, 19, 22, "fence");
  s.gate("nw_se", 9, 22);
  s.building("yagura", "building.yagura.small.normal", 16, 3);
  s.building("yagura", "building.yagura.small.normal", 5, 18);
  s.building("storehouse", "building.storehouse", 12, 18);
  s.building("barracks", "building.barracks", 14, 3);
  // Road from castle gate south then east to the bridge.
  for (let y = 23; y < 27; y++) s.kit(10, y, "road");
  for (let x = 10; x < 18; x++) s.kit(x, 26, "road");
  // Bridge over the river (three wood bridge tiles).
  for (let x = 18; x < 23; x++) {
    if (s.terrain[26][x] === "water") s.building("wood_bridge", "building.wood_bridge", x, 26);
    else s.kit(x, 26, "road");
  }
  for (let x = 23; x < 40; x++) s.kit(x, 26, "road");
  // Town east bank.
  s.building("market", "building.market", 24, 22);
  s.building("town_block", "building.town_block", 30, 19);
  s.building("town_block", "building.town_block", 30, 28);
  s.building("town_block", "building.town_block", 23, 28);
  s.building("samurai_residence", "building.samurai_residence", 24, 15);
  // Farms both banks upriver.
  s.building("farm", "building.farm", 5, 27);
  s.building("farm", "building.farm", 3, 32);
  s.building("farm", "building.farm", 33, 8);
  s.building("farm", "building.farm", 38, 12);
  // Groves.
  s.grove(2, 40, 4, PINES, 0.45, 51);
  s.grove(14, 36, 4, MIXED, 0.4, 52);
  s.grove(40, 2, 5, CEDARS, 0.45, 53);
  s.grove(41, 34, 4, MIXED, 0.45, 54);
  s.grove(28, 5, 3, ["deco.bamboo.1"], 0.5, 55);
  s.deco("deco.rock.1", 1, 24);
  s.deco("deco.rock.1", 43, 22);
  s.sprinkle(61);
  return s;
}

for (const scene of [patternA(), patternB(), patternC()]) {
  const out = scene.serialize();
  writeFileSync(`/tmp/claude-1000/-home-yuwki0131-workspace-asama/a2e4ecb6-ba9d-4a94-afdf-3202bc486855/scratchpad/layout-${scene.name}.json`, JSON.stringify(out));
  console.log(scene.name, "cells", out.cells.length, "buildings", out.buildings.length, "decos", out.decos.length);
}
