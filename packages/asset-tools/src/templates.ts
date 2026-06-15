import type { PlaceholderAssetSpec } from "./types";

// Placeholder/debug renderer only. Production buildings, terrain, units, and vegetation
// should enter through the Blender or approved raster pipeline.
export function renderPlaceholderSvg(asset: PlaceholderAssetSpec): string {
  if (asset.kind === "terrain") {
    return svg(asset.width, asset.height, terrainTile(asset));
  }

  if (asset.kind === "unit") {
    return svg(asset.width, asset.height, unitMarker(asset));
  }

  if (asset.kind === "building") {
    return svg(asset.width, asset.height, buildingBlock(asset));
  }

  return svg(asset.width, asset.height, overlayMarker(asset));
}

function terrainTile(asset: PlaceholderAssetSpec): string {
  const w = asset.width;
  const h = asset.height;
  const diamond = `${w / 2},1 ${w - 1},${h / 2} ${w / 2},${h - 1} 1,${h / 2}`;
  const defs = `<defs>
<linearGradient id="tileLight" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="rgba(255,255,255,0.28)"/>
<stop offset="0.52" stop-color="rgba(255,255,255,0.04)"/>
<stop offset="1" stop-color="rgba(0,0,0,0.22)"/>
</linearGradient>
<clipPath id="tileClip"><polygon points="${diamond}"/></clipPath>
</defs>`;
  const base = `${defs}
<polygon points="${diamond}" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="${diamond}" fill="url(#tileLight)" opacity="0.55"/>`;
  const edge = `<path d="M2 ${h / 2} L${w / 2} ${h - 1} L${w - 2} ${h / 2}" fill="none" stroke="rgba(0,0,0,0.24)" stroke-width="1.4"/>`;

  if (asset.pattern === "water") {
    return `${base}
<g clip-path="url(#tileClip)">
<path d="M-2 13 C8 8, 17 20, 28 14 S48 9, 68 15" fill="none" stroke="rgba(172,226,236,0.64)" stroke-width="2"/>
<path d="M2 20 C13 15, 23 25, 34 19 S51 15, 66 20" fill="none" stroke="rgba(255,255,255,0.34)" stroke-width="1.5"/>
<path d="M14 24 C22 21, 30 25, 40 22 S54 21, 60 23" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1.2"/>
</g>
${edge}`;
  }

  if (asset.pattern === "stone") {
    return `${base}
<g clip-path="url(#tileClip)">
<path d="M8 17 L20 10 L31 16 L43 9 L57 16 M14 22 L28 15 L40 21 L53 14" fill="none" stroke="rgba(255,255,255,0.20)" stroke-width="2"/>
<path d="M12 18 L25 24 M30 12 L44 18 M44 20 L58 24 M22 11 L29 16" stroke="rgba(0,0,0,0.30)" stroke-width="1.5"/>
<circle cx="36" cy="17" r="1.5" fill="rgba(255,255,255,0.16)"/>
</g>
${edge}`;
  }

  if (asset.pattern === "rough") {
    return `${base}
<g clip-path="url(#tileClip)">
<path d="M9 16 l7 -4 l5 4 l8 -5 l6 6 l8 -5 l10 4" fill="none" stroke="rgba(0,0,0,0.24)" stroke-width="2"/>
<path d="M16 22 l8 -3 l7 2 l7 -3 l9 2" fill="none" stroke="rgba(255,255,255,0.13)" stroke-width="1.5"/>
<circle cx="22" cy="16" r="1.5" fill="rgba(255,255,255,0.18)"/>
<circle cx="45" cy="18" r="1.4" fill="rgba(0,0,0,0.22)"/>
<circle cx="34" cy="21" r="1" fill="rgba(0,0,0,0.18)"/>
</g>
${edge}`;
  }

  return `${base}
<g clip-path="url(#tileClip)">
<path d="M11 16 q5 -5 12 -1 M27 20 q7 4 14 -1 M38 13 q7 -3 14 1" fill="none" stroke="rgba(255,255,255,0.13)" stroke-width="1.5"/>
<path d="M14 20 q6 -2 12 0 M35 16 q6 2 13 -1" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1.2"/>
<circle cx="24" cy="15" r="1.2" fill="rgba(238,221,148,0.32)"/>
<circle cx="43" cy="18" r="1" fill="rgba(238,221,148,0.28)"/>
</g>
${edge}`;
}

