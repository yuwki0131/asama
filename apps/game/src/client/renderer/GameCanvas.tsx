import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import type {
  BuildingSnapshot,
  BuildingType,
  CellCoord,
  EntityId,
  TerrainCellSnapshot,
  UnitId,
  UnitSnapshot,
  WorldSnapshot
} from "@asama/shared";

interface GameCanvasProps {
  readonly snapshot: WorldSnapshot | null;
  readonly buildTool: BuildingType | "demolish" | null;
  readonly onSelectUnit: (unitId: UnitId) => void;
  readonly onAttackTarget: (targetId: EntityId) => void;
  readonly onMoveSelected: (destination: CellCoord) => void;
  readonly onPlaceBuilding: (buildingType: BuildingType, position: CellCoord) => void;
  readonly onDemolishBuilding: (position: CellCoord) => void;
}

interface AssetManifest {
  readonly assets: readonly {
    readonly assetId: string;
    readonly file: string;
    readonly anchor: {
      readonly x: number;
      readonly y: number;
    };
  }[];
}

interface LoadedAsset {
  readonly texture: Texture;
  readonly anchor: {
    readonly x: number;
    readonly y: number;
  };
}

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const UNIT_GROUND_OFFSET_Y = 0;
const TERRAIN_UNDERLAY_PADDING = 1.25;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2;
const GENERATED_MANIFEST_URL = "/assets/generated/manifest.json";
const BUILDING_FOOTPRINTS: Record<BuildingType, readonly CellCoord[]> = {
  fence: rectangleFootprint(1, 1),
  wall: rectangleFootprint(1, 1),
  gate: rectangleFootprint(1, 1),
  gate_wide_2: rectangleFootprint(2, 1),
  gate_wide_3: rectangleFootprint(3, 1),
  dry_moat: rectangleFootprint(1, 1),
  water_moat: rectangleFootprint(1, 1),
  storehouse: rectangleFootprint(4, 4),
  market: rectangleFootprint(6, 4),
  barracks: rectangleFootprint(6, 4),
  samurai_residence: rectangleFootprint(6, 6),
  town_block: rectangleFootprint(8, 8),
  farm: rectangleFootprint(4, 4),
  road: rectangleFootprint(1, 1),
  earth_bridge: rectangleFootprint(1, 1),
  wood_bridge: rectangleFootprint(1, 1),
  honmaru: rectangleFootprint(1, 1),
  tenshu: rectangleFootprint(8, 8)
};

