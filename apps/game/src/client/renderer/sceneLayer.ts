import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import type {
  BuildingSnapshot,
  CellCoord,
  MapDecoration,
  Season,
  TerrainCellSnapshot,
  UnitId,
  UnitSnapshot,
  WorldSnapshot
} from "@asama/shared";
import { clearLayer, createSprite, createSpriteFromCandidates, type AnimationSheetAsset, type LoadedAsset } from "./assets";
import {
  cellToWorld,
  clamp,
  isVisibleCell,
  roundWorldPixel,
  type CameraState,
  TILE_HEIGHT,
  TILE_WIDTH,
  UNIT_GROUND_OFFSET_Y
} from "./camera";
import { ELEVATION_PIXELS_PER_LEVEL, surfaceOffsetYAt, tileOffsetYAt, type ElevationMapLike } from "./elevation";
import { bridgeCellAssetCandidates, buildingAssetCandidates, isBridgeBuildingType } from "./gameRules";
import { interpolateUnitRenderPosition, resolveDisplayPosition, type WorldPoint } from "./interpolation";
import { buildingRenderPoint, honmaruMarkerScale, isoBehind } from "./renderGeometry";
import type { FootprintRect } from "./renderGeometry";
import {
  addCliffCellSprites,
  addElevatedFloorSprites,
  addSlopeCellSprites,
  cliffFeatureScreenRects,
  slopeFeatureScreenRect,
  type FeatureScreenRect
} from "./terrainLayer";

interface AnimState {
  currentAction: "idle" | "walk" | "attack" | "death";
  directionRow: number;
  frameIndex: number;
  frameAccMs: number;
  attackCyclesLeft: number;
  isDying: boolean;
  fadeAlpha: number;
  fadeDurationMs: number;
  readonly phaseOffset: number;
}

interface UnitVisual {
  readonly container: Container;
  readonly ring: Sprite;
  readonly sprite: Sprite;
  readonly healthBar: Graphics;
  /** Latest snapshot data; refreshed on every sync. */
  unit: UnitSnapshot;
  /** Smoothed on-screen world position (anti-pop across snapshots). */
  displayPosition: WorldPoint | null;
  /** `${hp}/${maxHp}` — the health bar is only redrawn when this changes. */
  hpKey: string;
  assetId: string;
  /** Per-unit animation state machine; null when no sheets available. */
  animState: AnimState | null;
}

interface DecorationVisual {
  readonly position: CellCoord;
  readonly sprite: Sprite;
  /** Asset id used to detect vegetation types for sway animation. */
  readonly assetId: string;
  /** Sprite X at the time the visual was created; used as sway baseline. */
  readonly baseX: number;
}

interface FlagVisual {
  readonly graphics: Graphics;
  readonly position: CellCoord;
  /** Phase offset in [0,1) derived from cell coordinates for desync. */
  readonly phaseOffset: number;
}

/**
 * Retained scene graph for buildings, decorations, cliff faces and units.
 *
 * - Buildings + decorations + cliff faces are rebuilt only when their visual
 *   signature changes (id / asset / state / zoom step / terrain revision),
 *   not per snapshot or per frame.
 * - Units are kept in a Map keyed by unit id; per frame only position,
 *   depth (zIndex Y-sort) and visibility are updated. Sprites are created
 *   and destroyed exclusively on unit add/remove.
 */
export class RetainedScene {
  readonly root = new Container();
  private readonly staticLayer = new Container();
  private readonly unitsLayer = new Container();
  private readonly unitVisuals = new Map<UnitId, UnitVisual>();
  /** Units that have died and are fading out. Not in unitVisuals. */
  private readonly dyingVisuals = new Map<UnitId, UnitVisual>();
  private decorationVisuals: DecorationVisual[] = [];
  private flagVisuals: FlagVisual[] = [];
  private staticSignature: string | null = null;
  private lastSnapshot: WorldSnapshot | null = null;
  private lastAssets: ReadonlyMap<string, LoadedAsset> | null = null;
  private lastSheets: ReadonlyMap<string, AnimationSheetAsset> | null = null;
  private lastZoom: number | null = null;

  constructor() {
    // Units always paint above buildings (matches the legacy draw order);
    // within the unit layer, zIndex carries the per-frame Y-sort.
    this.unitsLayer.sortableChildren = true;
    this.root.addChild(this.staticLayer, this.unitsLayer);
  }

