import type { PlaceholderAssetSpec } from "./types";

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
  const accent = asset.accent ?? "#3c4650";
  return `<ellipse cx="48" cy="62" rx="32" ry="9" fill="rgba(0,0,0,0.25)"/>
<polygon points="18,38 48,20 78,38 48,56" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="18,38 48,56 48,72 18,54" fill="#6f5434" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="78,38 48,56 48,72 78,54" fill="#86653f" stroke="${asset.stroke}" stroke-width="2"/>
<polygon points="28,29 48,10 68,29 48,42" fill="${accent}" stroke="${asset.stroke}" stroke-width="2"/>`;
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
  return `<polygon points="${diamond}" fill="${asset.fill}" fill-opacity="0.24" stroke="${asset.stroke}" stroke-width="3"/>`;
}

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
