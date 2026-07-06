import sharp from "sharp";

export interface SpriteSheetComposeSpec {
  /** Frame PNG paths as a grid: rows = directions, columns = frames. */
  readonly framePaths: readonly (readonly string[])[];
  /** Final per-cell size; source frames are resized (fit: fill) to this. */
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** Applied per cell BEFORE compositing so it cannot bleed across cells. */
  readonly sharpenSigma?: number;
}

export interface SheetDimensions {
  readonly width: number;
  readonly height: number;
  readonly rows: number;
  readonly columns: number;
}

export function sheetDimensions(rows: number, columns: number, frameWidth: number, frameHeight: number): SheetDimensions {
  if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(columns) || columns <= 0) {
    throw new Error("Sheet rows/columns must be positive integers");
  }
  if (!Number.isInteger(frameWidth) || frameWidth <= 0 || !Number.isInteger(frameHeight) || frameHeight <= 0) {
    throw new Error("Sheet frame size must be positive integers");
  }
  return { width: columns * frameWidth, height: rows * frameHeight, rows, columns };
}

/**
 * Composes per-frame renders into one sprite-sheet PNG buffer.
 *
 * Layout contract: columns = frames (left to right, frame 1 first), rows =
 * directions in the fixed order S, SE, E, NE, N, NW, W, SW. Cells are butted
 * (no padding); clients slice with pure `(col*w, row*h, w, h)` rectangles.
 */
export async function composeSpriteSheet(spec: SpriteSheetComposeSpec): Promise<Buffer> {
  const rows = spec.framePaths.length;
  if (rows === 0) {
    throw new Error("Sprite sheet needs at least one row");
  }
  const columns = spec.framePaths[0]?.length ?? 0;
  if (columns === 0) {
    throw new Error("Sprite sheet needs at least one column");
  }
  if (spec.framePaths.some((row) => row.length !== columns)) {
    throw new Error("Sprite sheet rows must all have the same number of frames");
  }
  const dimensions = sheetDimensions(rows, columns, spec.frameWidth, spec.frameHeight);

  const composites: sharp.OverlayOptions[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = await renderCell(spec.framePaths[row]![column]!, spec);
      composites.push({
        input: cell,
        raw: { width: spec.frameWidth, height: spec.frameHeight, channels: 4 },
        left: column * spec.frameWidth,
        top: row * spec.frameHeight
      });
    }
  }

  return sharp({
    create: {
      width: dimensions.width,
      height: dimensions.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function renderCell(path: string, spec: SpriteSheetComposeSpec): Promise<Buffer> {
  let image = sharp(path, { failOn: "error" })
    .ensureAlpha()
    .resize({ width: spec.frameWidth, height: spec.frameHeight, fit: "fill" });
  if (spec.sharpenSigma !== undefined) {
    image = image.sharpen({ sigma: spec.sharpenSigma });
  }
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  if (info.width !== spec.frameWidth || info.height !== spec.frameHeight || info.channels !== 4) {
    throw new Error(`Sprite frame resize produced unexpected output: ${path}`);
  }
  return data;
}
