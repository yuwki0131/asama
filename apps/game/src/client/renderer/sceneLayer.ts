import { Container, Graphics, Sprite } from "pixi.js";
import type { BuildingSnapshot, CellCoord, MapDecoration, UnitId, UnitSnapshot, WorldSnapshot } from "@asama/shared";
import { clearLayer, createSprite, createSpriteFromCandidates, type LoadedAsset } from "./assets";
import {
  cellToWorld,
  clamp,
  isVisibleCell,
  roundWorldPixel,
  type CameraState,
  UNIT_GROUND_OFFSET_Y
} from "./camera";
import { buildingAssetCandidates } from "./gameRules";
import { interpolateUnitWorldPosition, resolveDisplayPosition, type WorldPoint } from "./interpolation";
import { buildingRenderPoint, isoBehind } from "./renderGeometry";
import type { FootprintRect } from "./renderGeometry";

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
}

interface DecorationVisual {
  readonly position: CellCoord;
  readonly sprite: Sprite;
}

/**
 * Retained scene graph for buildings, decorations and units.
 *
 * - Buildings + decorations are rebuilt only when their visual signature
 *   changes (id / asset / state / zoom step), not per snapshot or per frame.
 * - Units are kept in a Map keyed by unit id; per frame only position,
 *   depth (zIndex Y-sort) and visibility are updated. Sprites are created
 *   and destroyed exclusively on unit add/remove.
 */
export class RetainedScene {
  readonly root = new Container();
  private readonly staticLayer = new Container();
  private readonly unitsLayer = new Container();
  private readonly unitVisuals = new Map<UnitId, UnitVisual>();
  private decorationVisuals: DecorationVisual[] = [];
  private staticSignature: string | null = null;
  private lastSnapshot: WorldSnapshot | null = null;
  private lastAssets: ReadonlyMap<string, LoadedAsset> | null = null;
  private lastZoom: number | null = null;

  constructor() {
    // Units always paint above buildings (matches the legacy draw order);
    // within the unit layer, zIndex carries the per-frame Y-sort.
    this.unitsLayer.sortableChildren = true;
    this.root.addChild(this.staticLayer, this.unitsLayer);
  }

  /** Reconciles retained visuals with a snapshot. Cheap when nothing changed. */
  sync(snapshot: WorldSnapshot, assets: ReadonlyMap<string, LoadedAsset>, zoom: number): void {
    const snapshotChanged = snapshot !== this.lastSnapshot;
    const assetsChanged = assets !== this.lastAssets;
    const zoomChanged = zoom !== this.lastZoom;
    if (!snapshotChanged && !assetsChanged && !zoomChanged) {
      return;
    }
    this.lastSnapshot = snapshot;
    this.lastAssets = assets;
    this.lastZoom = zoom;

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

    if (snapshotChanged || assetsChanged) {
      this.syncUnits(snapshot, assets);
    }
  }

  /**
   * Per-frame update: interpolated unit positions, Y-sort depth and
   * decoration visibility culling. No allocation of display objects.
   */
  updateFrame(
    elapsedTicks: number,
    frameDeltaMs: number,
    camera: CameraState,
    screenWidth: number,
    screenHeight: number
  ): void {
    for (const visual of this.unitVisuals.values()) {
      const target = interpolateUnitWorldPosition(visual.unit, elapsedTicks);
      const display = resolveDisplayPosition(visual.displayPosition, target, frameDeltaMs);
      visual.displayPosition = display;
      visual.container.position.set(display.x, display.y);
      visual.container.zIndex = display.y + UNIT_GROUND_OFFSET_Y;
    }

    for (const decoration of this.decorationVisuals) {
      decoration.sprite.visible = isVisibleCell(decoration.position, camera, screenWidth, screenHeight);
    }
  }

  destroy(): void {
    this.destroyUnitVisuals();
    this.decorationVisuals = [];
    this.root.destroy({ children: true, context: true });
  }

  private destroyUnitVisuals(): void {
    for (const visual of this.unitVisuals.values()) {
      this.unitsLayer.removeChild(visual.container);
      visual.container.destroy({ children: true, context: true });
    }
    this.unitVisuals.clear();
  }