function unitMarker(asset: PlaceholderAssetSpec): string {
  const accent = asset.accent ?? asset.stroke;
  const flagX = asset.direction === "west" ? 9 : 39;
  const spearX = asset.direction === "west" ? 14 : 34;
  const bodyShift = asset.direction === "west" ? -2 : asset.direction === "east" ? 2 : 0;
  const faceShade = asset.direction === "north" ? "#8b6b4c" : "#d8b27a";
  return `<defs>
<linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#f2ecd6"/>
<stop offset="0.58" stop-color="${asset.fill}"/>
<stop offset="1" stop-color="#8f8877"/>
</linearGradient>
<linearGradient id="helmet" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#5a5142"/>
<stop offset="1" stop-color="#211d18"/>
</linearGradient>
</defs>
<ellipse cx="24" cy="55" rx="15" ry="5.5" fill="rgba(0,0,0,0.30)"/>
<path d="M${spearX} 7 L${spearX - 8} 59" stroke="#2b2117" stroke-width="2.4" stroke-linecap="round"/>
<path d="M${spearX} 6 l4 10 l-7 -1 Z" fill="#d6ccb1" stroke="#2b2117" stroke-width="1"/>
<path d="M${flagX} 14 l0 16 l-13 -5 l0 -11 Z" fill="${accent}" stroke="${asset.stroke}" stroke-width="1.4"/>
<path d="M${flagX - 11} 17 l9 3 M${flagX - 11} 23 l9 3" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>
<path d="M${16 + bodyShift} 36 L${24 + bodyShift} 24 L${32 + bodyShift} 36 L${30 + bodyShift} 51 L${18 + bodyShift} 51 Z" fill="url(#cloth)" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M${17 + bodyShift} 38 L${31 + bodyShift} 38" stroke="${accent}" stroke-width="3"/>
<path d="M${19 + bodyShift} 45 L${29 + bodyShift} 45" stroke="rgba(0,0,0,0.20)" stroke-width="1.4"/>
<circle cx="${24 + bodyShift}" cy="21" r="7.2" fill="${faceShade}" stroke="${asset.stroke}" stroke-width="1.8"/>
<path d="M${15 + bodyShift} 18 q9 -11 18 0 q-9 5 -18 0 Z" fill="url(#helmet)" stroke="${asset.stroke}" stroke-width="1.5"/>
<path d="M${16 + bodyShift} 18 q8 4 16 0" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
<path d="M${19 + bodyShift} 51 L${17 + bodyShift} 60 M${29 + bodyShift} 51 L${31 + bodyShift} 60" stroke="${asset.stroke}" stroke-width="2.8" stroke-linecap="round"/>
<path d="M${19 + bodyShift} 59 L${15 + bodyShift} 59 M${31 + bodyShift} 60 L${35 + bodyShift} 60" stroke="${asset.stroke}" stroke-width="2" stroke-linecap="round"/>`;
}

function buildingBlock(asset: PlaceholderAssetSpec): string {
  if (asset.pattern === "fence") {
    return fenceBuilding(asset);
  }
  if (asset.pattern === "wall") {
    return wallBuilding(asset);
  }
  if (asset.pattern === "gate") {
    return gateBuilding(asset);
  }
  if (asset.pattern === "wide-gate") {
    return wideGateBuilding(asset);
  }
  if (asset.pattern === "market") {
    return marketBuilding(asset);
  }
  if (asset.pattern === "barracks") {
    return barracksBuilding(asset);
  }
  if (asset.pattern === "samurai-residence") {
    return samuraiResidenceBuilding(asset);
  }
  if (asset.pattern === "town-block") {
    return townBlockBuilding(asset);
  }
  if (asset.pattern === "farm") {
    return farmTile(asset);
  }
  if (asset.pattern === "road") {
    return roadTile(asset);
  }
  if (asset.pattern === "earth-bridge") {
    return earthBridgeTile(asset);
  }
  if (asset.pattern === "wood-bridge") {
    return woodBridgeTile(asset);
  }
  if (asset.pattern === "tenshu") {
    return tenshuBuilding(asset);
  }
  if (asset.pattern === "connected-fence") {
    return connectedFenceBuilding(asset);
  }
  if (asset.pattern === "connected-wall") {
    return connectedWallBuilding(asset);
  }
  if (asset.pattern === "connected-dry-moat") {
    return connectedMoatCell(asset, false);
  }
  if (asset.pattern === "connected-water-moat") {
    return connectedMoatCell(asset, true);
  }
  if (asset.pattern === "dry-moat") {
    return moatCell(asset, false);
  }
  if (asset.pattern === "water-moat") {
    return moatCell(asset, true);
  }
  if (asset.pattern === "honmaru") {
    return honmaruMarker(asset);
  }
  return storehouseBuilding(asset);
}

