import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type sharpType from "sharp";

interface AssetRequest {
  readonly id: string;
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly kind: "terrain" | "unit" | "building";
}

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../../../../../packages/asset-tools/package.json"));
const sharp = require("sharp") as typeof sharpType;

const assets: readonly AssetRequest[] = [
  ["terrain.grass.base", "terrain-grass-base.png", 64, 32, "terrain"],
  ["terrain.dirt.base", "terrain-dirt-base.png", 64, 32, "terrain"],
  ["terrain.water.base", "terrain-water-base.png", 64, 32, "terrain"],
  ["terrain.stone.base", "terrain-stone-base.png", 64, 32, "terrain"],
  ["terrain.grass.variant.1", "terrain-grass-variant-1.png", 64, 32, "terrain"],
  ["terrain.dirt.variant.1", "terrain-dirt-variant-1.png", 64, 32, "terrain"],
  ["unit.ashigaru.idle.south", "unit-ashigaru-idle-south.png", 48, 64, "unit"],
  ["unit.ashigaru.move.south", "unit-ashigaru-move-south.png", 48, 64, "unit"],
  ["unit.ashigaru.idle.north", "unit-ashigaru-idle-north.png", 48, 64, "unit"],
  ["unit.ashigaru.idle.east", "unit-ashigaru-idle-east.png", 48, 64, "unit"],
  ["unit.ashigaru.idle.west", "unit-ashigaru-idle-west.png", 48, 64, "unit"],
  ["building.storehouse", "building-storehouse.png", 96, 80, "building"],
  ["building.market", "building-market.png", 96, 80, "building"],
  ["building.barracks", "building-barracks.png", 96, 80, "building"],
  ["building.samurai_residence", "building-samurai-residence.png", 96, 80, "building"],
  ["building.town_block", "building-town-block.png", 96, 80, "building"],
  ["building.tenshu.test", "building-tenshu-test.png", 112, 104, "building"],
  ["building.farm", "building-farm.png", 64, 32, "building"],
  ["building.road", "building-road.png", 64, 32, "building"],
  ["building.earth_bridge", "building-earth-bridge.png", 64, 32, "building"],
  ["building.wood_bridge", "building-wood-bridge.png", 64, 32, "building"],
  ["building.fence.wood", "building-fence-wood.png", 64, 64, "building"],
  ["building.wall.plaster", "building-wall-plaster.png", 64, 72, "building"],
  ["building.gate.wood.closed", "building-gate-wood-closed.png", 80, 80, "building"],
  ["building.gate.wood.closed.width2", "building-gate-wood-closed-width2.png", 128, 80, "building"],
  ["building.gate.wood.closed.width3", "building-gate-wood-closed-width3.png", 192, 80, "building"],
  ["building.dry_moat", "building-dry-moat.png", 64, 32, "building"],
  ["building.water_moat", "building-water-moat.png", 64, 32, "building"]
].map(([id, output, width, height, kind]) => ({ id, output, width, height, kind }) as AssetRequest);

await mkdir(here, { recursive: true });
for (const asset of assets) {
  await sharp(Buffer.from(renderSvg(asset))).png().toFile(join(here, asset.output));
}

function renderSvg(asset: AssetRequest): string {
  if (asset.kind === "terrain") {
    return svg(asset.width, asset.height, terrain(asset));
  }
  if (asset.kind === "unit") {
    return svg(asset.width, asset.height, ashigaru(asset));
  }
  return svg(asset.width, asset.height, building(asset));
}

function terrain(asset: AssetRequest): string {
  const palette = terrainPalette(asset.id);
  const diamond = "32,1 63,16 32,31 1,16";
  return `<defs>
<clipPath id="clip"><polygon points="${diamond}"/></clipPath>
<linearGradient id="light" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${palette.light}"/>
<stop offset="0.55" stop-color="${palette.base}"/>
<stop offset="1" stop-color="${palette.dark}"/>
</linearGradient>
</defs>
<polygon points="${diamond}" fill="url(#light)" stroke="${palette.stroke}" stroke-width="1.5"/>
<g clip-path="url(#clip)">
${terrainMarks(asset.id, palette)}
</g>
<path d="M2 16 L32 31 L62 16" fill="none" stroke="rgba(0,0,0,0.20)" stroke-width="1.2"/>`;
}

