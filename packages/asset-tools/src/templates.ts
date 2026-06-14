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
  return `<polygon points="${w / 2},1 ${w - 1},${h / 2} ${w / 2},${h - 1} 1,${h / 2}" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M${w * 0.16} ${h / 2} L${w / 2} ${h * 0.2} L${w * 0.84} ${h / 2} L${w / 2} ${h * 0.8} Z" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
}

function unitMarker(asset: PlaceholderAssetSpec): string {
  const accent = asset.accent ?? asset.stroke;
  return `<ellipse cx="24" cy="38" rx="14" ry="5" fill="rgba(0,0,0,0.25)"/>
<circle cx="24" cy="18" r="9" fill="${asset.fill}" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M18 29 L24 16 L30 29 Z" fill="${accent}" stroke="${asset.stroke}" stroke-width="2"/>
<path d="M30 12 L39 8 L35 18 Z" fill="#d4b15d" stroke="${asset.stroke}" stroke-width="1"/>`;
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
  return `<rect x="2" y="2" width="${asset.width - 4}" height="${asset.height - 4}" rx="4" fill="${asset.fill}" fill-opacity="0.24" stroke="${asset.stroke}" stroke-width="3"/>`;
}

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