function fenceBuilding(asset: PlaceholderAssetSpec): string {
  return `<ellipse cx="32" cy="48" rx="25" ry="7" fill="rgba(0,0,0,0.24)"/>
<ellipse cx="16" cy="43" rx="5" ry="2.3" fill="rgba(0,0,0,0.30)"/>
<ellipse cx="25" cy="47" rx="5" ry="2.5" fill="rgba(0,0,0,0.32)"/>
<ellipse cx="34" cy="49" rx="5.5" ry="2.7" fill="rgba(0,0,0,0.34)"/>
<ellipse cx="43" cy="44" rx="5" ry="2.3" fill="rgba(0,0,0,0.30)"/>
<ellipse cx="51" cy="39" rx="4.5" ry="2" fill="rgba(0,0,0,0.27)"/>
<polygon points="32,23 58,36 32,49 6,36" fill="rgba(90,67,40,0.18)" stroke="rgba(36,28,18,0.35)" stroke-width="1"/>
<path d="M11 33 L32 22 L53 33" fill="none" stroke="${asset.stroke}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M13 31 L32 22 L51 31" fill="none" stroke="${asset.fill}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M16 29 L16 42 M25 25 L25 46 M34 24 L34 48 M43 28 L43 43 M51 32 L51 38" stroke="#3a2b1b" stroke-width="3" stroke-linecap="round"/>
<path d="M16 28 L16 40 M25 24 L25 44 M34 23 L34 46 M43 27 L43 41 M51 31 L51 37" stroke="${asset.fill}" stroke-width="1.7" stroke-linecap="round"/>`;
}

function connectedFenceBuilding(asset: PlaceholderAssetSpec): string {
  const mask = parseMask(asset.connectionMask);
  const center = { x: 32, y: 34 };
  const points: Record<Direction, Point> = {
    n: { x: 52, y: 24 },
    e: { x: 52, y: 44 },
    s: { x: 12, y: 44 },
    w: { x: 12, y: 24 }
  };
  const dirs = connectedDirs(mask);
  const active: Direction[] = dirs;
  const rails = active
    .map((dir) => rail(center, points[dir], asset.stroke, asset.fill, 5, 3))
    .join("\n");
  const posts = uniquePoints([center, ...active.map((dir) => points[dir])])
    .map((point) => fencePost(point.x, point.y, asset.stroke, asset.fill))
    .join("\n");
  return `<ellipse cx="32" cy="50" rx="25" ry="7" fill="rgba(0,0,0,0.24)"/>
<polygon points="32,22 58,35 32,50 6,35" fill="rgba(90,67,40,0.13)" stroke="rgba(36,28,18,0.28)" stroke-width="1"/>
${rails}
${posts}`;
}

function wallBuilding(asset: PlaceholderAssetSpec): string {
  const roof = asset.accent ?? "#59616a";
  return `<ellipse cx="32" cy="57" rx="27" ry="7" fill="rgba(0,0,0,0.28)"/>
<polygon points="10,39 32,27 54,39 32,51" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="10,39 32,51 32,66 10,54" fill="#d4d0be" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="54,39 32,51 32,66 54,54" fill="#bdb8a6" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M11 54 L32 66 L53 54" fill="none" stroke="rgba(35,28,21,0.48)" stroke-width="3" stroke-linejoin="round"/>
<path d="M16 55 L32 64 L48 55" fill="none" stroke="rgba(255,255,255,0.13)" stroke-width="1.4" stroke-linejoin="round"/>
<polygon points="8,35 32,22 56,35 32,48" fill="${roof}" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M18 43 L27 48 M37 48 L48 43 M16 52 L27 58 M37 58 L49 52" stroke="rgba(0,0,0,0.20)" stroke-width="1.5"/>`;
}

function connectedWallBuilding(asset: PlaceholderAssetSpec): string {
  const mask = parseMask(asset.connectionMask);
  const center = { x: 32, y: 42 };
  const points: Record<Direction, Point> = {
    n: { x: 54, y: 30 },
    e: { x: 54, y: 54 },
    s: { x: 10, y: 54 },
    w: { x: 10, y: 30 }
  };
  const dirs = connectedDirs(mask);
  const active: Direction[] = dirs;
  const segments = active
    .map((dir) => wallSegment(center, points[dir], asset.fill, asset.stroke, asset.accent ?? "#59616a"))
    .join("\n");
  const cap = `<polygon points="22,38 32,32 42,38 42,48 32,54 22,48" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="1.6"/>
<path d="M23 48 L32 54 L41 48" fill="none" stroke="rgba(35,28,21,0.48)" stroke-width="2.2" stroke-linejoin="round"/>
<polygon points="20,36 32,29 44,36 32,44" fill="${asset.accent ?? "#59616a"}" stroke="${asset.stroke}" stroke-width="1.5"/>`;
  return `<ellipse cx="32" cy="59" rx="28" ry="7" fill="rgba(0,0,0,0.27)"/>
${segments}
${cap}`;
}