function terrainPalette(id: string): { base: string; light: string; dark: string; stroke: string } {
  if (id.includes("water")) return { base: "#2f6f7c", light: "#5592a0", dark: "#1f4d5a", stroke: "#173844" };
  if (id.includes("stone")) return { base: "#77796f", light: "#a2a297", dark: "#4d504b", stroke: "#393b36" };
  if (id.includes("dirt")) return { base: "#816743", light: "#a48859", dark: "#57422a", stroke: "#443321" };
  return { base: "#496b3d", light: "#688a55", dark: "#2d472b", stroke: "#233821" };
}

function terrainMarks(id: string, palette: ReturnType<typeof terrainPalette>): string {
  if (id.includes("water")) {
    return `<path d="M-2 14 C10 7, 20 20, 32 14 S52 8, 67 15" fill="none" stroke="rgba(210,240,246,0.54)" stroke-width="1.6"/>
<path d="M4 21 C16 15, 25 25, 38 20 S55 17, 66 21" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.1"/>`;
  }
  if (id.includes("stone")) {
    return `<path d="M8 15 L20 10 L31 16 L44 10 L58 16 M15 22 L28 17 L40 22 L54 17" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>
<path d="M12 18 L24 24 M31 13 L43 18 M45 20 L58 24" stroke="rgba(0,0,0,0.26)" stroke-width="1.1"/>`;
  }
  if (id.includes("dirt")) {
    return `<path d="M8 17 L21 10 L35 17 L49 11 L61 17 M11 23 L25 17 L38 22 L53 17" fill="none" stroke="rgba(54,38,22,0.30)" stroke-width="1.4"/>
<path d="M16 15 L25 12 M36 15 L45 12 M28 22 L37 19" stroke="rgba(230,205,145,0.14)" stroke-width="1.2"/>`;
  }
  return `<path d="M8 16 q7 -6 16 -1 M25 21 q9 4 18 -1 M39 13 q8 -4 18 1" fill="none" stroke="rgba(210,230,160,0.14)" stroke-width="1.3"/>
<path d="M13 21 q8 -3 16 0 M36 17 q8 2 17 -1" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>`;
}

function ashigaru(asset: AssetRequest): string {
  const facing = asset.id.endsWith("north") ? "north" : asset.id.endsWith("east") ? "east" : asset.id.endsWith("west") ? "west" : "south";
  const shift = facing === "east" ? 2 : facing === "west" ? -2 : 0;
  const flagX = facing === "west" ? 10 : 38;
  const spearX = facing === "west" ? 13 : 34;
  const face = facing === "north" ? "#8c6a4a" : "#d6ae78";
  const foot = asset.id.includes("move") ? 3 : 0;
  return `<ellipse cx="24" cy="55" rx="14" ry="5" fill="rgba(0,0,0,0.30)"/>
<path d="M${spearX} 8 L${spearX - 8} 59" stroke="#2a2118" stroke-width="2.2" stroke-linecap="round"/>
<path d="M${spearX} 7 l4 9 l-7 -1 Z" fill="#d8d0b9" stroke="#2a2118" stroke-width="1"/>
<path d="M${flagX} 14 l0 15 l-12 -5 l0 -10 Z" fill="#8b2f2b" stroke="#2b2119" stroke-width="1.2"/>
<path d="M${16 + shift} 36 L${24 + shift} 25 L${32 + shift} 36 L${30 + shift} 50 L${18 + shift} 50 Z" fill="#cfc7ae" stroke="#2a2722" stroke-width="1.7"/>
<path d="M${17 + shift} 39 L${31 + shift} 39" stroke="#73302b" stroke-width="2.4"/>
<circle cx="${24 + shift}" cy="21" r="6.6" fill="${face}" stroke="#2a2722" stroke-width="1.5"/>
<path d="M${15 + shift} 18 q9 -10 18 0 q-9 5 -18 0 Z" fill="#343129" stroke="#211e1a" stroke-width="1.2"/>
<path d="M${19 + shift} 50 L${17 + shift - foot} 60 M${29 + shift} 50 L${31 + shift + foot} 60" stroke="#2a2722" stroke-width="2.4" stroke-linecap="round"/>
<path d="M${17 + shift - foot} 60 L${13 + shift - foot} 60 M${31 + shift + foot} 60 L${35 + shift + foot} 60" stroke="#2a2722" stroke-width="1.8" stroke-linecap="round"/>`;
}