  private rebuildStaticLayer(
    snapshot: WorldSnapshot,
    assets: ReadonlyMap<string, LoadedAsset>,
    zoom: number
  ): void {
    clearLayer(this.staticLayer);
    this.decorationVisuals = [];

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

    // Merge buildings and decorations into a single Y-sorted list so decorations
    // participate in the same painter's-order as buildings (fixes trees rendering
    // on top of tenshu/honmaru regardless of their Y position). All decorations
    // are included; camera culling happens per frame via sprite visibility.
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
    isoSort(sceneItems);

    for (const entry of sceneItems) {
      if (entry.kind === "building") {
        addBuildingSprite(this.staticLayer, entry.item, assets, zoom);
      } else {
        const sprite = addDecorationSprite(this.staticLayer, entry.item, assets, zoom);
        if (sprite !== null) {
          this.decorationVisuals.push({ position: entry.item.position, sprite });
        }
      }
    }
  }

  private syncUnits(snapshot: WorldSnapshot, assets: ReadonlyMap<string, LoadedAsset>): void {
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
        visual = createUnitVisual(unit, assets);
        this.unitVisuals.set(unit.id, visual);
        this.unitsLayer.addChild(visual.container);
      }
      visual.unit = unit;
      visual.ring.visible = unit.selected;
      const hpKey = `${unit.hp}/${unit.maxHp}`;
      if (hpKey !== visual.hpKey) {
        redrawHealthBar(visual.healthBar, unit);
        visual.hpKey = hpKey;
      }
      visual.healthBar.visible = unit.hp < unit.maxHp;
    }

    for (const [id, visual] of this.unitVisuals) {
      if (!seen.has(id)) {
        this.unitsLayer.removeChild(visual.container);
        visual.container.destroy({ children: true, context: true });
        this.unitVisuals.delete(id);
      }
    }
  }
}

/**
 * Signature of everything the static (buildings + decorations) layer renders.
 * Zoom participates because sprite positions are rounded per zoom step.
 */
function staticSceneSignature(snapshot: WorldSnapshot, zoom: number): string {
  const parts: string[] = [`z:${zoom}`, `d:${snapshot.map.decorations.length}`];
  for (const building of snapshot.buildings) {
    parts.push(
      `${building.id}|${building.assetId}|${building.position.x},${building.position.y}|` +
        `${building.lifecycleState}|${building.gateState ?? "-"}|${building.owner}|` +
        `${building.ladderHp !== null ? 1 : 0}`
    );
  }
  return parts.join(";");
}

function createUnitVisual(unit: UnitSnapshot, assets: ReadonlyMap<string, LoadedAsset>): UnitVisual {
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
  container.position.set(point.x, point.y);
  container.zIndex = point.y + UNIT_GROUND_OFFSET_Y;

  return {
    container,
    ring,
    sprite,
    healthBar,
    unit,
    displayPosition: null,
    hpKey: `${unit.hp}/${unit.maxHp}`,
    assetId: unit.assetId
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
    const unitPoint = unitScreenPoint(unit, camera);
    const distance = Math.hypot(point.x - unitPoint.x, point.y - unitPoint.y);
    if (distance <= hitRadius && distance < nearestDistance) {
      nearest = unit;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function unitScreenPoint(unit: UnitSnapshot, camera: CameraState): CellCoord {
  const point = cellToWorld(unit.position);
  return {
    x: camera.x + point.x * camera.zoom,
    y: camera.y + (point.y + UNIT_GROUND_OFFSET_Y) * camera.zoom
  };
}

function addBuildingSprite(
  layer: Container,
  building: BuildingSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  zoom: number
): void {
  const sprite = createSpriteFromCandidates(buildingAssetCandidates(building), assets);
  const point = buildingRenderPoint(building);
  sprite.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y, zoom));
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

function addDecorationSprite(
  layer: Container,
  decoration: MapDecoration,
  assets: ReadonlyMap<string, LoadedAsset>,
  zoom: number
): Sprite | null {
  const asset = assets.get(decoration.assetId);
  if (asset === undefined) {
    return null;
  }
  const sprite = new Sprite(asset.texture);
  sprite.anchor.set(asset.anchor.x, asset.anchor.y);
  const point = cellToWorld(decoration.position);
  sprite.position.set(roundWorldPixel(point.x, zoom), roundWorldPixel(point.y, zoom));
  layer.addChild(sprite);
  return sprite;
}

type SceneItemForSort =
  | { readonly kind: "building"; readonly item: BuildingSnapshot }
  | { readonly kind: "decoration"; readonly item: MapDecoration };

function sceneItemId(entry: SceneItemForSort): string {
  return entry.kind === "building" ? entry.item.id : `dec:${entry.item.position.x},${entry.item.position.y}`;
}

function sceneItemRect(entry: SceneItemForSort): FootprintRect {
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
    return sceneItemId(a).localeCompare(sceneItemId(b));
  });

  const PASSES = 3;
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