function gateBuilding(asset: PlaceholderAssetSpec): string {
  const roof = asset.accent ?? "#3c4650";
  return `<ellipse cx="40" cy="62" rx="34" ry="8" fill="rgba(0,0,0,0.30)"/>
<ellipse cx="20" cy="66" rx="7" ry="3" fill="rgba(0,0,0,0.36)"/>
<ellipse cx="60" cy="66" rx="7" ry="3" fill="rgba(0,0,0,0.36)"/>
<ellipse cx="40" cy="68" rx="16" ry="3.5" fill="rgba(0,0,0,0.32)"/>
<polygon points="12,39 40,24 68,39 40,54" fill="${roof}" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="18,43 40,31 62,43 40,55" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M19 43 L19 66 M61 43 L61 66" stroke="#3b2618" stroke-width="7" stroke-linecap="round"/>
<path d="M22 43 L22 64 M58 43 L58 64" stroke="#7d5534" stroke-width="3" stroke-linecap="round"/>
<polygon points="27,49 40,42 53,49 53,67 27,67" fill="#4d3321" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M40 43 L40 67 M30 52 L50 52 M30 59 L50 59" stroke="#7f5a38" stroke-width="2"/>
<circle cx="36" cy="57" r="1.5" fill="#d8bd75"/>
<circle cx="44" cy="57" r="1.5" fill="#d8bd75"/>`;
}

function wideGateBuilding(asset: PlaceholderAssetSpec): string {
  const roof = asset.accent ?? "#3c4650";
  const centerX = asset.width / 2;
  const leftX = 14;
  const rightX = asset.width - 14;
  const shadowY = asset.height - 14;
  const roofY = asset.height - 58;
  const bodyY = asset.height - 44;
  const baseY = asset.height - 9;
  return `<ellipse cx="${centerX}" cy="${shadowY}" rx="${asset.width / 2 - 10}" ry="9" fill="rgba(0,0,0,0.30)"/>
<ellipse cx="${leftX + 7}" cy="${baseY}" rx="8" ry="3" fill="rgba(0,0,0,0.36)"/>
<ellipse cx="${rightX - 7}" cy="${baseY}" rx="8" ry="3" fill="rgba(0,0,0,0.36)"/>
<ellipse cx="${centerX}" cy="${baseY}" rx="${asset.width / 4}" ry="3.5" fill="rgba(0,0,0,0.28)"/>
<polygon points="${leftX},${bodyY} ${centerX},${roofY} ${rightX},${bodyY} ${centerX},${bodyY + 20}" fill="${roof}" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M${leftX + 7} ${bodyY + 5} L${leftX + 7} ${baseY} M${rightX - 7} ${bodyY + 5} L${rightX - 7} ${baseY}" stroke="${asset.stroke}" stroke-width="8" stroke-linecap="round"/>
<path d="M${leftX + 10} ${bodyY + 5} L${leftX + 10} ${baseY - 2} M${rightX - 10} ${bodyY + 5} L${rightX - 10} ${baseY - 2}" stroke="${asset.fill}" stroke-width="3" stroke-linecap="round"/>
<path d="M${leftX + 22} ${bodyY + 14} L${rightX - 22} ${bodyY + 14}" stroke="${asset.stroke}" stroke-width="8" stroke-linecap="round"/>
<path d="M${leftX + 22} ${bodyY + 14} L${rightX - 22} ${bodyY + 14}" stroke="${asset.fill}" stroke-width="4" stroke-linecap="round"/>
<path d="M${centerX} ${bodyY + 8} L${centerX} ${baseY}" stroke="#4d3321" stroke-width="4"/>
<path d="M${leftX + 22} ${bodyY - 1} L${centerX} ${roofY + 5} L${rightX - 22} ${bodyY - 1}" fill="none" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>`;
}

function moatCell(asset: PlaceholderAssetSpec, water: boolean): string {
  const diamond = "32,1 63,16 32,31 1,16";
  const fill = water ? asset.fill : "#6e5534";
  const line = water ? "rgba(180,230,238,0.58)" : "rgba(40,28,18,0.32)";
  return `<defs><clipPath id="moatClip"><polygon points="${diamond}"/></clipPath></defs>
<polygon points="${diamond}" fill="${fill}" stroke="${asset.stroke}" stroke-width="2"/>
<g clip-path="url(#moatClip)">
<path d="M5 17 L32 5 L59 17" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
<path d="M7 22 L32 10 L57 22" fill="none" stroke="rgba(0,0,0,0.24)" stroke-width="3"/>
<path d="M10 16 C18 11, 24 21, 32 16 S47 11, 56 16" fill="none" stroke="${line}" stroke-width="2"/>
<path d="M15 21 C24 17, 31 24, 41 20 S52 18, 57 21" fill="none" stroke="${line}" stroke-opacity="0.65" stroke-width="1.4"/>
</g>`;
}

