import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AnimationActionSpec, AnimationAssetSpec, AssetKind, SheetDirection } from "./types";

/** Fixed sprite-sheet row order (map compass; N = toward map y-1). */
export const SHEET_DIRECTIONS: readonly SheetDirection[] = ["s", "se", "e", "ne", "n", "nw", "w", "sw"];

const assetKinds = new Set<AssetKind>(["terrain", "unit", "building", "overlay"]);
const actionNamePattern = /^[a-z][a-z0-9-]*$/;

export interface AnimationAssetConfig {
  readonly version: number;
  readonly animations: readonly AnimationAssetSpec[];
}

/**
 * Reads the `animations` arrays from every production-assets JSON file.
 * Files without an `animations` key are simply skipped, so static asset
 * definitions are unaffected.
 */
export async function readAnimationAssetConfigDir(dir: string): Promise<AnimationAssetConfig> {
  const entries = await readdir(dir);
  const jsonFiles = entries.filter((file) => file.endsWith(".json")).sort();
  const seen = new Set<string>();
  const merged: AnimationAssetSpec[] = [];
  for (const file of jsonFiles) {
    const raw = await readFile(join(dir, file), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown; animations?: unknown };
    if (parsed.animations === undefined) {
      continue;
    }
    if (parsed.version !== 1 || !Array.isArray(parsed.animations)) {
      throw new Error(`Invalid animation asset config: ${join(dir, file)}`);
    }
    parsed.animations.forEach((animation, index) => {
      merged.push(parseAnimationAsset(animation, index, seen));
    });
  }
  return { version: 1, animations: merged };
}

export function parseAnimationAsset(value: unknown, index: number, seen = new Set<string>()): AnimationAssetSpec {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid animation asset at index ${index}`);
  }
  const spec = value as Partial<AnimationAssetSpec>;
  assertString(spec.assetId, `animations[${index}].assetId`);
  if (seen.has(spec.assetId)) {
    throw new Error(`Duplicate animation assetId: ${spec.assetId}`);
  }
  seen.add(spec.assetId);

  if (!assetKinds.has(spec.kind as AssetKind)) {
    throw new Error(`Invalid animations[${index}].kind`);
  }
  assertString(spec.model, `animations[${index}].model`);
  assertString(spec.renderSpec, `animations[${index}].renderSpec`);
  if (spec.supersample !== undefined) {
    assertPositiveInteger(spec.supersample, `animations[${index}].supersample`);
  }
  if (spec.directions !== SHEET_DIRECTIONS.length) {
    throw new Error(`animations[${index}].directions must be ${SHEET_DIRECTIONS.length}`);
  }

  const frameCanvas = spec.frameCanvas as Partial<AnimationAssetSpec["frameCanvas"]> | undefined;
  if (typeof frameCanvas !== "object" || frameCanvas === null) {
    throw new Error(`Invalid animations[${index}].frameCanvas`);
  }
  assertPositiveInteger(frameCanvas.width, `animations[${index}].frameCanvas.width`);
  assertPositiveInteger(frameCanvas.height, `animations[${index}].frameCanvas.height`);
  assertNumber(frameCanvas.anchorX, `animations[${index}].frameCanvas.anchorX`);
  assertNumber(frameCanvas.anchorY, `animations[${index}].frameCanvas.anchorY`);
  if (frameCanvas.anchorX < 0 || frameCanvas.anchorX > frameCanvas.width) {
    throw new Error(`animations[${index}].frameCanvas.anchorX is outside the frame`);
  }
  if (frameCanvas.anchorY < 0 || frameCanvas.anchorY > frameCanvas.height) {
    throw new Error(`animations[${index}].frameCanvas.anchorY is outside the frame`);
  }

  if (!Array.isArray(spec.actions) || spec.actions.length === 0) {
    throw new Error(`Invalid animations[${index}].actions`);
  }
  const actionNames = new Set<string>();
  const actions = spec.actions.map((action, actionIndex) =>
    parseAction(action, `animations[${index}].actions[${actionIndex}]`, actionNames)
  );

  const sharpen = spec.postprocess?.sharpen;
  if (sharpen !== undefined) {
    assertNumber(sharpen.sigma, `animations[${index}].postprocess.sharpen.sigma`);
  }

  return {
    assetId: spec.assetId,
    kind: spec.kind as AssetKind,
    model: spec.model,
    renderSpec: spec.renderSpec,
    ...(spec.supersample === undefined ? {} : { supersample: spec.supersample }),
    directions: SHEET_DIRECTIONS.length,
    frameCanvas: {
      width: frameCanvas.width,
      height: frameCanvas.height,
      anchorX: frameCanvas.anchorX,
      anchorY: frameCanvas.anchorY
    },
    actions,
    ...(sharpen === undefined ? {} : { postprocess: { sharpen: { sigma: sharpen.sigma } } })
  };
}

function parseAction(value: unknown, label: string, seen: Set<string>): AnimationActionSpec {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid ${label}`);
  }
  const action = value as Partial<AnimationActionSpec>;
  assertString(action.name, `${label}.name`);
  if (!actionNamePattern.test(action.name)) {
    throw new Error(`Invalid ${label}.name: ${action.name}`);
  }
  if (seen.has(action.name)) {
    throw new Error(`Duplicate action name: ${action.name}`);
  }
  seen.add(action.name);
  assertPositiveInteger(action.frames, `${label}.frames`);
  assertNumber(action.fps, `${label}.fps`);
  if (action.fps <= 0) {
    throw new Error(`Invalid ${label}.fps`);
  }
  if (typeof action.loop !== "boolean") {
    throw new Error(`Invalid ${label}.loop`);
  }
  return { name: action.name, frames: action.frames, fps: action.fps, loop: action.loop };
}

/** `unit.spear_ashigaru` + `walk` -> `unit-spear-ashigaru-walk-sheet.png` */
export function animationSheetFileName(assetId: string, action: string): string {
  return `${assetId.replace(/[._]/g, "-")}-${action}-sheet.png`;
}

/** Manifest id for one action sheet: `unit.spear_ashigaru.anim.walk`. */
export function animationManifestId(assetId: string, action: string): string {
  return `${assetId}.anim.${action}`;
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${label}`);
  }
}

function assertNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  assertNumber(value, label);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}`);
  }
}