function building(asset: AssetRequest): string {
  if (asset.id.includes("farm")) return flatTile("#8a7240", "#4d3b22", farmMarks());
  if (asset.id.includes("road")) return flatTile("#756044", "#4a3925", roadMarks());
  if (asset.id.includes("earth_bridge")) return flatTile("#8a6840", "#4a3925", earthBridgeMarks());
  if (asset.id.includes("wood_bridge")) return flatTile("#8a5f35", "#2f2116", woodBridgeMarks());
  if (asset.id.includes("dry_moat")) return flatTile("#715637", "#3f2c1f", dryMoatMarks());
  if (asset.id.includes("water_moat")) return flatTile("#285f70", "#1c3d49", waterMoatMarks());
  if (asset.id.includes("fence")) return fence();
  if (asset.id.includes("wall")) return wall(asset.width, asset.height);
  if (asset.id.includes("gate")) return gate(asset.width, asset.height);
  if (asset.id.includes("tenshu")) return tenshu();
  if (asset.id.includes("market")) return house("#b4874d", "#b94b3f", "market");
  if (asset.id.includes("barracks")) return house("#927247", "#46515c", "barracks");
  if (asset.id.includes("samurai")) return house("#a47b49", "#4f5962", "residence");
  if (asset.id.includes("town")) return townBlock();
  return house("#9b7a4a", "#3c4650", "storehouse");
}

function flatTile(fill: string, stroke: string, marks: string): string {
  const diamond = "32,1 63,16 32,31 1,16";
  return `<defs><clipPath id="clip"><polygon points="${diamond}"/></clipPath></defs>
<polygon points="${diamond}" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>
<g clip-path="url(#clip)">${marks}</g>
<path d="M2 16 L32 31 L62 16" fill="none" stroke="rgba(0,0,0,0.20)" stroke-width="1.2"/>`;
}

function farmMarks(): string {
  return `<path d="M-4 18 L28 2 M8 26 L46 7 M26 31 L67 11" stroke="rgba(255,255,255,0.15)" stroke-width="1.6"/>
<path d="M2 14 L33 29 M17 7 L55 25 M35 3 L67 18" stroke="rgba(58,42,24,0.34)" stroke-width="1.6"/>`;
}

function roadMarks(): string {
  return `<path d="M5 18 L32 7 L59 18" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.7"/>
<path d="M12 22 L32 13 L53 22" fill="none" stroke="rgba(0,0,0,0.20)" stroke-width="1.4"/>`;
}

function earthBridgeMarks(): string {
  return `<path d="M3 16 L32 5 L61 16 L32 28 Z" fill="#9a7548" stroke="#4a3925" stroke-width="1.4"/>
<path d="M9 20 L32 11 L55 20" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="1.5"/>`;
}

function woodBridgeMarks(): string {
  return `<path d="M4 16 L32 5 L60 16 L32 28 Z" fill="#8a5f35" stroke="#2f2116" stroke-width="1.6"/>
<path d="M10 15 L32 7 L54 15 M10 20 L32 12 L54 20 M14 24 L32 17 L50 24" fill="none" stroke="rgba(255,255,255,0.13)" stroke-width="1.4"/>
<path d="M16 10 L42 23 M24 7 L52 19 M8 16 L35 28" stroke="#2f2116" stroke-width="1.8" stroke-linecap="round"/>`;
}

function dryMoatMarks(): string {
  return `<path d="M6 22 L32 9 L58 22" fill="none" stroke="rgba(43,30,19,0.48)" stroke-width="7" stroke-linecap="round"/>
<path d="M8 16 L32 5 L56 16" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.7"/>`;
}