function connectedMoatCell(asset: PlaceholderAssetSpec, water: boolean): string {
  const mask = parseMask(asset.connectionMask);
  const dirs = connectedDirs(mask);
  const active: Direction[] = dirs;
  const diamond = "32,1 63,16 32,31 1,16";
  const center = { x: 32, y: 16 };
  const points: Record<Direction, Point> = {
    n: { x: 48, y: 8 },
    e: { x: 48, y: 24 },
    s: { x: 16, y: 24 },
    w: { x: 16, y: 8 }
  };
  const bed = water ? "#285f70" : "#715637";
  const channel = water ? "rgba(147,215,229,0.78)" : "rgba(43,30,19,0.45)";
  const highlight = water ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.13)";
  const segments = active
    .map(
      (dir) => `<path d="${moatPath(center, points[dir])}" fill="none" stroke="${channel}" stroke-width="9" stroke-linecap="round"/>
<path d="${moatPath(center, points[dir])}" fill="none" stroke="${highlight}" stroke-width="2.2" stroke-linecap="round"/>`
    )
    .join("\n");
  return `<defs><clipPath id="connectedMoatClip"><polygon points="${diamond}"/></clipPath></defs>
<polygon points="${diamond}" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<g clip-path="url(#connectedMoatClip)">
<polygon points="${diamond}" fill="${bed}" opacity="0.88"/>
${segments}
<path d="M4 18 L32 4 L60 18" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
<path d="M6 24 L32 11 L58 24" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="2"/>
</g>`;
}

function honmaruMarker(asset: PlaceholderAssetSpec): string {
  const diamond = "32,1 63,16 32,31 1,16";
  return `<polygon points="${diamond}" fill="${asset.fill}" fill-opacity="0.18" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M32 7 L32 24" stroke="#3b2618" stroke-width="2.4" stroke-linecap="round"/>
<path d="M33 8 L50 13 L33 18 Z" fill="${asset.accent ?? "#f0c86a"}" stroke="#3b2618" stroke-width="1.5"/>
<circle cx="32" cy="24" r="3.4" fill="#3b2618"/>
<path d="M17 16 L32 9 L47 16 L32 24 Z" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="1.2"/>`;
}

function storehouseBuilding(asset: PlaceholderAssetSpec): string {
  const accent = asset.accent ?? "#3c4650";
  return `<ellipse cx="48" cy="62" rx="32" ry="9" fill="rgba(0,0,0,0.25)"/>
<ellipse cx="48" cy="71" rx="30" ry="5" fill="rgba(0,0,0,0.28)"/>
<polygon points="18,38 48,20 78,38 48,56" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="18,38 48,56 48,72 18,54" fill="#6f5434" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="78,38 48,56 48,72 78,54" fill="#86653f" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M19 54 L48 72 L77 54" fill="none" stroke="rgba(42,31,21,0.45)" stroke-width="3" stroke-linejoin="round"/>
<polygon points="28,29 48,10 68,29 48,42" fill="${accent}" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M32 49 L43 55 L43 67 L32 61 Z M53 55 L64 49 L64 61 L53 67 Z" fill="#3f2b1b" stroke="${asset.stroke}" stroke-width="1.5"/>
<path d="M32 34 L48 24 L64 34" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>`;
}

function marketBuilding(asset: PlaceholderAssetSpec): string {
  const accent = asset.accent ?? "#c75f45";
  return `<ellipse cx="48" cy="64" rx="33" ry="8" fill="rgba(0,0,0,0.24)"/>
<ellipse cx="48" cy="70" rx="28" ry="4" fill="rgba(0,0,0,0.22)"/>
<polygon points="18,40 48,24 78,40 48,56" fill="#8b6a40" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="18,40 48,56 48,70 18,55" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="78,40 48,56 48,70 78,55" fill="#a37a48" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M19 55 L48 70 L77 55" fill="none" stroke="rgba(42,31,21,0.38)" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M20 39 L35 30 L50 38 L65 30 L78 39" fill="none" stroke="${accent}" stroke-width="6" stroke-linejoin="round"/>
<path d="M25 52 L39 58 M56 58 L71 51" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
<circle cx="34" cy="61" r="3" fill="${accent}" stroke="${asset.stroke}" stroke-width="1"/>
<circle cx="62" cy="60" r="3" fill="#d8bd75" stroke="${asset.stroke}" stroke-width="1"/>`;
}

