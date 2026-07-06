/**
 * Aerial perspective overlay: a screen-fixed, semi-transparent vertical
 * gradient (#c7cdd6, 20% opacity at the top edge → 0% at 55% of the screen
 * height) placed above the world container and below the React UI. It does
 * not follow the camera or zoom; the isometric fixed camera guarantees
 * "up = far", so a screen-space haze reads as depth.
 */
import { Sprite, Texture } from "pixi.js";
import { AERIAL_FADE_END_RATIO, AERIAL_HAZE_RGB, AERIAL_TOP_ALPHA } from "./toneGrade";

/** Vertical resolution of the 1px-wide gradient strip texture. */
const GRADIENT_TEXTURE_HEIGHT = 256;

export function createAerialOverlay(): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = GRADIENT_TEXTURE_HEIGHT;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Failed to acquire 2d context for aerial overlay gradient");
  }
  const { r, g, b } = AERIAL_HAZE_RGB;
  const gradient = context.createLinearGradient(0, 0, 0, GRADIENT_TEXTURE_HEIGHT);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${AERIAL_TOP_ALPHA})`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1, GRADIENT_TEXTURE_HEIGHT);

  const sprite = new Sprite(Texture.from(canvas));
  // Screen-fixed decoration only; never intercept pointer events.
  sprite.eventMode = "none";
  sprite.position.set(0, 0);
  return sprite;
}

/** Stretch the gradient strip over the top AERIAL_FADE_END_RATIO of the screen. */
export function resizeAerialOverlay(sprite: Sprite, screenWidth: number, screenHeight: number): void {
  sprite.width = screenWidth;
  sprite.height = screenHeight * AERIAL_FADE_END_RATIO;
}