  /** Reconciles retained visuals with a snapshot. Cheap when nothing changed. */
  sync(
    snapshot: WorldSnapshot,
    assets: ReadonlyMap<string, LoadedAsset>,
    zoom: number,
    sheets?: ReadonlyMap<string, AnimationSheetAsset>
  ): void {
    const snapshotChanged = snapshot !== this.lastSnapshot;
    const assetsChanged = assets !== this.lastAssets;
    const sheetsChanged = sheets !== undefined && sheets !== this.lastSheets;
    const zoomChanged = zoom !== this.lastZoom;
    if (!snapshotChanged && !assetsChanged && !sheetsChanged && !zoomChanged) {
      return;
    }
    this.lastSnapshot = snapshot;
    this.lastAssets = assets;
    this.lastZoom = zoom;
    if (sheets !== undefined) {
      this.lastSheets = sheets;
    }

    if (assetsChanged) {
      // Textures resolved against the previous asset map are stale; rebuild
      // every retained sprite. Happens once, when the manifest finishes loading.
      this.destroyUnitVisuals();
      this.staticSignature = null;
    }

    const signature = staticSceneSignature(snapshot, zoom);
    if (signature !== this.staticSignature) {
      this.rebuildStaticLayer(snapshot, assets, zoom);
      this.staticSignature = signature;
    }

    if (snapshotChanged || assetsChanged || sheetsChanged) {
      this.syncUnits(snapshot, assets);
    }
  }