function barracksBuilding(asset: PlaceholderAssetSpec): string {
  const accent = asset.accent ?? "#3f4a52";
  return `<ellipse cx="48" cy="65" rx="34" ry="8" fill="rgba(0,0,0,0.26)"/>
<ellipse cx="48" cy="72" rx="30" ry="4" fill="rgba(0,0,0,0.24)"/>
<polygon points="17,42 48,25 79,42 48,59" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="17,42 48,59 48,72 17,56" fill="#79603f" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="79,42 48,59 48,72 79,56" fill="#8a704a" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M18 56 L48 72 L78 56" fill="none" stroke="rgba(42,31,21,0.40)" stroke-width="2.5" stroke-linejoin="round"/>
<polygon points="26,34 48,20 70,34 48,46" fill="${accent}" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M32 49 L43 56 L43 69 L32 62 Z M54 56 L66 49 L66 62 L54 69 Z" fill="#2f2620" stroke="${asset.stroke}" stroke-width="1.4"/>
<path d="M22 37 L15 31 M29 34 L22 28 M74 37 L82 31 M67 34 L74 28" stroke="#d6ccb1" stroke-width="2" stroke-linecap="round"/>`;
}

function samuraiResidenceBuilding(asset: PlaceholderAssetSpec): string {
  const accent = asset.accent ?? "#4c5660";
  return `<ellipse cx="48" cy="64" rx="32" ry="8" fill="rgba(0,0,0,0.24)"/>
<ellipse cx="48" cy="71" rx="29" ry="4" fill="rgba(0,0,0,0.22)"/>
<polygon points="20,41 48,25 76,41 48,57" fill="#a98757" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="20,41 48,57 48,71 20,56" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="76,41 48,57 48,71 76,56" fill="#9b7547" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M21 56 L48 71 L75 56" fill="none" stroke="rgba(42,31,21,0.38)" stroke-width="2.5" stroke-linejoin="round"/>
<polygon points="24,35 48,20 72,35 48,48" fill="${accent}" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M35 52 L44 57 L44 69 L35 64 Z M55 57 L65 52 L65 64 L55 69 Z" fill="#403124" stroke="${asset.stroke}" stroke-width="1.5"/>
<path d="M22 49 L32 54 M64 54 L75 49" stroke="rgba(255,255,255,0.18)" stroke-width="1.6"/>`;
}

function townBlockBuilding(asset: PlaceholderAssetSpec): string {
  const accent = asset.accent ?? "#3c4650";
  return `<ellipse cx="48" cy="64" rx="35" ry="8" fill="rgba(0,0,0,0.22)"/>
<ellipse cx="48" cy="58" rx="34" ry="5" fill="rgba(0,0,0,0.18)"/>
<polygon points="14,44 30,34 46,44 30,54" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="1.6"/>
<polygon points="30,34 48,25 66,34 48,45" fill="#b18a57" stroke="${asset.stroke}" stroke-width="1.6"/>
<polygon points="50,46 68,35 84,45 66,56" fill="#a37a48" stroke="${asset.stroke}" stroke-width="1.6"/>
<polygon points="18,39 30,31 42,39 30,46" fill="${accent}" stroke="${asset.stroke}" stroke-width="1.6"/>
<polygon points="36,31 48,23 61,31 48,39" fill="#6b4535" stroke="${asset.stroke}" stroke-width="1.6"/>
<polygon points="56,40 68,32 80,40 67,48" fill="#4f5962" stroke="${asset.stroke}" stroke-width="1.6"/>
<path d="M24 48 L31 52 M47 42 L54 46 M64 50 L72 46" stroke="rgba(0,0,0,0.22)" stroke-width="1.4"/>`;
}

function farmTile(asset: PlaceholderAssetSpec): string {
  const diamond = "32,1 63,16 32,31 1,16";
  return `<defs><clipPath id="farmClip"><polygon points="${diamond}"/></clipPath></defs>
<polygon points="${diamond}" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<g clip-path="url(#farmClip)">
<path d="M-4 18 L28 2 M8 26 L46 7 M26 31 L67 11" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
<path d="M2 14 L33 29 M17 7 L55 25 M35 3 L67 18" stroke="rgba(58,42,24,0.36)" stroke-width="2"/>
<circle cx="25" cy="16" r="2" fill="${asset.accent ?? "#d8bd75"}"/>
<circle cx="40" cy="18" r="1.6" fill="${asset.accent ?? "#d8bd75"}"/>
</g>`;
}

function roadTile(asset: PlaceholderAssetSpec): string {
  const diamond = "32,1 63,16 32,31 1,16";
  return `<defs><clipPath id="roadClip"><polygon points="${diamond}"/></clipPath></defs>
<polygon points="${diamond}" fill="rgba(75,60,42,0.38)" stroke="${asset.stroke}" stroke-width="1.5"/>
<g clip-path="url(#roadClip)">
<path d="M-1 16 L32 2 L65 16 L32 31 Z" fill="${asset.fill}" opacity="0.82"/>
<path d="M6 18 L32 7 L58 18" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
<path d="M12 21 L32 13 L53 21" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1.6"/>
</g>`;
}

