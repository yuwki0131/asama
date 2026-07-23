// Simple top-down minimap for the 3D trial renderer.
//
// Rendered as an HTML <canvas> in the bottom-right corner of App3d — cheap,
// independent of the WebGL renderer, and stays legible at any 3D camera
// position. Buildings are colored by category; units by owner. Optional
// click-to-jump wires into ThreeGameCanvasHandle.jumpCameraToCell.

import { useEffect, useRef } from "react";
import type { CellCoord, WorldSnapshot } from "@asama/shared";
import { MAP_WIDTH, MAP_HEIGHT } from "@asama/shared";

const SIZE = 200;
const PADDING = 6;

interface Props {
  readonly snapshot: WorldSnapshot | null;
  readonly onJump?: (cell: CellCoord) => void;
}

export function Minimap3d({ snapshot, onJump }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    ctx.imageSmoothingEnabled = false;
    drawMinimap(ctx, snapshot);
  }, [snapshot]);

  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      className="minimap-3d"
      onClick={(event) => {
        if (onJump === undefined || snapshot === null) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const cx = Math.floor((px / rect.width) * MAP_WIDTH);
        const cy = Math.floor((py / rect.height) * MAP_HEIGHT);
        onJump({ x: cx, y: cy });
      }}
    />
  );
}

function drawMinimap(ctx: CanvasRenderingContext2D, snapshot: WorldSnapshot | null): void {
  ctx.fillStyle = "#1a1e24";
  ctx.fillRect(0, 0, SIZE, SIZE);
  if (snapshot === null) return;

  const w = snapshot.map.width;
  const h = snapshot.map.height;
  const cell = (SIZE - PADDING * 2) / Math.max(w, h);

  // Terrain: draw a green base + light tint per elevation.
  const cells = snapshot.map.cells;
  if (cells.length > 0) {
    // Sparse: skip if map is fully flat.
    for (const c of cells) {
      if (c.elevation === 0 && c.terrain !== "water") continue;
      const px = PADDING + c.coord.x * cell;
      const py = PADDING + c.coord.y * cell;
      if (c.terrain === "water") {
        ctx.fillStyle = "#3a70a0";
      } else {
        // Level 1 = tan, 2 = light stone, etc.
        const t = Math.min(1, c.elevation / 5);
        const r = Math.round(140 + 40 * t);
        const g = Math.round(140 + 30 * t);
        const b = Math.round(100 + 40 * t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      }
      ctx.fillRect(px, py, Math.ceil(cell), Math.ceil(cell));
    }
  }
  // Flat grass fill for cells that skipped above (draw first as base).
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#4d6836";
  ctx.fillRect(PADDING, PADDING, w * cell, h * cell);
  ctx.globalCompositeOperation = "source-over";

  // Buildings by category color.
  for (const b of snapshot.buildings) {
    if (b.lifecycleState !== "intact") continue;
    ctx.fillStyle = buildingColor(b.type);
    for (const fp of b.footprint) {
      const px = PADDING + fp.x * cell;
      const py = PADDING + fp.y * cell;
      ctx.fillRect(px, py, Math.max(1, cell), Math.max(1, cell));
    }
  }

  // Units.
  for (const u of snapshot.units) {
    const px = PADDING + (u.position.x + 0.5) * cell;
    const py = PADDING + (u.position.y + 0.5) * cell;
    ctx.fillStyle = u.owner === "player" ? "#5cb0ff" : u.owner === "enemy" ? "#e05252" : "#c0c0c0";
    ctx.beginPath();
    ctx.arc(px, py, Math.max(1, cell * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }

  // Border frame.
  ctx.strokeStyle = "#5a636e";
  ctx.lineWidth = 1;
  ctx.strokeRect(PADDING - 0.5, PADDING - 0.5, w * cell + 1, h * cell + 1);
}

function buildingColor(type: string): string {
  switch (type) {
    case "wall":
    case "hazama_wall":
      return "#efe6d3";
    case "fence":
      return "#8b6a45";
    case "dry_moat":
      return "#6b533a";
    case "water_moat":
      return "#3a70a0";
    case "road":
      return "#c0b085";
    case "earth_bridge":
    case "wood_bridge":
      return "#8a6a3f";
    case "farm":
      return "#a8965a";
    case "storehouse":
    case "market":
    case "barracks":
    case "samurai_residence":
    case "town_block":
      return "#c47a4a";
    case "yagura":
      return "#8a5a34";
    case "tenshu":
      return "#d7c268";
    case "honmaru":
      return "#f0d658";
    case "garden":
      return "#7ab873";
    default:
      if (type.startsWith("gate")) return "#c47a4a";
      return "#888";
  }
}