export function GameCanvas({
  snapshot,
  buildTool,
  onSelectUnit,
  onAttackTarget,
  onMoveSelected,
  onPlaceBuilding,
  onDemolishBuilding
}: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const terrainLayerRef = useRef<Container | null>(null);
  const overlayLayerRef = useRef<Container | null>(null);
  const unitLayerRef = useRef<Container | null>(null);
  const lastTerrainKeyRef = useRef<string | null>(null);
  const snapshotRef = useRef<WorldSnapshot | null>(snapshot);
  const buildToolRef = useRef<BuildingType | "demolish" | null>(buildTool);
  const onSelectUnitRef = useRef(onSelectUnit);
  const onAttackTargetRef = useRef(onAttackTarget);
  const onPlaceBuildingRef = useRef(onPlaceBuilding);
  const onDemolishBuildingRef = useRef(onDemolishBuilding);
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [assets, setAssets] = useState<ReadonlyMap<string, LoadedAsset>>(new Map());
  const [hoverCell, setHoverCell] = useState<CellCoord | null>(null);
  const [selectedCell, setSelectedCell] = useState<CellCoord | null>(null);
  const [localInvalidMoveTarget, setLocalInvalidMoveTarget] = useState<CellCoord | null>(null);
  const [cameraVersion, setCameraVersion] = useState(0);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    buildToolRef.current = buildTool;
  }, [buildTool]);

  useEffect(() => {
    onSelectUnitRef.current = onSelectUnit;
  }, [onSelectUnit]);

  useEffect(() => {
    onAttackTargetRef.current = onAttackTarget;
  }, [onAttackTarget]);

  useEffect(() => {
    onPlaceBuildingRef.current = onPlaceBuilding;
  }, [onPlaceBuilding]);

  useEffect(() => {
    onDemolishBuildingRef.current = onDemolishBuilding;
  }, [onDemolishBuilding]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }

    const app = new Application();
    let disposed = false;

    void app
      .init({
        resizeTo: host,
        background: "#1c2227",
        antialias: true
      })
      .then(() => {
        if (disposed) {
          app.destroy();
          return;
        }

        host.appendChild(app.canvas);
        app.canvas.style.width = "100%";
        app.canvas.style.height = "100%";
        app.canvas.style.touchAction = "none";

        const world = new Container();
        const terrainLayer = new Container();
        const overlayLayer = new Container();
        const unitLayer = new Container();
        world.addChild(terrainLayer, overlayLayer, unitLayer);
        app.stage.addChild(world);
        appRef.current = app;
        worldRef.current = world;
        terrainLayerRef.current = terrainLayer;
        overlayLayerRef.current = overlayLayer;
        unitLayerRef.current = unitLayer;
        centerCameraOnCell({ x: 64, y: 64 }, host, cameraRef.current);
        setReady(true);
      });

    return () => {
      disposed = true;
      appRef.current?.destroy(true);
      appRef.current = null;
      worldRef.current = null;
      terrainLayerRef.current = null;
      overlayLayerRef.current = null;
      unitLayerRef.current = null;
      lastTerrainKeyRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadAssets(): Promise<void> {
      const response = await fetch(GENERATED_MANIFEST_URL);
      if (!response.ok) {
        throw new Error(`Failed to load asset manifest: ${response.status}`);
      }

      const manifest = (await response.json()) as AssetManifest;
      const loaded = new Map<string, LoadedAsset>();
      for (const asset of manifest.assets) {
        const texture = await Assets.load<Texture>(`/assets/${asset.file}`);
        loaded.set(asset.assetId, {
          texture,
          anchor: asset.anchor
        });
      }

      if (!disposed) {
        setAssets(loaded);
      }
    }

    void loadAssets().catch((error) => {
      console.error(error);
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || snapshot === null || assets.size === 0) {
      return;
    }

    renderScene(
      appRef.current,
      worldRef.current,
      terrainLayerRef.current,
      overlayLayerRef.current,
      unitLayerRef.current,
      lastTerrainKeyRef,
      snapshot,
      assets,
      cameraRef.current,
      cameraVersion,
      buildTool,
      hoverCell,
      selectedCell,
      localInvalidMoveTarget
    );
  }, [assets, buildTool, cameraVersion, hoverCell, localInvalidMoveTarget, ready, selectedCell, snapshot]);

  useEffect(() => {
    const app = appRef.current;
    const host = hostRef.current;
    if (app === null || host === null) {
      return;
    }

    const canvas = app.canvas;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false
      };
      canvas.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag !== null && drag.pointerId === event.pointerId) {
        const totalDx = event.clientX - drag.startX;
        const totalDy = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(totalDx, totalDy) > 6) {
          drag.moved = true;
        }
        if (drag.moved) {
          const dx = event.clientX - drag.lastX;
          const dy = event.clientY - drag.lastY;
          cameraRef.current.x += dx;
          cameraRef.current.y += dy;
          setCameraVersion((version) => version + 1);
        }
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      setHoverCell(screenToCell(event.clientX - rect.left, event.clientY - rect.top, cameraRef.current));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) {
        return;
      }

      dragRef.current = null;
      canvas.releasePointerCapture(event.pointerId);
      if (!drag.moved) {
        const rect = canvas.getBoundingClientRect();
        const screenPoint = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        };
        const clickedCell = screenToCell(screenPoint.x, screenPoint.y, cameraRef.current);
        const activeBuildTool = buildToolRef.current;
        if (activeBuildTool === "demolish") {
          setSelectedCell(clickedCell);
          onDemolishBuildingRef.current(clickedCell);
          return;
        }

        if (activeBuildTool !== null) {
          setSelectedCell(clickedCell);
          onPlaceBuildingRef.current(activeBuildTool, clickedCell);
          return;
        }

        const hitUnit = findUnitAtScreenPoint(screenPoint, snapshotRef.current, cameraRef.current);
        if (hitUnit !== null) {
          onSelectUnitRef.current(hitUnit.id);
          setSelectedCell(null);
          return;
        }

        setSelectedCell(clickedCell);
      }
    };

    const handlePointerLeave = () => {
      setHoverCell(null);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const before = screenToWorld(event.clientX - rect.left, event.clientY - rect.top, cameraRef.current);
      const nextZoom = clamp(cameraRef.current.zoom * (event.deltaY > 0 ? 0.9 : 1.1), MIN_ZOOM, MAX_ZOOM);
      cameraRef.current.zoom = nextZoom;
      cameraRef.current.x = event.clientX - rect.left - before.x * nextZoom;
      cameraRef.current.y = event.clientY - rect.top - before.y * nextZoom;
      setCameraVersion((version) => version + 1);
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const screenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      const destination = screenToCell(screenPoint.x, screenPoint.y, cameraRef.current);
      if (buildToolRef.current !== null) {
        return;
      }

      const snapshot = snapshotRef.current;
      const hitUnit = findUnitAtScreenPoint(screenPoint, snapshot, cameraRef.current);
      if (hitUnit !== null && hitUnit.owner === "enemy") {
        setSelectedCell(hitUnit.position);
        setLocalInvalidMoveTarget(null);
        onAttackTargetRef.current(hitUnit.id);
        return;
      }

      const hitBuilding = findBuildingAtCell(destination, snapshot);
      if (hitBuilding !== null && hitBuilding.owner === "enemy") {
        setSelectedCell(destination);
        setLocalInvalidMoveTarget(null);
        onAttackTargetRef.current(hitBuilding.id);
        return;
      }

      const targetCell = getSnapshotCell(snapshotRef.current, destination);
      setSelectedCell(destination);
      if (targetCell === null || !isSnapshotPassable(snapshot, destination)) {
        setLocalInvalidMoveTarget(destination);
        return;
      }

      setLocalInvalidMoveTarget(null);
      onMoveSelected(destination);
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("contextmenu", handleContextMenu);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [onMoveSelected, ready]);

  return <div ref={hostRef} className="game-canvas" />;
}