  /**
   * Per-frame update: interpolated unit positions, Y-sort depth,
   * decoration visibility culling, vegetation sway and flag flutter.
   * No allocation of display objects.
   */
  updateFrame(
    elapsedTicks: number,
    frameDeltaMs: number,
    timeSec: number,
    camera: CameraState,
    screenWidth: number,
    screenHeight: number
  ): void {
    const map = this.lastSnapshot?.map ?? null;
    const surfaceOffsetAt = (cell: CellCoord): number => surfaceOffsetYAt(map, cell);
    for (const visual of this.unitVisuals.values()) {
      const target = interpolateUnitRenderPosition(visual.unit, elapsedTicks, surfaceOffsetAt);
      const display = resolveDisplayPosition(visual.displayPosition, target, frameDeltaMs);
      visual.displayPosition = display;
      visual.container.position.set(display.x, display.y);
      // Depth sort stays cell-based: elevation lifts the drawing but must not
      // change the painter's order (elevation-contract.md §5).
      visual.container.zIndex = target.sortY + UNIT_GROUND_OFFSET_Y;

      // Advance animation for living units
      if (visual.animState !== null) {
        this.advanceAnimation(visual, frameDeltaMs);
      }
    }

    // Advance dying visuals (death animation + fade-out)
    const toRemove: UnitId[] = [];
    for (const [id, visual] of this.dyingVisuals) {
      if (visual.animState !== null) {
        this.advanceAnimation(visual, frameDeltaMs);
        const st = visual.animState;
        st.fadeAlpha -= frameDeltaMs / st.fadeDurationMs;
        visual.container.alpha = Math.max(0, st.fadeAlpha);
        if (st.fadeAlpha <= 0) {
          toRemove.push(id);
        }
      } else {
        // No animation sheet for this unit type; just fade out immediately
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      const visual = this.dyingVisuals.get(id)!;
      this.unitsLayer.removeChild(visual.container);
      visual.container.destroy({ children: true, context: true });
      this.dyingVisuals.delete(id);
    }

    for (const decoration of this.decorationVisuals) {
      decoration.sprite.visible = isVisibleCell(decoration.position, camera, screenWidth, screenHeight);
      // Vegetation sway: tree and bamboo decorations get a subtle X-axis sine offset.
      const aid = decoration.assetId;
      const isTree = aid.startsWith("deco.tree.");
      const isBamboo = aid.startsWith("deco.bamboo.");
      if (isTree || isBamboo) {
        const freq = isBamboo ? 1.2 : 0.8;
        const amplitude = isBamboo ? 2.0 : 1.5;
        const phase = cellPhaseOffset(decoration.position);
        const swayOffset = Math.sin(timeSec * freq + phase * 6.28) * amplitude;
        decoration.sprite.position.x = decoration.baseX + swayOffset;
      }
    }

    // Flag flutter: small pennant Graphics on castle buildings rotate ±0.15 rad.
    for (const flag of this.flagVisuals) {
      flag.graphics.rotation = Math.sin(timeSec * 3 + flag.phaseOffset * 6.28) * 0.15;
    }
  }

  destroy(): void {
    this.destroyUnitVisuals();
    this.decorationVisuals = [];
    this.flagVisuals = [];
    this.root.destroy({ children: true, context: true });
  }

  private destroyUnitVisuals(): void {
    for (const visual of this.unitVisuals.values()) {
      this.unitsLayer.removeChild(visual.container);
      visual.container.destroy({ children: true, context: true });
    }
    this.unitVisuals.clear();

    for (const visual of this.dyingVisuals.values()) {
      this.unitsLayer.removeChild(visual.container);
      visual.container.destroy({ children: true, context: true });
    }
    this.dyingVisuals.clear();
  }

  private rebuildStaticLayer(
    snapshot: WorldSnapshot,
    assets: ReadonlyMap<string, LoadedAsset>,
    zoom: number
  ): void {
    clearLayer(this.staticLayer);
    this.decorationVisuals = [];
    this.flagVisuals = [];

    // Cells covered by intact buildings hide their decorations.
    const occupiedCells = new Set<string>();
    for (const building of snapshot.buildings) {
      if (building.lifecycleState !== "intact") {
        continue;
      }
      for (const cell of building.footprint) {
        occupiedCells.add(`${cell.x},${cell.y}`);
      }
    }

    // Merge buildings, decorations, cliff faces and slope tiles into a single
    // Y-sorted list so they all participate in the same painter's-order
    // (fixes trees rendering on top of tenshu/honmaru regardless of their Y
    // position, and trees in front of a cliff being swallowed by the cliff
    // face). All decorations are included; camera culling happens per frame
    // via sprite visibility. Elevation only offsets draw positions; it never
    // feeds the sort.
    //
    // Cliff faces sort by their own (low-side) cliff cell coordinate: a
    // building on the high terrace (smaller x+y) paints BEFORE the face — the
    // face covers its protruding base — while a tree on the low side (larger
    // x+y) paints AFTER and correctly appears in front of the wall.
    //
    // Slope tiles rise 40 px like a cliff face and sort the same way by
    // their own cell coordinate: a wall/cliff BEHIND the ramp (smaller x+y)
    // paints first and the ramp correctly covers it; anything on the low
    // side in front paints after.
    const sceneItems: SceneItemForSort[] = [];
    for (const building of snapshot.buildings) {
      sceneItems.push({ kind: "building", item: building });
    }
    for (const decoration of snapshot.map.decorations) {
      if (occupiedCells.has(`${decoration.position.x},${decoration.position.y}`)) {
        continue;
      }
      sceneItems.push({ kind: "decoration", item: decoration });
    }
    const featureRects: FeatureScreenRect[] = [];
    for (const cell of snapshot.map.cells) {
      if (cell.terrain === "cliff") {
        sceneItems.push({ kind: "cliff", item: cell });
        featureRects.push(...cliffFeatureScreenRects(cell, snapshot.map));
      } else if (cell.slope !== null) {
        sceneItems.push({ kind: "slope", item: cell });
        featureRects.push(slopeFeatureScreenRect(cell));
      }
    }
    // Lifted floors normally live in the terrain layer (below everything
    // here), so a face/slope sprite of a cell BEHIND them can wrongly paint
    // on top once elevation slides the floor up-screen into its rect. Any
    // such floor is duplicated into this depth sort; the terrain-layer copy
    // stays harmlessly underneath.
    for (const cell of snapshot.map.cells) {
      if (cell.elevation < 1 || cell.slope !== null) {
        continue;
      }
      const point = cellToWorld(cell.coord);
      const top = point.y + tileOffsetYAt(snapshot.map, cell.coord) - TILE_HEIGHT / 2;
      const bottom = top + TILE_HEIGHT;
      const left = point.x - TILE_WIDTH / 2;
      const right = point.x + TILE_WIDTH / 2;
      const floorKey = cell.coord.x + cell.coord.y;
      const covered = featureRects.some(
        (r) =>
          r.depthKey < floorKey &&
          r.bottomElevation < cell.elevation &&
          r.minX < right &&
          r.maxX > left &&
          r.minY < bottom &&
          r.maxY > top
      );
      if (covered) {
        sceneItems.push({ kind: "floor", item: cell });
      }
    }
    isoSort(sceneItems);

    for (const entry of sceneItems) {
      if (entry.kind === "cliff") {
        addCliffCellSprites(this.staticLayer, entry.item, snapshot.map, assets);
      } else if (entry.kind === "floor") {
        addElevatedFloorSprites(this.staticLayer, entry.item, snapshot.map, assets);
      } else if (entry.kind === "slope") {
        addSlopeCellSprites(this.staticLayer, entry.item, snapshot.map, assets);
      } else if (entry.kind === "building") {
        addBuildingSprite(this.staticLayer, entry.item, assets, zoom, snapshot.economy.season);
        // Flag pennant for castle buildings on intact structures only.
        const building = entry.item;
        if (
          building.lifecycleState === "intact" &&
          (building.type === "yagura" || building.type === "tenshu" || building.type === "honmaru")
        ) {
          const flagGraphics = createFlagGraphics(building, zoom);
          this.staticLayer.addChild(flagGraphics);
          this.flagVisuals.push({
            graphics: flagGraphics,
            position: building.position,
            phaseOffset: cellPhaseOffset(building.position)
          });
        }
      } else {
        const sprite = addDecorationSprite(this.staticLayer, entry.item, assets, zoom, snapshot.map);
        if (sprite !== null) {
          this.decorationVisuals.push({
            position: entry.item.position,
            sprite,
            assetId: entry.item.assetId,
            baseX: sprite.position.x
          });
        }
      }
    }
  }

  private syncUnits(snapshot: WorldSnapshot, assets: ReadonlyMap<string, LoadedAsset>): void {
    const sheets = this.lastSheets ?? (new Map() as ReadonlyMap<string, AnimationSheetAsset>);
    const events = snapshot.events ?? [];

    // Collect attacker IDs from combat events this snapshot
    const attackerIds = new Set<UnitId>();
    for (const event of events) {
      if (event.kind === "attack_melee" || event.kind === "attack_ranged") {
        attackerIds.add(event.attackerId);
      }
    }

    // Process unit_died events: move visuals from unitVisuals to dyingVisuals
    for (const event of events) {
      if (event.kind === "unit_died") {
        const visual = this.unitVisuals.get(event.unitId);
        if (visual !== undefined) {
          if (visual.animState !== null) {
            const st = visual.animState;
            st.isDying = true;
            st.currentAction = "death";
            st.frameIndex = 0;
            st.frameAccMs = 0;
            st.fadeAlpha = 1.0;
            st.fadeDurationMs = 500;
          }
          this.dyingVisuals.set(event.unitId, visual);
          this.unitVisuals.delete(event.unitId);
        }
      }
    }

    const seen = new Set<UnitId>();
    for (const unit of snapshot.units) {
      seen.add(unit.id);
      let visual = this.unitVisuals.get(unit.id);
      if (visual !== undefined && visual.assetId !== unit.assetId) {
        this.unitsLayer.removeChild(visual.container);
        visual.container.destroy({ children: true, context: true });
        this.unitVisuals.delete(unit.id);
        visual = undefined;
      }
      if (visual === undefined) {
        visual = createUnitVisual(unit, assets, snapshot.map);
        // Initialize animState if sheets are available for this unit type
        const animBase = `unit.${unit.type}`;
        if (sheets.has(`${animBase}.anim.walk`)) {
          visual.animState = createAnimState(unit.id, animBase, "idle", sheets);
        }
        this.unitVisuals.set(unit.id, visual);
        this.unitsLayer.addChild(visual.container);
      }

      // Late-init animState when sheets became available after visual creation
      if (visual.animState === null && sheets.has(`unit.${unit.type}.anim.walk`)) {
        visual.animState = createAnimState(unit.id, `unit.${unit.type}`, "idle", sheets);
      }

      visual.unit = unit;
      visual.ring.visible = unit.selected;
      const hpKey = `${unit.hp}/${unit.maxHp}`;
      if (hpKey !== visual.hpKey) {
        redrawHealthBar(visual.healthBar, unit);
        visual.hpKey = hpKey;
      }
      visual.healthBar.visible = unit.hp < unit.maxHp;

      // Update animation state transitions
      if (visual.animState !== null) {
        const st = visual.animState;

        if (attackerIds.has(unit.id) && st.currentAction !== "attack" && st.currentAction !== "death") {
          // Trigger attack animation for one cycle
          const attackSheetKey = `unit.${unit.type}.anim.attack`;
          if (sheets.has(attackSheetKey)) {
            st.currentAction = "attack";
            st.attackCyclesLeft = 1;
            st.frameIndex = 0;
            st.frameAccMs = 0;
          }
        } else if (st.currentAction !== "attack" && st.currentAction !== "death") {
          if (unit.path.length > 0) {
            if (st.currentAction !== "walk") {
              st.currentAction = "walk";
              st.frameIndex = 0;
              st.frameAccMs = 0;
            }
            // Update direction from movement vector
            st.directionRow = quantizeDirection(unit.position, unit.path[0]!);
          } else {
            if (st.currentAction !== "idle") {
              st.currentAction = "idle";
              // Apply phase offset when entering idle
              const idleSheet = sheets.get(`unit.${unit.type}.anim.idle`);
              if (idleSheet !== undefined) {
                st.frameIndex = st.phaseOffset % idleSheet.frames;
              } else {
                st.frameIndex = 0;
              }
              st.frameAccMs = 0;
            }
          }
        }
      }
    }

    for (const [id, visual] of this.unitVisuals) {
      if (!seen.has(id)) {
        this.unitsLayer.removeChild(visual.container);
        visual.container.destroy({ children: true, context: true });
        this.unitVisuals.delete(id);
      }
    }
  }

  private advanceAnimation(visual: UnitVisual, frameDeltaMs: number): void {
    const st = visual.animState;
    if (st === null) return;

    const sheetKey = `unit.${visual.unit.type}.anim.${st.currentAction}`;
    const sheet = this.lastSheets?.get(sheetKey);
    if (sheet === undefined) return;

    const msPerFrame = 1000 / sheet.fps;
    st.frameAccMs += frameDeltaMs;

    if (st.frameAccMs >= msPerFrame) {
      const steps = Math.floor(st.frameAccMs / msPerFrame);
      st.frameAccMs -= steps * msPerFrame;

      const newFrame = st.frameIndex + steps;

      if (sheet.loop) {
        const cycleWrapped = newFrame >= sheet.frames;
        st.frameIndex = newFrame % sheet.frames;

        // Handle attack cycle completion (one full cycle → return to walk/idle)
        if (st.currentAction === "attack" && cycleWrapped) {
          st.attackCyclesLeft--;
          if (st.attackCyclesLeft <= 0) {
            st.currentAction = visual.unit.path.length > 0 ? "walk" : "idle";
            st.frameIndex = 0;
            st.frameAccMs = 0;
          }
        }
      } else {
        // Non-looping animation (death): clamp at last frame
        st.frameIndex = Math.min(newFrame, sheet.frames - 1);
      }
    }

    // Look up the sheet for the (possibly updated) current action
    const currentSheetKey = `unit.${visual.unit.type}.anim.${st.currentAction}`;
    const currentSheet = this.lastSheets?.get(currentSheetKey);
    if (currentSheet === undefined) return;

    const fw = currentSheet.frameWidth;
    const fh = currentSheet.frameHeight;
    // Clamp frameIndex in case action changed and new sheet has fewer frames
    const safeFrame = Math.min(st.frameIndex, currentSheet.frames - 1);
    visual.sprite.texture = new Texture({
      source: currentSheet.texture.source,
      frame: new Rectangle(safeFrame * fw, st.directionRow * fh, fw, fh)
    });
    visual.sprite.anchor.set(currentSheet.anchor.x, currentSheet.anchor.y);
  }
}

/**
 * Returns a deterministic phase offset in [0, 1) from a cell coordinate so
 * that nearby decorations/flags are desynchronised in their animations.
 */
function cellPhaseOffset(pos: CellCoord): number {
  return Math.abs((pos.x * 1637 + pos.y * 2053) % 100) / 100;
}

/**
 * Draws a small pennant triangle for a castle building.
 * The Graphics origin sits at the flag's attachment point (pole top) so that
 * `graphics.rotation` creates a natural flutter around that anchor.
 * The pennant points to the right: (0,0)→(8,3)→(0,6).
 */
function createFlagGraphics(building: BuildingSnapshot, zoom: number): Graphics {
  const point = buildingRenderPoint(building);
  const offsetY = -(building.elevation ?? 0) * ELEVATION_PIXELS_PER_LEVEL;
  const flagX = roundWorldPixel(point.x, zoom);
  // 75 px above the building's render anchor — works for all three building types.
  const flagY = roundWorldPixel(point.y + offsetY, zoom) - 75;

  const flagColor = building.owner === "enemy" ? 0xaa2222 : 0x2244aa;
  const graphics = new Graphics();
  graphics.poly([0, 0, 8, 3, 0, 6]).fill({ color: flagColor, alpha: 0.92 });
  graphics.position.set(flagX, flagY);
  return graphics;
}

/**
 * Signature of everything the static (buildings + decorations + cliff faces)
 * layer renders. Zoom participates because sprite positions are rounded per
 * zoom step; terrainRevision because player terrain edits move cliff cells.
 * The season participates only while a farm exists: farm sprites resolve to
 * seasonal textures, so a season change must rebuild the layer (4x per game
 * year at most — negligible).
 */
function staticSceneSignature(snapshot: WorldSnapshot, zoom: number): string {
  const parts: string[] = [
    `z:${zoom}`,
    `d:${snapshot.map.decorations.length}`,
    `r:${snapshot.terrainRevision ?? 0}`
  ];
  let hasFarm = false;
  for (const building of snapshot.buildings) {
    hasFarm ||= building.type === "farm";
    parts.push(
      `${building.id}|${building.assetId}|${building.position.x},${building.position.y}|` +
        `${building.lifecycleState}|${building.gateState ?? "-"}|${building.owner}|` +
        `${building.ladderHp !== null ? 1 : 0}`
    );
  }
  if (hasFarm) {
    parts.push(`s:${snapshot.economy.season}`);
  }
  return parts.join(";");
}

/** Stable non-cryptographic integer hash for a string. Used for idle phase offsets. */
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Create a fresh AnimState for a unit with idle as the default action. */
function createAnimState(
  unitId: UnitId,
  unitAssetId: string,
  action: "idle" | "walk" | "attack" | "death",
  sheets: ReadonlyMap<string, AnimationSheetAsset>
): AnimState {
  // Use a deterministic hash of the unit id to stagger idle animation start
  // frames so all idle units don't bob in sync.
  const idleSheet = sheets.get(`${unitAssetId}.anim.idle`);
  const maxFrames = idleSheet?.frames ?? 1;
  const phaseOffset = stableHash(unitId) % maxFrames;

  return {
    currentAction: action,
    directionRow: 0,
    frameIndex: action === "idle" ? phaseOffset : 0,
    frameAccMs: 0,
    attackCyclesLeft: 0,
    isDying: false,
    fadeAlpha: 1.0,
    fadeDurationMs: 500,
    phaseOffset
  };
}

/**
 * Quantize a movement vector (from → to, cell coordinates) into one of the
 * 8 direction row indices used by the sprite sheets.
 * Row order: S=0, SE=1, E=2, NE=3, N=4, NW=5, W=6, SW=7
 */
function quantizeDirection(from: CellCoord, to: CellCoord): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dy > 0 && dx === 0) return 0;  // S
  if (dy > 0 && dx > 0)  return 1;  // SE
  if (dy === 0 && dx > 0) return 2; // E
  if (dy < 0 && dx > 0)  return 3;  // NE
  if (dy < 0 && dx === 0) return 4; // N
  if (dy < 0 && dx < 0)  return 5;  // NW
  if (dy === 0 && dx < 0) return 6; // W
  if (dy > 0 && dx < 0)  return 7;  // SW
  return 0; // default south
}

