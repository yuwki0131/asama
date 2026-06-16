export type ConnectedDirection = "n" | "e" | "s" | "w";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ConnectedSpriteGeometry {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
}

export interface ConnectedSockets {
  readonly n: Point;
  readonly e: Point;
  readonly s: Point;
  readonly w: Point;
}

export const CONNECTED_DIRECTIONS: readonly ConnectedDirection[] = ["n", "e", "s", "w"];

export const CONNECTED_MASKS: readonly string[] = Array.from({ length: 16 }, (_, value) =>
  value.toString(2).padStart(4, "0")
);

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

export function parseConnectedMask(mask = "0000"): Record<ConnectedDirection, boolean> {
  if (!/^[01]{4}$/.test(mask)) {
    throw new Error(`Invalid connected mask: ${mask}`);
  }

  return {
    n: mask[0] === "1",
    e: mask[1] === "1",
    s: mask[2] === "1",
    w: mask[3] === "1"
  };
}

export function connectedMaskDirections(mask = "0000"): ConnectedDirection[] {
  const parsed = parseConnectedMask(mask);
  return CONNECTED_DIRECTIONS.filter((direction) => parsed[direction]);
}

export function connectedGeometry(
  canvasWidth: number,
  canvasHeight: number,
  anchorX: number,
  anchorY: number,
  tileWidth = TILE_WIDTH,
  tileHeight = TILE_HEIGHT
): ConnectedSpriteGeometry {
  return { canvasWidth, canvasHeight, anchorX, anchorY, tileWidth, tileHeight };
}

export function groundCenter(geometry: ConnectedSpriteGeometry): Point {
  return { x: geometry.anchorX, y: geometry.anchorY };
}

export function connectedSockets(geometry: ConnectedSpriteGeometry): ConnectedSockets {
  const center = groundCenter(geometry);
  return {
    n: {
      x: center.x + geometry.tileWidth / 4,
      y: center.y - geometry.tileHeight / 4
    },
    e: {
      x: center.x + geometry.tileWidth / 4,
      y: center.y + geometry.tileHeight / 4
    },
    s: {
      x: center.x - geometry.tileWidth / 4,
      y: center.y + geometry.tileHeight / 4
    },
    w: {
      x: center.x - geometry.tileWidth / 4,
      y: center.y - geometry.tileHeight / 4
    }
  };
}

export function socketForDirection(geometry: ConnectedSpriteGeometry, direction: ConnectedDirection): Point {
  return connectedSockets(geometry)[direction];
}

export function oppositeDirection(direction: ConnectedDirection): ConnectedDirection {
  if (direction === "n") return "s";
  if (direction === "e") return "w";
  if (direction === "s") return "n";
  return "e";
}

export function connectedSegments(mask: string, geometry: ConnectedSpriteGeometry): readonly [Point, Point][] {
  const center = groundCenter(geometry);
  const sockets = connectedSockets(geometry);
  const directions = connectedMaskDirections(mask);

  if (directions.length === 0) {
    return [[{ x: center.x - 10, y: center.y }, { x: center.x + 10, y: center.y }]];
  }

  if (directions.length === 2 && directions.includes("n") && directions.includes("s")) {
    return [[sockets.n, sockets.s]];
  }

  if (directions.length === 2 && directions.includes("e") && directions.includes("w")) {
    return [[sockets.e, sockets.w]];
  }

  return directions.map((direction) => [center, sockets[direction]]);
}

export function socketWorldPosition(
  cell: Point,
  geometry: ConnectedSpriteGeometry,
  direction: ConnectedDirection
): Point {
  const spriteOrigin = {
    x: ((cell.x - cell.y) * geometry.tileWidth) / 2 - geometry.anchorX,
    y: ((cell.x + cell.y) * geometry.tileHeight) / 2 - geometry.anchorY
  };
  const socket = socketForDirection(geometry, direction);
  return {
    x: spriteOrigin.x + socket.x,
    y: spriteOrigin.y + socket.y
  };
}

export function normalizedAnchor(anchorX: number, anchorY: number, canvasWidth: number, canvasHeight: number): Point {
  return {
    x: anchorX / canvasWidth,
    y: anchorY / canvasHeight
  };
}