function renderScene(
  app: Application | null,
  world: Container | null,
  terrainLayer: Container | null,
  overlayLayer: Container | null,
  unitLayer: Container | null,
  lastTerrainKeyRef: { current: string | null },
  snapshot: WorldSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>,
  camera: CameraState,
  cameraVersion: number,
  buildTool: BuildingType | "demolish" | null,
  hoverCell: CellCoord | null,
  selectedCell: CellCoord | null,
  localInvalidMoveTarget: CellCoord | null
): void {
  if (app === null || world === null || terrainLayer === null || overlayLayer === null || unitLayer === null) {
    return;
  }

  world.position.set(camera.x, camera.y);
  world.scale.set(camera.zoom);

  const firstCell = snapshot.map.cells[0]?.coord;
  const lastCell = snapshot.map.cells[snapshot.map.cells.length - 1]?.coord;
  const terrainKey = `${cameraVersion}:${snapshot.map.width}:${snapshot.map.height}:${assets.size}:${snapshot.map.cells.length}:${firstCell?.x ?? 0},${firstCell?.y ?? 0}:${lastCell?.x ?? 0},${lastCell?.y ?? 0}`;
  if (lastTerrainKeyRef.current !== terrainKey) {
    terrainLayer.removeChildren();
    const terrainUnderlay = new Graphics();
    terrainLayer.addChild(terrainUnderlay);
    for (const cell of snapshot.map.cells) {
      if (isVisibleCell(cell.coord, camera, app.screen.width, app.screen.height)) {
        addTerrainUnderlay(terrainUnderlay, cell);
        addTerrainSprite(terrainLayer, cell, assets);
      }
    }
    lastTerrainKeyRef.current = terrainKey;
  }

  overlayLayer.removeChildren();
  unitLayer.removeChildren();

  for (const unit of snapshot.units) {
    addPathSprites(overlayLayer, unit, assets);
  }

  if (selectedCell !== null) {
    addCellActionPreview(overlayLayer, selectedCell, snapshot, buildTool, assets);
  }

  if (hoverCell !== null && isInsideSnapshotMap(hoverCell, snapshot)) {
    const cell = getSnapshotCell(snapshot, hoverCell);
    addOverlaySprite(overlayLayer, hoverCell, cell?.passable === false ? "overlay.cell.blocked" : "overlay.cell.hover", assets);
  }

  const invalidMoveTarget = snapshot.invalidMoveTarget ?? localInvalidMoveTarget;
  if (invalidMoveTarget !== null && isInsideSnapshotMap(invalidMoveTarget, snapshot)) {
    addOverlaySprite(overlayLayer, invalidMoveTarget, "overlay.cell.blocked", assets);
  }

  for (const building of [...snapshot.buildings].sort(compareBuildingsForDraw)) {
    addBuildingSprite(unitLayer, building, assets);
  }

  for (const unit of [...snapshot.units].sort(compareUnitsForDraw)) {
    addUnitSprite(unitLayer, unit, assets);
  }
}