function waterMoatMarks(): string {
  return `<path d="M6 22 L32 9 L58 22" fill="none" stroke="rgba(147,215,229,0.70)" stroke-width="7" stroke-linecap="round"/>
<path d="M8 16 C18 11, 24 21, 32 16 S47 11, 56 16" fill="none" stroke="rgba(255,255,255,0.30)" stroke-width="1.5"/>`;
}

function house(fill: string, roof: string, type: string): string {
  const detail =
    type === "market"
      ? `<path d="M20 39 L35 30 L50 38 L65 30 L78 39" fill="none" stroke="#b94b3f" stroke-width="5" stroke-linejoin="round"/><circle cx="34" cy="61" r="2.5" fill="#d8bd75"/>`
      : type === "barracks"
        ? `<path d="M22 37 L15 31 M29 34 L22 28 M74 37 L82 31 M67 34 L74 28" stroke="#d6ccb1" stroke-width="1.8" stroke-linecap="round"/>`
        : type === "residence"
          ? `<path d="M22 49 L32 54 M64 54 L75 49" stroke="rgba(255,255,255,0.18)" stroke-width="1.4"/>`
          : `<path d="M32 49 L43 55 L43 67 L32 61 Z M53 55 L64 49 L64 61 L53 67 Z" fill="#3f2b1b" stroke="#473322" stroke-width="1.3"/>`;
  return `<ellipse cx="48" cy="66" rx="31" ry="8" fill="rgba(0,0,0,0.25)"/>
<polygon points="18,40 48,24 78,40 48,57" fill="${fill}" stroke="#473322" stroke-width="1.8"/>
<polygon points="18,40 48,57 48,71 18,56" fill="${fill}" opacity="0.88" stroke="#473322" stroke-width="1.8"/>
<polygon points="78,40 48,57 48,71 78,56" fill="${fill}" opacity="0.72" stroke="#473322" stroke-width="1.8"/>
<path d="M19 56 L48 71 L77 56" fill="none" stroke="rgba(42,31,21,0.38)" stroke-width="2.4"/>
<polygon points="25,34 48,20 71,34 48,47" fill="${roof}" stroke="#473322" stroke-width="1.8"/>
${detail}`;
}

function townBlock(): string {
  return `<ellipse cx="48" cy="63" rx="35" ry="8" fill="rgba(0,0,0,0.22)"/>
<polygon points="14,44 30,34 46,44 30,54" fill="#ad8350" stroke="#463221" stroke-width="1.4"/>
<polygon points="30,34 48,25 66,34 48,45" fill="#b18a57" stroke="#463221" stroke-width="1.4"/>
<polygon points="50,46 68,35 84,45 66,56" fill="#a37a48" stroke="#463221" stroke-width="1.4"/>
<polygon points="18,39 30,31 42,39 30,46" fill="#4d5962" stroke="#463221" stroke-width="1.4"/>
<polygon points="36,31 48,23 61,31 48,39" fill="#6b4535" stroke="#463221" stroke-width="1.4"/>
<polygon points="56,40 68,32 80,40 67,48" fill="#4f5962" stroke="#463221" stroke-width="1.4"/>`;
}

function fence(): string {
  return `<ellipse cx="32" cy="49" rx="25" ry="7" fill="rgba(0,0,0,0.25)"/>
<path d="M11 33 L32 22 L53 33" fill="none" stroke="#2f2116" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M13 31 L32 22 L51 31" fill="none" stroke="#8a5f35" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M16 29 L16 42 M25 25 L25 47 M34 24 L34 49 M43 28 L43 44 M51 32 L51 39" stroke="#3a2b1b" stroke-width="2.8" stroke-linecap="round"/>
<path d="M16 28 L16 40 M25 24 L25 45 M34 23 L34 47 M43 27 L43 42 M51 31 L51 38" stroke="#8a5f35" stroke-width="1.5" stroke-linecap="round"/>`;
}