function createUnitVisual(
  unit: UnitSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  map: ElevationMapLike | null
): UnitVisual {
  const container = new Container();

  const ring = createSprite("overlay.unit.selection-ring", assets);
  ring.position.set(0, 0);
  ring.visible = unit.selected;

  const sprite = createSprite(unit.assetId, assets);
  sprite.position.set(0, UNIT_GROUND_OFFSET_Y);
  if (unit.owner === "enemy") {
    sprite.tint = 0xff9f8f;
  }

  const healthBar = new Graphics();
  healthBar.position.set(0, UNIT_GROUND_OFFSET_Y);
  redrawHealthBar(healthBar, unit);
  healthBar.visible = unit.hp < unit.maxHp;

  container.addChild(ring, sprite, healthBar);
  const point = cellToWorld(unit.position);
  container.position.set(point.x, point.y + surfaceOffsetYAt(map, unit.position));
  container.zIndex = point.y + UNIT_GROUND_OFFSET_Y;

  return {
    container,
    ring,
    sprite,
    healthBar,
    unit,
    displayPosition: null,
    hpKey: `${unit.hp}/${unit.maxHp}`,
    assetId: unit.assetId,
    animState: null  // initialized after sheets are available
  };
}

function redrawHealthBar(bar: Graphics, unit: UnitSnapshot): void {
  const width = 28;
  const height = 4;
  const ratio = clamp(unit.hp / unit.maxHp, 0, 1);
  bar.clear();
  bar.rect(-width / 2, -46, width, height).fill({ color: 0x211d18, alpha: 0.9 });
  bar.rect(-width / 2 + 1, -45, (width - 2) * ratio, height - 2).fill({
    color: unit.owner === "enemy" ? 0xd85a4a : 0x58d99a,
    alpha: 0.95
  });
}