function addTerrainSprite(layer: Container, cell: TerrainCellSnapshot, assets: ReadonlyMap<string, LoadedAsset>): void {
  const point = cellToWorld(cell.coord);
  const sprite = createSprite(cell.assetId, assets);
  sprite.position.copyFrom(point);
  layer.addChild(sprite);
}

function addTerrainUnderlay(graphics: Graphics, cell: TerrainCellSnapshot): void {
  const point = cellToWorld(cell.coord);
  const halfWidth = TILE_WIDTH / 2 + TERRAIN_UNDERLAY_PADDING;
  const halfHeight = TILE_HEIGHT / 2 + TERRAIN_UNDERLAY_PADDING / 2;

  graphics
    .poly([
      point.x,
      point.y - halfHeight,
      point.x + halfWidth,
      point.y,
      point.x,
      point.y + halfHeight,
      point.x - halfWidth,
      point.y
    ])
    .fill({ color: terrainUnderlayColor(cell.terrain), alpha: 1 });
}

function terrainUnderlayColor(terrain: TerrainCellSnapshot["terrain"]): number {
  if (terrain === "dirt") {
    return 0x745a35;
  }
  if (terrain === "water") {
    return 0x2e7e8e;
  }
  if (terrain === "stone") {
    return 0x68706a;
  }
  return 0x63753a;
}

function addPathSprites(layer: Container, unit: UnitSnapshot, assets: ReadonlyMap<string, LoadedAsset>): void {
  if (!unit.selected) {
    return;
  }

  for (const step of unit.path) {
    addOverlaySprite(layer, step, "overlay.path.step", assets);
  }

  if (unit.destination !== null) {
    addOverlaySprite(layer, unit.destination, "overlay.move.destination", assets);
  }
}

function addOverlaySprite(
  layer: Container,
  cell: CellCoord,
  assetId: string,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const sprite = createSprite(assetId, assets);
  sprite.position.copyFrom(cellToWorld(cell));
  layer.addChild(sprite);
}

function addCellActionPreview(
  layer: Container,
  cell: CellCoord,
  snapshot: WorldSnapshot,
  buildTool: BuildingType | "demolish" | null,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  if (buildTool === null) {
    addOverlaySprite(layer, cell, "overlay.cell.selected", assets);
    return;
  }

  if (buildTool === "demolish") {
    const hasBuilding = findBuildingAtCell(cell, snapshot) !== null;
    addOverlaySprite(layer, cell, hasBuilding ? "overlay.demolish.target" : "overlay.build.invalid", assets);
    return;
  }

  const footprint = buildingPreviewFootprint(buildTool, cell);
  const canPlace = footprint.every((footprintCell) => canPreviewPlaceBuildingCell(snapshot, footprintCell, buildTool));
  for (const footprintCell of footprint) {
    if (isInsideSnapshotMap(footprintCell, snapshot)) {
      addOverlaySprite(layer, footprintCell, canPlace ? "overlay.build.valid" : "overlay.build.invalid", assets);
    }
  }
}