function wall(width: number, height: number): string {
  const cx = width / 2;
  return `<ellipse cx="${cx}" cy="${height - 14}" rx="27" ry="7" fill="rgba(0,0,0,0.28)"/>
<polygon points="${cx - 22},39 ${cx},27 ${cx + 22},39 ${cx},51" fill="#ded9c5" stroke="#3f3a31" stroke-width="1.8"/>
<polygon points="${cx - 22},39 ${cx},51 ${cx},66 ${cx - 22},54" fill="#d4d0be" stroke="#3f3a31" stroke-width="1.8"/>
<polygon points="${cx + 22},39 ${cx},51 ${cx},66 ${cx + 22},54" fill="#bdb8a6" stroke="#3f3a31" stroke-width="1.8"/>
<path d="M${cx - 21} 54 L${cx} 66 L${cx + 21} 54" fill="none" stroke="rgba(35,28,21,0.45)" stroke-width="2.5"/>
<polygon points="${cx - 24},35 ${cx},22 ${cx + 24},35 ${cx},48" fill="#59616a" stroke="#3f3a31" stroke-width="1.8"/>`;
}

function gate(width: number, height: number): string {
  const cx = width / 2;
  const left = Math.max(12, width * 0.12);
  const right = width - left;
  const roofY = height - 58;
  const bodyY = height - 41;
  const baseY = height - 11;
  return `<ellipse cx="${cx}" cy="${height - 14}" rx="${width / 2 - 8}" ry="8" fill="rgba(0,0,0,0.30)"/>
<polygon points="${left},${bodyY} ${cx},${roofY} ${right},${bodyY} ${cx},${bodyY + 18}" fill="#3c4650" stroke="#2f2116" stroke-width="1.8"/>
<path d="M${left + 7} ${bodyY + 4} L${left + 7} ${baseY} M${right - 7} ${bodyY + 4} L${right - 7} ${baseY}" stroke="#3b2618" stroke-width="7" stroke-linecap="round"/>
<path d="M${left + 10} ${bodyY + 4} L${left + 10} ${baseY - 1} M${right - 10} ${bodyY + 4} L${right - 10} ${baseY - 1}" stroke="#8a5a34" stroke-width="3" stroke-linecap="round"/>
<path d="M${left + 20} ${bodyY + 14} L${right - 20} ${bodyY + 14}" stroke="#2f2116" stroke-width="7" stroke-linecap="round"/>
<path d="M${left + 20} ${bodyY + 14} L${right - 20} ${bodyY + 14}" stroke="#8a5a34" stroke-width="3.5" stroke-linecap="round"/>
<path d="M${cx} ${bodyY + 8} L${cx} ${baseY}" stroke="#4d3321" stroke-width="3.5"/>`;
}

function tenshu(): string {
  return `<ellipse cx="56" cy="91" rx="42" ry="10" fill="rgba(0,0,0,0.30)"/>
<polygon points="19,62 56,42 93,62 56,82" fill="#ddd8c8" stroke="#332f29" stroke-width="2"/>
<polygon points="19,62 56,82 56,96 19,76" fill="#d0cbb8" stroke="#332f29" stroke-width="1.8"/>
<polygon points="93,62 56,82 56,96 93,76" fill="#b8b19f" stroke="#332f29" stroke-width="1.8"/>
<path d="M20 76 L56 96 L92 76" fill="none" stroke="rgba(35,28,21,0.42)" stroke-width="2.8"/>
<polygon points="22,55 56,36 90,55 56,74" fill="#323b44" stroke="#332f29" stroke-width="2"/>
<polygon points="30,39 56,24 82,39 56,54" fill="#ddd8c8" stroke="#332f29" stroke-width="1.8"/>
<polygon points="32,34 56,20 80,34 56,47" fill="#323b44" stroke="#332f29" stroke-width="1.8"/>
<polygon points="39,21 56,11 73,21 56,31" fill="#ddd8c8" stroke="#332f29" stroke-width="1.6"/>
<polygon points="41,18 56,9 71,18 56,27" fill="#323b44" stroke="#332f29" stroke-width="1.6"/>`;
}

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