function earthBridgeTile(asset: PlaceholderAssetSpec): string {
  const diamond = "32,1 63,16 32,31 1,16";
  return `<defs><clipPath id="earthBridgeClip"><polygon points="${diamond}"/></clipPath></defs>
<polygon points="${diamond}" fill="rgba(54,43,30,0.28)" stroke="${asset.stroke}" stroke-width="1.5"/>
<g clip-path="url(#earthBridgeClip)">
<path d="M1 16 L32 4 L63 16 L32 29 Z" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M5 17 L32 7 L59 17" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
<path d="M9 22 L32 13 L55 22" fill="none" stroke="rgba(0,0,0,0.20)" stroke-width="1.8"/>
<path d="M16 16 L24 13 M31 20 L40 16 M44 14 L52 17" stroke="rgba(60,42,24,0.42)" stroke-width="1.4" stroke-linecap="round"/>
</g>`;
}

function woodBridgeTile(asset: PlaceholderAssetSpec): string {
  const diamond = "32,1 63,16 32,31 1,16";
  return `<defs><clipPath id="woodBridgeClip"><polygon points="${diamond}"/></clipPath></defs>
<polygon points="${diamond}" fill="rgba(42,31,22,0.24)" stroke="${asset.stroke}" stroke-width="1.5"/>
<g clip-path="url(#woodBridgeClip)">
<path d="M3 16 L32 5 L61 16 L32 28 Z" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M9 15 L32 7 L55 15 M10 20 L32 12 L54 20 M14 24 L32 17 L50 24" fill="none" stroke="rgba(255,255,255,0.13)" stroke-width="1.6"/>
<path d="M16 10 L42 23 M24 7 L52 19 M8 16 L35 28" stroke="${asset.stroke}" stroke-width="2" stroke-linecap="round"/>
<path d="M17 10 L43 23 M25 7 L53 19 M9 16 L36 28" stroke="rgba(255,255,255,0.12)" stroke-width="0.9" stroke-linecap="round"/>
</g>`;
}

function tenshuBuilding(asset: PlaceholderAssetSpec): string {
  const roof = asset.accent ?? "#2f3942";
  return `<ellipse cx="56" cy="91" rx="42" ry="10" fill="rgba(0,0,0,0.30)"/>
<ellipse cx="56" cy="96" rx="36" ry="5" fill="rgba(0,0,0,0.24)"/>
<polygon points="19,62 56,42 93,62 56,82" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2.2"/>
<polygon points="19,62 56,82 56,96 19,76" fill="#d0cbb8" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="93,62 56,82 56,96 93,76" fill="#b8b19f" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M20 76 L56 96 L92 76" fill="none" stroke="rgba(35,28,21,0.42)" stroke-width="3" stroke-linejoin="round"/>
<polygon points="22,55 56,36 90,55 56,74" fill="${roof}" stroke="${asset.stroke}" stroke-width="2.2"/>
<polygon points="30,39 56,24 82,39 56,54" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="32,34 56,20 80,34 56,47" fill="${roof}" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="39,21 56,11 73,21 56,31" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="1.8"/>
<polygon points="41,18 56,9 71,18 56,27" fill="${roof}" stroke="${asset.stroke}" stroke-width="1.8"/>
<path d="M39 61 L49 66 M63 66 L75 61 M37 76 L50 83 M63 83 L77 76 M47 38 L55 42 M61 42 L70 38" stroke="rgba(0,0,0,0.22)" stroke-width="1.5"/>`;
}

