// Root Three.js scene composer for the trial 3D renderer.
//
// One instance owns: renderer, scene, camera, lights, terrain mesh, feature
// meshes, and billboard layers. The React wrapper (ThreeGameCanvas.tsx)
// creates one ThreeScene per canvas and calls setSnapshot() whenever the
// worker delivers a new snapshot.

import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Scene,
  WebGLRenderer
} from "three";
import { buildingSpecs } from "@asama/content";
import type { WorldSnapshot } from "@asama/shared";
import { createCameraControls, type CameraControls } from "./camera";
import { createTerrainMesh, type TerrainMesh } from "./terrainMesh";
import type { AreaFeature, LinearFeature, TrialFeatures } from "./features";
import {
  createAreaFeatureMesh,
  createEarthworkMesh,
  createMoatMeshes,
  createPlasterWallMesh,
  createStoneRampartMesh,
  createWoodFenceMesh
} from "./featureMesh";
import type { ThreeAssetMap } from "./assets";
import {
  createBuildingLayer,
  createSelectionMarker,
  createUnitLayer,
  type BillboardLayer
} from "./billboards";
import { createBuildingGeometryLayer, type BuildingGeometryLayer } from "./buildingGeometry";
import { pickCell } from "./picker";

export interface ThreeSceneOptions {
  canvas: HTMLCanvasElement;
  assets: ThreeAssetMap;
  trialFeatures: TrialFeatures;
}

export interface ThreeSceneHandle {
  setSnapshot(snapshot: WorldSnapshot): void;
  resize(width: number, height: number): void;
  camera: CameraControls;
  pickCellAt(clientX: number, clientY: number, canvasRect: DOMRect): { x: number; y: number } | null;
  setSelectedCell(cell: { x: number; y: number } | null): void;
  render(): void;
  dispose(): void;
}

export function createThreeScene(options: ThreeSceneOptions): ThreeSceneHandle {
  const { canvas, assets, trialFeatures } = options;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  renderer.setSize(width, height, false);
  renderer.setClearColor(new Color(0xd6d3c0), 1);

  const scene = new Scene();
  scene.background = new Color(0xd6d3c0);

  const cameraControls = createCameraControls(width, height);
  // Center on the trial scenario region (cells 46..58, 46..60 around 52,52).
  cameraControls.centerOnCell({ x: 52, y: 52 });

  // Restrained lighting: one soft directional key + ambient fill. Avoids the
  // "shiny plastic castle game" look the trial spec explicitly warns against.
  const ambient = new AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  const key = new DirectionalLight(0xfff2d0, 0.9);
  key.position.set(3, 8, 4);
  key.castShadow = false;
  scene.add(key);
  const fill = new DirectionalLight(0xa8bcd8, 0.25);
  fill.position.set(-5, 6, -4);
  scene.add(fill);

  // Terrain.
  const terrain = createTerrainMesh();
  scene.add(terrain.mesh);

  // Static trial feature meshes (do not update per snapshot).
  const featureGroup = new Group();
  featureGroup.name = "trial-features";
  scene.add(featureGroup);
  populateFeatures(featureGroup, trialFeatures);

  // Selection marker.
  const selection = createSelectionMarker();
  scene.add(selection.mesh);

  // Billboards + procedural building geometry — both rebuilt each snapshot.
  // Trial scenarios are small enough that per-entity diffing isn't worth it.
  let buildingLayer: BillboardLayer | null = null;
  let unitLayer: BillboardLayer | null = null;
  let geometryLayer: BuildingGeometryLayer | null = null;
  let latestSnapshot: WorldSnapshot | null = null;

  return {
    setSnapshot(snapshot) {
      latestSnapshot = snapshot;
      terrain.rebuild(snapshot);
      if (buildingLayer !== null) {
        scene.remove(buildingLayer.group);
        buildingLayer.dispose();
      }
      if (unitLayer !== null) {
        scene.remove(unitLayer.group);
        unitLayer.dispose();
      }
      if (geometryLayer !== null) {
        scene.remove(geometryLayer.group);
        geometryLayer.dispose();
      }
      geometryLayer = createBuildingGeometryLayer(snapshot.buildings);
      buildingLayer = createBuildingLayer(snapshot.buildings, assets, buildingSpecs);
      unitLayer = createUnitLayer(snapshot.units, assets);
      scene.add(geometryLayer.group);
      scene.add(buildingLayer.group);
      scene.add(unitLayer.group);
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      cameraControls.updateProjection(w, h);
    },
    camera: cameraControls,
    pickCellAt(clientX, clientY, rect) {
      return pickCell(clientX, clientY, rect, cameraControls.camera, latestSnapshot);
    },
    setSelectedCell(cell) {
      if (cell === null) {
        selection.setCell(null, 0);
        return;
      }
      const cellRow = latestSnapshot?.map.cells.find(
        (c) => c.coord.x === cell.x && c.coord.y === cell.y
      );
      selection.setCell(cell, cellRow?.elevation ?? 0);
    },
    render() {
      renderer.render(scene, cameraControls.camera);
    },
    dispose() {
      terrain.dispose();
      if (buildingLayer !== null) buildingLayer.dispose();
      if (unitLayer !== null) unitLayer.dispose();
      if (geometryLayer !== null) geometryLayer.dispose();
      featureGroup.traverse((obj) => {
        // Only Mesh has geometry/material; use ducktyping to avoid extra imports.
        const anyObj = obj as unknown as {
          geometry?: { dispose(): void };
          material?: { dispose(): void };
        };
        anyObj.geometry?.dispose?.();
        anyObj.material?.dispose?.();
      });
      renderer.dispose();
    }
  };
}

function populateFeatures(group: Group, features: TrialFeatures): void {
  for (const area of features.areas) {
    group.add(createAreaFeatureMesh(area));
  }
  for (const linear of features.linears) {
    group.add(buildLinearFeature(linear));
  }
}

function buildLinearFeature(feature: LinearFeature): Group {
  const wrapper = new Group();
  wrapper.name = feature.id;
  switch (feature.kind) {
    case "stone_wall":
      wrapper.add(createStoneRampartMesh(feature));
      break;
    case "plaster_wall":
      wrapper.add(createPlasterWallMesh(feature));
      break;
    case "wood_fence":
      wrapper.add(createWoodFenceMesh(feature));
      break;
    case "earthwork":
      wrapper.add(createEarthworkMesh(feature));
      break;
    case "dry_moat":
    case "water_moat":
      wrapper.add(createMoatMeshes(feature));
      break;
  }
  return wrapper;
}

// Trivial unused-guard for typed-only imports (satisfies noUnusedLocals).
void ({} as AreaFeature);