function addBuildingSprite(
  layer: Container,
  building: BuildingSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  const sprite = createSpriteFromCandidates(buildingAssetCandidates(building), assets);
  const point = buildingRenderPoint(building);
  sprite.position.set(point.x, point.y);
  if (building.owner === "enemy") {
    sprite.tint = 0xffaaa0;
  }
  layer.addChild(sprite);
}

function addUnitSprite(
  layer: Container,
  unit: UnitSnapshot,
  assets: ReadonlyMap<string, LoadedAsset>
): void {
  if (unit.selected) {
    const ring = createSprite("overlay.unit.selection-ring", assets);
    ring.position.copyFrom(cellToWorld(unit.position));
    layer.addChild(ring);
  }

  const sprite = createSprite(unit.assetId, assets);
  const point = cellToWorld(unit.position);
  sprite.position.set(point.x, point.y + UNIT_GROUND_OFFSET_Y);
  if (unit.owner === "enemy") {
    sprite.tint = 0xff9f8f;
  }
  layer.addChild(sprite);

  addUnitHealthBar(layer, unit, point);
}

function addUnitHealthBar(layer: Container, unit: UnitSnapshot, point: CellCoord): void {
  if (unit.hp >= unit.maxHp) {
    return;
  }

  const width = 28;
  const height = 4;
  const ratio = clamp(unit.hp / unit.maxHp, 0, 1);
  const bar = new Graphics();
  bar.rect(-width / 2, -46, width, height).fill({ color: 0x211d18, alpha: 0.9 });
  bar.rect(-width / 2 + 1, -45, (width - 2) * ratio, height - 2).fill({
    color: unit.owner === "enemy" ? 0xd85a4a : 0x58d99a,
    alpha: 0.95
  });
  bar.position.set(point.x, point.y + UNIT_GROUND_OFFSET_Y);
  layer.addChild(bar);
}

function createSprite(assetId: string, assets: ReadonlyMap<string, LoadedAsset>, fallbackAssetId = "overlay.cell.selected"): Sprite {
  const asset = assets.get(assetId) ?? assets.get(fallbackAssetId);
  const sprite = new Sprite(asset?.texture ?? Texture.EMPTY);
  sprite.anchor.set(asset?.anchor.x ?? 0.5, asset?.anchor.y ?? 0.5);
  return sprite;
}

function createSpriteFromCandidates(assetIds: readonly string[], assets: ReadonlyMap<string, LoadedAsset>): Sprite {
  for (const assetId of assetIds) {
    const asset = assets.get(assetId);
    if (asset !== undefined) {
      const sprite = new Sprite(asset.texture);
      sprite.anchor.set(asset.anchor.x, asset.anchor.y);
      return sprite;
    }
  }

  const sprite = new Sprite(Texture.EMPTY);
  sprite.anchor.set(0.5, 0.5);
  return sprite;
}

function cellToWorld(cell: CellCoord): CellCoord {
  return {
    x: (cell.x - cell.y) * (TILE_WIDTH / 2),
    y: (cell.x + cell.y) * (TILE_HEIGHT / 2)
  };
}

function buildingRenderPoint(building: BuildingSnapshot): CellCoord {
  if (building.footprint.length === 0) {
    return cellToWorld(building.position);
  }

  if (!isGroundPlaneBuilding(building.type)) {
    return buildingFootprintBottomPoint(building);
  }

  const total = building.footprint.reduce(
    (accumulator, cell) => {
      const point = cellToWorld(cell);
      return {
        x: accumulator.x + point.x,
        y: accumulator.y + point.y
      };
    },
    { x: 0, y: 0 }
  );

  return {
    x: total.x / building.footprint.length,
    y: total.y / building.footprint.length
  };
}