export function findUnitAtScreenPoint(
  point: CellCoord,
  snapshot: WorldSnapshot | null,
  camera: CameraState
): UnitSnapshot | null {
  if (snapshot === null) {
    return null;
  }

  let nearest: UnitSnapshot | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const hitRadius = 30 * camera.zoom;

  for (const unit of snapshot.units) {
    const unitPoint = unitScreenPoint(unit, camera, snapshot.map);
    const distance = Math.hypot(point.x - unitPoint.x, point.y - unitPoint.y);
    if (distance <= hitRadius && distance < nearestDistance) {
      nearest = unit;
      nearestDistance = distance;
    }
  }

  return nearest;
}

/** Screen point of a unit's anchor, elevation lift included so hit testing
 *  and box selection line up with the lifted drawing. */
export function unitScreenPoint(unit: UnitSnapshot, camera: CameraState, map: ElevationMapLike | null): CellCoord {
  const point = cellToWorld(unit.position);
  const offsetY =
    map !== null
      ? surfaceOffsetYAt(map, unit.position)
      : -(unit.elevation ?? 0) * ELEVATION_PIXELS_PER_LEVEL;
  return {
    x: camera.x + point.x * camera.zoom,
    y: camera.y + (point.y + offsetY + UNIT_GROUND_OFFSET_Y) * camera.zoom
  };
}

