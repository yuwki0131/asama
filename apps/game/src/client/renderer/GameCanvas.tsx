import { useEffect, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import type { CellCoord, UnitId, WorldSnapshot } from "@asama/shared";

interface GameCanvasProps {
  readonly snapshot: WorldSnapshot | null;
  readonly onSelectUnit: (unitId: UnitId) => void;
  readonly onMoveSelected: (destination: CellCoord) => void;
}

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const ORIGIN_X = 900;
const ORIGIN_Y = 80;

export function GameCanvas({ snapshot, onSelectUnit, onMoveSelected }: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const stageRef = useRef<Container | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }

    const app = new Application();
    let disposed = false;

    void app.init({
      resizeTo: host,
      background: "#1c2227",
      antialias: true
    }).then(() => {
      if (disposed) {
        app.destroy();
        return;
      }
      host.appendChild(app.canvas);
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      const stage = new Container();
      app.stage.addChild(stage);
      appRef.current = app;
      stageRef.current = stage;
    });

    return () => {
      disposed = true;
      appRef.current?.destroy(true);
      appRef.current = null;
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (stage === null || snapshot === null) {
      return;
    }

    stage.removeChildren();
    drawMap(stage, snapshot);
    drawUnits(stage, snapshot, onSelectUnit);
  }, [snapshot, onSelectUnit]);

  useEffect(() => {
    const app = appRef.current;
    if (app === null) {
      return;
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const rect = app.canvas.getBoundingClientRect();
      onMoveSelected(screenToCell(event.clientX - rect.left, event.clientY - rect.top));
    };

    app.canvas.addEventListener("contextmenu", handleContextMenu);
    return () => app.canvas.removeEventListener("contextmenu", handleContextMenu);
  }, [onMoveSelected]);

  return <div ref={hostRef} className="game-canvas" />;
}

function drawMap(stage: Container, snapshot: WorldSnapshot): void {
  const graphics = new Graphics();
  const max = Math.min(snapshot.map.width, 24);

  for (let y = 0; y < max; y += 1) {
    for (let x = 0; x < max; x += 1) {
      const point = cellToScreen({ x, y });
      graphics
        .moveTo(point.x, point.y)
        .lineTo(point.x + TILE_WIDTH / 2, point.y + TILE_HEIGHT / 2)
        .lineTo(point.x, point.y + TILE_HEIGHT)
        .lineTo(point.x - TILE_WIDTH / 2, point.y + TILE_HEIGHT / 2)
        .closePath()
        .fill((x + y) % 2 === 0 ? 0x32412f : 0x3a4a35)
        .stroke({ color: 0x202a22, width: 1 });
    }
  }

  stage.addChild(graphics);
}

function drawUnits(stage: Container, snapshot: WorldSnapshot, onSelectUnit: (unitId: UnitId) => void): void {
  for (const unit of snapshot.units) {
    const point = cellToScreen(unit.position);
    const unitMarker = new Graphics()
      .circle(0, 0, unit.selected ? 12 : 10)
      .fill(unit.selected ? 0xf0c86a : 0xd9ded0)
      .stroke({ color: 0x232323, width: 2 });
    unitMarker.x = point.x;
    unitMarker.y = point.y + TILE_HEIGHT / 2;
    unitMarker.eventMode = "static";
    unitMarker.cursor = "pointer";
    unitMarker.on("pointerdown", () => onSelectUnit(unit.id));
    stage.addChild(unitMarker);
  }
}

function cellToScreen(cell: CellCoord): CellCoord {
  return {
    x: ORIGIN_X + (cell.x - cell.y) * (TILE_WIDTH / 2),
    y: ORIGIN_Y + (cell.x + cell.y) * (TILE_HEIGHT / 2)
  };
}

function screenToCell(x: number, y: number): CellCoord {
  const localX = x - ORIGIN_X;
  const localY = y - ORIGIN_Y;
  return {
    x: Math.round(localY / TILE_HEIGHT + localX / TILE_WIDTH),
    y: Math.round(localY / TILE_HEIGHT - localX / TILE_WIDTH)
  };
}