function buildingFootprintBottomPoint(building: BuildingSnapshot): CellCoord {
  const bottomCells = building.footprint.reduce(
    (accumulator, cell) => {
      const point = cellToWorld(cell);
      if (point.y > accumulator.y) {
        return { y: point.y, cells: [{ cell, point }] };
      }

      if (point.y === accumulator.y) {
        return { y: accumulator.y, cells: [...accumulator.cells, { cell, point }] };
      }

      return accumulator;
    },
    { y: Number.NEGATIVE_INFINITY, cells: [] as { readonly cell: CellCoord; readonly point: CellCoord }[] }
  );

  if (bottomCells.cells.length === 0) {
    return cellToWorld(building.position);
  }

  const x = bottomCells.cells.reduce((sum, item) => sum + item.point.x, 0) / bottomCells.cells.length;
  return {
    x,
    y: bottomCells.y + TILE_HEIGHT / 2
  };
}

function isGroundPlaneBuilding(buildingType: BuildingType): boolean {
  return (
    buildingType === "dry_moat" ||
    buildingType === "water_moat" ||
    buildingType === "honmaru" ||
    buildingType === "farm" ||
    buildingType === "road" ||
    buildingType === "earth_bridge" ||
    buildingType === "wood_bridge"
  );
}

function screenToWorld(x: number, y: number, camera: CameraState): CellCoord {
  return {
    x: (x - camera.x) / camera.zoom,
    y: (y - camera.y) / camera.zoom
  };
}

function screenToCell(x: number, y: number, camera: CameraState): CellCoord {
  const local = screenToWorld(x, y, camera);
  return {
    x: Math.round(local.y / TILE_HEIGHT + local.x / TILE_WIDTH),
    y: Math.round(local.y / TILE_HEIGHT - local.x / TILE_WIDTH)
  };
}

function worldToScreen(point: CellCoord, camera: CameraState): CellCoord {
  return {
    x: camera.x + point.x * camera.zoom,
    y: camera.y + point.y * camera.zoom
  };
}

function unitScreenPoint(unit: UnitSnapshot, camera: CameraState): CellCoord {
  const point = cellToWorld(unit.position);
  return worldToScreen({ x: point.x, y: point.y + UNIT_GROUND_OFFSET_Y }, camera);
}