function addBuildingSprite(
  layer: Container,
  building: BuildingSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  zoom: number,
  season: Season
): void {
  if (isBridgeBuildingType(building.type)) {
    addBridgeSprites(layer, building, assets, zoom);
    return;
  }

  const sprite = createSpriteFromCandidates(buildingAssetCandidates(building, season), assets);
  const point = buildingRenderPoint(building);
  // Buildings sit on uniform-elevation footprints (elevation-contract.md §4);
  // the anchor cell's elevation lifts the whole sprite.
  const offsetY = -(building.elevation ?? 0) * ELEVATION_PIXELS_PER_LEVEL;
  sprite.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y + offsetY, zoom));
  if (building.type === "honmaru") {
    // The marker asset is a single-cell ground diamond; scale it to cover the
    // whole (map-authored) footprint without needing a regenerated asset.
    sprite.scale.set(honmaruMarkerScale(building));
  }
  if (building.owner === "enemy") {
    sprite.tint = 0xffaaa0;
  }
  layer.addChild(sprite);

  if (building.ladderHp !== null) {
    const ladderAsset = assets.get("building.wall.ladder.attached");
    if (ladderAsset !== undefined) {
      const ladder = new Sprite(ladderAsset.texture);
      ladder.anchor.set(ladderAsset.anchor.x, ladderAsset.anchor.y);
      ladder.position.set(sprite.position.x, sprite.position.y);
      layer.addChild(ladder);
    }
  }
}