function overlayMarker(asset: PlaceholderAssetSpec): string {
  const diamond = "32,2 62,16 32,30 2,16";
  if (asset.pattern === "hover") {
    return `<polygon points="${diamond}" fill="rgba(155,216,255,0.06)" stroke="${asset.stroke}" stroke-width="2" stroke-opacity="0.9"/>
<polygon points="32,5 55,16 32,27 9,16" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="1"/>`;
  }
  if (asset.pattern === "selected") {
    return `<polygon points="${diamond}" fill="rgba(240,200,106,0.14)" stroke="rgba(80,55,12,0.55)" stroke-width="5"/>
<polygon points="${diamond}" fill="none" stroke="${asset.stroke}" stroke-width="2.5"/>
<polygon points="32,6 54,16 32,26 10,16" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1"/>`;
  }
  if (asset.pattern === "destination") {
    return `<polygon points="${diamond}" fill="rgba(240,200,106,0.12)" stroke="${asset.stroke}" stroke-width="2"/>
<circle cx="32" cy="16" r="5" fill="${asset.fill}" stroke="#2a2112" stroke-width="2"/>
<path d="M32 8 L32 24 M24 16 L40 16" stroke="#2a2112" stroke-width="2"/>`;
  }
  if (asset.pattern === "path") {
    return `<polygon points="${diamond}" fill="none" stroke="${asset.stroke}" stroke-opacity="0.30" stroke-width="1.5"/>
<circle cx="32" cy="16" r="3.5" fill="${asset.fill}" fill-opacity="0.75"/>`;
  }
  if (asset.pattern === "blocked") {
    return `<polygon points="${diamond}" fill="${asset.fill}" fill-opacity="0.22" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M23 11 L41 21 M41 11 L23 21" stroke="${asset.stroke}" stroke-width="4" stroke-linecap="round"/>`;
  }
  if (asset.pattern === "ring") {
    return `<ellipse cx="32" cy="16" rx="18" ry="8" fill="none" stroke="${asset.stroke}" stroke-width="3"/>
<ellipse cx="32" cy="16" rx="12" ry="5" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>`;
  }
  if (asset.pattern === "build-valid") {
    return `<polygon points="${diamond}" fill="${asset.fill}" fill-opacity="0.18" stroke="${asset.stroke}" stroke-width="2.5"/>
<path d="M23 16 L29 21 L42 10" fill="none" stroke="${asset.stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (asset.pattern === "build-invalid") {
    return `<polygon points="${diamond}" fill="${asset.fill}" fill-opacity="0.22" stroke="${asset.stroke}" stroke-width="2.5"/>
<path d="M23 11 L41 21 M41 11 L23 21" stroke="${asset.stroke}" stroke-width="4" stroke-linecap="round"/>`;
  }
  if (asset.pattern === "demolish") {
    return `<polygon points="${diamond}" fill="${asset.fill}" fill-opacity="0.14" stroke="${asset.stroke}" stroke-width="2.5"/>
<path d="M22 22 L42 10" stroke="${asset.stroke}" stroke-width="3" stroke-linecap="round"/>
<path d="M25 11 L34 20 L38 16 L29 7 Z" fill="${asset.stroke}" stroke="#2b2117" stroke-width="1"/>`;
  }
  return `<polygon points="${diamond}" fill="${asset.fill}" fill-opacity="0.24" stroke="${asset.stroke}" stroke-width="3"/>`;
}

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

type Direction = "n" | "e" | "s" | "w";

interface Point {
  readonly x: number;
  readonly y: number;
}

function parseMask(mask = "0000"): Record<Direction, boolean> {
  return {
    n: mask[0] === "1",
    e: mask[1] === "1",
    s: mask[2] === "1",
    w: mask[3] === "1"
  };
}

function connectedDirs(mask: Record<Direction, boolean>): Direction[] {
  return (["n", "e", "s", "w"] as const).filter((dir) => mask[dir]);
}

function rail(from: Point, to: Point, stroke: string, fill: string, outer: number, inner: number): string {
  return `<path d="M${from.x} ${from.y} L${to.x} ${to.y}" fill="none" stroke="${stroke}" stroke-width="${outer}" stroke-linecap="round"/>
<path d="M${from.x} ${from.y - 1} L${to.x} ${to.y - 1}" fill="none" stroke="${fill}" stroke-width="${inner}" stroke-linecap="round"/>`;
}

function fencePost(x: number, y: number, stroke: string, fill: string): string {
  return `<ellipse cx="${x}" cy="${y + 9}" rx="4.5" ry="2.2" fill="rgba(0,0,0,0.32)"/>
<path d="M${x} ${y - 10} L${x} ${y + 9}" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>
<path d="M${x} ${y - 10} L${x} ${y + 7}" stroke="${fill}" stroke-width="2" stroke-linecap="round"/>`;
}

function uniquePoints(points: Point[]): Point[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function wallSegment(from: Point, to: Point, fill: string, stroke: string, roof: string): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * 4;
  const ny = (dx / length) * 4;
  const a = { x: from.x + nx, y: from.y + ny };
  const b = { x: to.x + nx, y: to.y + ny };
  const c = { x: to.x - nx, y: to.y - ny + 10 };
  const d = { x: from.x - nx, y: from.y - ny + 10 };
  const roofA = { x: from.x + nx * 1.3, y: from.y + ny * 1.3 - 5 };
  const roofB = { x: to.x + nx * 1.3, y: to.y + ny * 1.3 - 5 };
  const roofC = { x: to.x - nx * 1.3, y: to.y - ny * 1.3 + 3 };
  const roofD = { x: from.x - nx * 1.3, y: from.y - ny * 1.3 + 3 };
  return `<polygon points="${points([a, b, c, d])}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>
<path d="M${c.x} ${c.y} L${d.x} ${d.y}" stroke="rgba(35,28,21,0.45)" stroke-width="2.2" stroke-linecap="round"/>
<polygon points="${points([roofA, roofB, roofC, roofD])}" fill="${roof}" stroke="${stroke}" stroke-width="1.4"/>`;
}

function moatPath(from: Point, to: Point): string {
  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2;
  return `M${from.x} ${from.y} Q${cx} ${cy} ${to.x} ${to.y}`;
}

function points(values: Point[]): string {
  return values.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}