function findUnitAtScreenPoint(
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

function isVisibleCell(cell: CellCoord, camera: CameraState, width: number, height: number): boolean {
  const point = worldToScreen(cellToWorld(cell), camera);
  const margin = TILE_WIDTH * camera.zoom * 2;
  return point.x >= -margin && point.x <= width + margin && point.y >= -margin && point.y <= height + margin;
}

function centerCameraOnCell(cell: CellCoord, host: HTMLElement, camera: CameraState): void {
  const world = cellToWorld(cell);
  camera.zoom = 1;
  camera.x = host.clientWidth / 2 - world.x;
  camera.y = host.clientHeight / 2 - world.y;
}

function compareUnitsForDraw(a: UnitSnapshot, b: UnitSnapshot): number {
  const ay = a.position.x + a.position.y;
  const by = b.position.x + b.position.y;
  if (ay !== by) {
    return ay - by;
  }
  return a.id.localeCompare(b.id);
}

function compareBuildingsForDraw(a: BuildingSnapshot, b: BuildingSnapshot): number {
  const ay = a.position.x + a.position.y;
  const by = b.position.x + b.position.y;
  if (ay !== by) {
    return ay - by;
  }
  return a.id.localeCompare(b.id);
}

function isInsideSnapshotMap(cell: CellCoord, snapshot: WorldSnapshot): boolean {
  return cell.x >= 0 && cell.x < snapshot.map.width && cell.y >= 0 && cell.y < snapshot.map.height;
}

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

function getSnapshotCell(snapshot: WorldSnapshot | null, cell: CellCoord): TerrainCellSnapshot | null {
  if (snapshot === null || !isInsideSnapshotMap(cell, snapshot)) {
    return null;
  }

  return snapshot.map.cells[cell.y * snapshot.map.width + cell.x] ?? null;
}

function findBuildingAtCell(cell: CellCoord, snapshot: WorldSnapshot | null): BuildingSnapshot | null {
  return snapshot?.buildings.find((building) => building.footprint.some((footprintCell) => sameCell(footprintCell, cell))) ?? null;
}

function isSnapshotPassable(snapshot: WorldSnapshot | null, cell: CellCoord): boolean {
  const terrain = getSnapshotCell(snapshot, cell);
  if (terrain === null) {
    return false;
  }

  const building = findBuildingAtCell(cell, snapshot);
  if (building !== null) {
    return building.passable && (terrain.passable || building.type === "earth_bridge" || building.type === "wood_bridge");
  }

  return terrain.passable;
}

function canPreviewPlaceBuildingCell(snapshot: WorldSnapshot, cell: CellCoord, buildTool: BuildingType): boolean {
  const terrain = getSnapshotCell(snapshot, cell);
  if (terrain === null || findBuildingAtCell(cell, snapshot) !== null) {
    return false;
  }

  const unitAtCell = snapshot.units.some((unit) => sameCell(unit.position, cell));
  if (unitAtCell) {
    return false;
  }

  return terrain.passable || isBridgeBuildTool(buildTool);
}

function buildingPreviewFootprint(buildingType: BuildingType, position: CellCoord): readonly CellCoord[] {
  return BUILDING_FOOTPRINTS[buildingType].map((offset) => ({
    x: position.x + offset.x,
    y: position.y + offset.y
  }));
}

function buildingAssetCandidates(building: BuildingSnapshot): readonly string[] {
  return [building.assetId, baseBuildingAssetId(building), finalBuildingFallbackAssetId(building)];
}

function baseBuildingAssetId(building: BuildingSnapshot): string {
  if (building.type === "fence") {
    return "building.fence.wood";
  }

  if (building.type === "wall") {
    return "building.wall.plaster";
  }

  if (building.type === "gate") {
    return "building.gate.wood.closed";
  }

  if (building.type === "gate_wide_2") {
    return "building.gate.wood.closed.width2";
  }

  if (building.type === "gate_wide_3") {
    return "building.gate.wood.closed.width3";
  }

  if (building.type === "dry_moat") {
    return "building.dry_moat";
  }

  if (building.type === "water_moat") {
    return "building.water_moat";
  }

  if (building.type === "storehouse") {
    return "building.storehouse";
  }

  if (building.type === "market") {
    return "building.market";
  }

  if (building.type === "barracks") {
    return "building.barracks";
  }

  if (building.type === "samurai_residence") {
    return "building.samurai_residence";
  }

  if (building.type === "town_block") {
    return "building.town_block";
  }

  if (building.type === "farm") {
    return "building.farm";
  }

  if (building.type === "road") {
    return "building.road";
  }

  if (building.type === "earth_bridge") {
    return "building.earth_bridge";
  }

  if (building.type === "wood_bridge") {
    return "building.wood_bridge";
  }

  if (building.type === "tenshu") {
    return "building.tenshu.test";
  }

  return "building.honmaru.marker";
}

function finalBuildingFallbackAssetId(building: BuildingSnapshot): string {
  if (building.type === "dry_moat") {
    return "terrain.dirt.base";
  }

  if (building.type === "water_moat") {
    return "terrain.water.base";
  }

  if (building.type === "honmaru") {
    return "overlay.cell.selected";
  }

  return "overlay.cell.blocked";
}

function isBridgeBuildTool(buildTool: BuildingType): boolean {
  return buildTool === "earth_bridge" || buildTool === "wood_bridge";
}

function rectangleFootprint(width: number, height: number): readonly CellCoord[] {
  const footprint: CellCoord[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      footprint.push({ x, y });
    }
  }
  return footprint;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