/**
 * Bridges draw one segment sprite per footprint cell (start / mid / end
 * auto-tiling) so any span length tiles seamlessly; each segment's deck
 * diamond center sits exactly on its cell center. Footprint order is
 * min-to-max along the deck axis, which matches the painter's order.
 */
function addBridgeSprites(
  layer: Container,
  building: BuildingSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  zoom: number
): void {
  const offsetY = -(building.elevation ?? 0) * ELEVATION_PIXELS_PER_LEVEL;
  const cells = building.footprint.length > 0 ? building.footprint : [building.position];
  for (const cell of cells) {
    const sprite = createSpriteFromCandidates(bridgeCellAssetCandidates(building, cell), assets);
    const point = cellToWorld(cell);
    sprite.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y + offsetY, zoom));
    if (building.owner === "enemy") {
      sprite.tint = 0xffaaa0;
    }
    layer.addChild(sprite);
  }
}

function addDecorationSprite(
  layer: Container,
  decoration: MapDecoration,
  assets: ReadonlyMap<string, LoadedAsset>,
  zoom: number,
  map: ElevationMapLike
): Sprite | null {
  const asset = assets.get(decoration.assetId);
  if (asset === undefined) {
    return null;
  }
  const sprite = new Sprite(asset.texture);
  sprite.anchor.set(asset.anchor.x, asset.anchor.y);
  const point = cellToWorld(decoration.position);
  const offsetY = tileOffsetYAt(map, decoration.position);
  sprite.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y + offsetY, zoom));
  layer.addChild(sprite);
  return sprite;
}

type SceneItemForSort =
  | { readonly kind: "building"; readonly item: BuildingSnapshot }
  | { readonly kind: "decoration"; readonly item: MapDecoration }
  | { readonly kind: "cliff"; readonly item: TerrainCellSnapshot }
  | { readonly kind: "slope"; readonly item: TerrainCellSnapshot }
  | { readonly kind: "floor"; readonly item: TerrainCellSnapshot };

function sceneItemRank(entry: SceneItemForSort): number {
  if (entry.kind === "floor") return 0;
  if (entry.kind === "cliff" || entry.kind === "slope") return 1;
  return 2;
}

function sceneItemId(entry: SceneItemForSort): string {
  if (entry.kind === "building") {
    return entry.item.id;
  }
  if (entry.kind === "cliff" || entry.kind === "slope" || entry.kind === "floor") {
    return `${entry.kind}:${entry.item.coord.x},${entry.item.coord.y}`;
  }
  return `dec:${entry.item.position.x},${entry.item.position.y}`;
}

function sceneItemRect(entry: SceneItemForSort): FootprintRect {
  if (entry.kind === "cliff" || entry.kind === "slope" || entry.kind === "floor") {
    const { x, y } = entry.item.coord;
    return { minX: x, maxX: x, minY: y, maxY: y };
  }
  if (entry.kind === "building") {
    const fp = entry.item.footprint;
    if (fp.length === 0) {
      const { x, y } = entry.item.position;
      return { minX: x, maxX: x, minY: y, maxY: y };
    }
    let minX = fp[0]!.x, maxX = fp[0]!.x, minY = fp[0]!.y, maxY = fp[0]!.y;
    for (let i = 1; i < fp.length; i++) {
      const c = fp[i]!;
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
    return { minX, maxX, minY, maxY };
  }
  const { x, y } = entry.item.position;
  return { minX: x, maxX: x, minY: y, maxY: y };
}

// Isometric painter's sort for scene items (buildings + decorations).
// Step 1: primary sort by south-corner depth (maxX+maxY) — a good approximation
//   but non-transitive for separated footprints (e.g. 1x1 wall to the NE of a
//   large building, or a tree south of an 8x8 tenshu).
// Step 2: a few bubble passes that swap adjacent pairs only when the footprint
//   separation test definitively says they are in the wrong order.
function isoSort(items: SceneItemForSort[]): void {
  items.sort((a, b) => {
    const ra = sceneItemRect(a);
    const rb = sceneItemRect(b);
    const diff = (ra.maxX + ra.maxY) - (rb.maxX + rb.maxY);
    if (diff !== 0) return diff;
    // Same-depth tie: duplicated lifted floors paint before terrain features
    // (a face/slope on the same diagonal stands on or in front of the floor),
    // and terrain features paint before buildings/decorations. A building
    // whose south corner lies on the same diagonal sits on the HIGH terrace
    // behind the face (the bubble passes keep it there), while a decoration
    // on the cliff cell itself stands on the low-side floor in front of the
    // wall.
    const rankA = sceneItemRank(a);
    const rankB = sceneItemRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return sceneItemId(a).localeCompare(sceneItemId(b));
  });

  // Enough passes for a terrace-top building to bubble back past the row of
  // cliff cells hanging off its south/east edge (up to footprint-width swaps;
  // the widest building, the 4x4 tenshu, needs 4).
  const PASSES = 8;
  for (let pass = 0; pass < PASSES; pass++) {
    let swapped = false;
    for (let i = 0; i < items.length - 1; i++) {
      const ra = sceneItemRect(items[i]!);
      const rb = sceneItemRect(items[i + 1]!);
      // items[i+1] is provably behind items[i] AND not in a mutual/diagonal relationship
      // (both separated in opposing axes → depth fallback keeps primary-sort order).
      if (isoBehind(rb, ra) && !isoBehind(ra, rb)) {
        const tmp = items[i]!;
        items[i] = items[i + 1]!;
        items[i + 1] = tmp;
        swapped = true;
      }
    }
    if (!swapped) break;
  }
}
