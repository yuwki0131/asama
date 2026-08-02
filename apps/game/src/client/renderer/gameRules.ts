import { buildingSpecs } from "@asama/content";
import type { BuildingSnapshot, BuildingType, CellCoord, Season, TerrainCellSnapshot, WorldSnapshot } from "@asama/shared";

const BUILDING_FOOTPRINTS: Record<BuildingType, readonly CellCoord[]> = Object.fromEntries(
  Object.values(buildingSpecs).map((spec) => [
    spec.type,
    spec.footprintCells ?? rectangleFootprint(spec.footprint.width, spec.footprint.height)
  ])
) as Record<BuildingType, readonly CellCoord[]>;

export function isInsideSnapshotMap(cell: CellCoord, snapshot: WorldSnapshot): boolean {
  return cell.x >= 0 && cell.x < snapshot.map.width && cell.y >= 0 && cell.y < snapshot.map.height;
}

export function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function getSnapshotCell(snapshot: WorldSnapshot | null, cell: CellCoord): TerrainCellSnapshot | null {
  if (snapshot === null || !isInsideSnapshotMap(cell, snapshot)) {
    return null;
  }

  return snapshot.map.cells[cell.y * snapshot.map.width + cell.x] ?? null;
}

export function findBuildingAtCell(cell: CellCoord, snapshot: WorldSnapshot | null): BuildingSnapshot | null {
  return snapshot?.buildings.find((building) => building.footprint.some((footprintCell) => sameCell(footprintCell, cell))) ?? null;
}

export function isSnapshotPassable(snapshot: WorldSnapshot | null, cell: CellCoord): boolean {
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

export function canPreviewPlaceBuildingCell(snapshot: WorldSnapshot, cell: CellCoord, buildTool: BuildingType): boolean {
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

export function buildingPreviewFootprint(buildingType: BuildingType, position: CellCoord): readonly CellCoord[] {
  return BUILDING_FOOTPRINTS[buildingType].map((offset) => ({
    x: position.x + offset.x,
    y: position.y + offset.y
  }));
}

export function buildingAssetCandidates(building: BuildingSnapshot, season?: Season): readonly string[] {
  // Farms swap texture with the season (spring=flooded, summer=green,
  // autumn=golden, winter=bare soil). The seasonal id leads the candidate
  // list so a missing manifest entry still falls back to the season-less
  // building.farm asset.
  if (building.type === "farm" && season !== undefined) {
    return [
      `building.farm.${season}`,
      building.assetId,
      baseBuildingAssetId(building),
      finalBuildingFallbackAssetId(building)
    ];
  }
  return [building.assetId, baseBuildingAssetId(building), finalBuildingFallbackAssetId(building)];
}

export interface WallPathPiece {
  readonly type: BuildingType;
  readonly position: CellCoord;
}

const PLAN_DIAGONAL_TYPES: Partial<Record<BuildingType, { readonly nwse: BuildingType; readonly nesw: BuildingType }>> = {
  wall: { nwse: "diagonal_wall_nwse", nesw: "diagonal_wall_nesw" },
  hazama_wall: { nwse: "diagonal_wall_nwse", nesw: "diagonal_wall_nesw" },
  fence: { nwse: "diagonal_fence_nwse", nesw: "diagonal_fence_nesw" },
  dry_moat: { nwse: "diagonal_dry_moat_nwse", nesw: "diagonal_dry_moat_nesw" },
  water_moat: { nwse: "diagonal_water_moat_nwse", nesw: "diagonal_water_moat_nesw" }
};

/**
 * Octile wall path for drag-draw: a diagonal leg (45° pieces of the tool's
 * family) consumes the shorter axis first, then a straight leg of the drag
 * tool finishes the dominant axis. On an exact diagonal the whole run is
 * diagonal pieces; the diagonal→straight junction visual is covered by the
 * DIAG-04 junction arms.
 */
export function planWallPath(tool: BuildingType, anchor: CellCoord, target: CellCoord): readonly WallPathPiece[] {
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const diagonalSteps = Math.min(ax, ay);
  const diagonalPair = PLAN_DIAGONAL_TYPES[tool];
  const diagonalType: BuildingType = diagonalPair === undefined ? tool : sx === sy ? diagonalPair.nwse : diagonalPair.nesw;

  const pieces: WallPathPiece[] = [];
  if (ax === ay && diagonalSteps > 0) {
    for (let k = 0; k <= diagonalSteps; k += 1) {
      pieces.push({ type: diagonalType, position: { x: anchor.x + k * sx, y: anchor.y + k * sy } });
    }
    return pieces;
  }

  for (let k = 0; k < diagonalSteps; k += 1) {
    pieces.push({ type: diagonalType, position: { x: anchor.x + k * sx, y: anchor.y + k * sy } });
  }
  if (ax > ay) {
    for (let i = diagonalSteps; i <= ax; i += 1) {
      pieces.push({ type: tool, position: { x: anchor.x + i * sx, y: anchor.y + diagonalSteps * sy } });
    }
  } else {
    for (let i = diagonalSteps; i <= ay; i += 1) {
      pieces.push({ type: tool, position: { x: anchor.x + diagonalSteps * sx, y: anchor.y + i * sy } });
    }
  }
  return pieces;
}

export function isCenterAnchoredBuilding(buildingType: BuildingType): boolean {
  return (
    buildingType === "fence" ||
    buildingType === "wall" ||
    buildingType === "hazama_wall" ||
    buildingType.startsWith("diagonal_") ||
    buildingType.startsWith("arc_wall_") ||
    isGateType(buildingType) ||
    buildingType === "dry_moat" ||
    buildingType === "water_moat" ||
    buildingType === "honmaru" ||
    buildingType === "farm" ||
    buildingType === "road" ||
    buildingType === "earth_bridge" ||
    buildingType === "wood_bridge"
  );
}

function baseBuildingAssetId(building: BuildingSnapshot): string {
  if (building.type === "fence") {
    return "building.fence.wood";
  }

  if (
    building.type === "wall" ||
    building.type === "hazama_wall" ||
    building.type === "diagonal_wall_nwse" ||
    building.type === "diagonal_wall_nesw"
  ) {
    return "building.wall.plaster";
  }

  if (building.type === "gate_wide_2") {
    return "building.gate.wood.closed.width2";
  }

  if (building.type === "gate_wide_3") {
    return "building.gate.wood.closed.width3";
  }

  if (building.type === "gate_narrow_3") {
    return "building.gate.wood.closed.narrow3";
  }

  if (building.type === "gate_wide_2_ne_sw") {
    return "building.gate.wood.closed.width2";
  }

  if (building.type === "gate_wide_3_ne_sw") {
    return "building.gate.wood.closed.width3";
  }

  if (building.type === "gate_narrow_3_ne_sw") {
    return "building.gate.wood.closed.narrow3";
  }

  if (building.type === "gate_yagura_3") {
    return "building.gate.yagura.closed.nw_se.narrow3.connected.0101";
  }

  if (building.type === "gate_yagura_3_ne_sw") {
    return "building.gate.yagura.closed.ne_sw.narrow3.connected.1010";
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

  if (building.type === "machiya") {
    return "building.machiya.nw_se.v1";
  }

  if (building.type === "machiya_ne_sw") {
    return "building.machiya.ne_sw.v1";
  }

  if (building.type === "garden") {
    return "building.garden.v0";
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

  if (building.type === "tenshu_large") {
    return "building.tenshu.ogaki";
  }

  if (
    building.type.startsWith("arc_wall_") ||
    building.type.startsWith("diagonal_fence_") ||
    building.type.startsWith("diagonal_dry_moat_") ||
    building.type.startsWith("diagonal_water_moat_")
  ) {
    return building.assetId;
  }

  return "building.honmaru.marker";
}

function finalBuildingFallbackAssetId(building: BuildingSnapshot): string {
  if (building.type === "dry_moat" || building.type.startsWith("diagonal_dry_moat_")) {
    return "terrain.dirt.base";
  }

  if (building.type === "water_moat" || building.type.startsWith("diagonal_water_moat_")) {
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

export function isBridgeBuildingType(buildingType: BuildingType): boolean {
  return buildingType === "earth_bridge" || buildingType === "wood_bridge";
}

export type BridgeAxis = "x" | "y";

/**
 * Deck axis of a bridge. The simulation encodes it in the oriented snapshot
 * asset id ("building.earth_bridge.y5"); the footprint shape is the fallback
 * so the renderer stays correct even for plain base ids.
 */
export function bridgeAxis(building: BuildingSnapshot): BridgeAxis {
  const oriented = /\.([xy])\d+$/.exec(building.assetId);
  if (oriented !== null) {
    return oriented[1] as BridgeAxis;
  }
  const footprint = building.footprint;
  if (footprint.length >= 2) {
    return footprint[0]!.x === footprint[1]!.x ? "y" : "x";
  }
  return "x";
}

/**
 * Per-cell asset candidates for a bridge footprint cell (segment-based
 * auto-tiling): the min-coordinate cell along the deck axis is the "start"
 * approach, the max-coordinate cell the "end" approach, everything between
 * a seamless "mid" water crossing. Single-cell bridges use the isolated
 * one-tile asset with abutments on both ends.
 */
export function bridgeCellAssetCandidates(building: BuildingSnapshot, cell: CellCoord): readonly string[] {
  const base = building.type === "earth_bridge" ? "building.earth_bridge" : "building.wood_bridge";
  const axis = bridgeAxis(building);
  const single = axis === "y" ? `${base}.y` : base;
  const footprint = building.footprint;
  if (footprint.length <= 1) {
    return [single, finalBuildingFallbackAssetId(building)];
  }

  const along = (coord: CellCoord): number => (axis === "x" ? coord.x : coord.y);
  let min = along(footprint[0]!);
  let max = min;
  for (const footprintCell of footprint) {
    const value = along(footprintCell);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const value = along(cell);
  const segment = value === min ? "start" : value === max ? "end" : "mid";
  return [`${base}.${axis}.${segment}`, single, finalBuildingFallbackAssetId(building)];
}

/**
 * Screen-px lift of the bridge deck surface above the cell's ground plane,
 * used to draw units standing on the deck instead of sunk into it. Derived
 * from the Blender deck geometry: wood taiko-bashi deck top = WOOD_DECK_Z1 +
 * sori lift at the cell centre (crown 0.225 / ramp 0.176 world z), converted
 * at 40px per elevation LEVEL (5√6/12 world z) ≈ 39.2 px/z. The dobashi deck
 * is a flat causeway at road height (~1px).
 */
export function bridgeDeckLiftAt(building: BuildingSnapshot, cell: CellCoord): number {
  if (building.type === "earth_bridge") {
    return 1;
  }
  const footprint = building.footprint;
  if (footprint.length <= 1) {
    return 9;
  }
  const axis = bridgeAxis(building);
  const along = (coord: CellCoord): number => (axis === "x" ? coord.x : coord.y);
  let min = along(footprint[0]!);
  let max = min;
  for (const footprintCell of footprint) {
    const value = along(footprintCell);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const value = along(cell);
  return value === min || value === max ? 7 : 9;
}

/**
 * Per-cell asset candidates for a honmaru footprint cell. The honmaru lot is
 * rendered as ordinary ground tiles (one sprite per cell) instead of one
 * scaled marker; the connected mask (N,E,S,W bit = neighbour cell is inside
 * the footprint) selects boundary tiles with a stone curb on the outer edges.
 * The single-cell marker asset stays as the fallback (it covers exactly one
 * cell diamond).
 */
export function honmaruCellAssetCandidates(building: BuildingSnapshot, cell: CellCoord): readonly string[] {
  const inside = (x: number, y: number): boolean =>
    building.footprint.some((footprintCell) => footprintCell.x === x && footprintCell.y === y);
  const mask = [
    inside(cell.x, cell.y - 1),
    inside(cell.x + 1, cell.y),
    inside(cell.x, cell.y + 1),
    inside(cell.x - 1, cell.y)
  ]
    .map((bit) => (bit ? "1" : "0"))
    .join("");
  return [`building.honmaru.tile.connected.${mask}`, "building.honmaru.marker", finalBuildingFallbackAssetId(building)];
}

export type DiagonalArmCorner = "nw" | "ne" | "se" | "sw";

// Straight walls run through edge midpoints while diagonal walls run through
// cell corners, so a junction needs a center->corner arm on the straight-wall
// cell. An arm at corner c is required iff any of the 3 other cells sharing c
// holds an intact diagonal wall whose diagonal line touches c (nwse touches
// its own NW+SE corners, nesw touches NE+SW).
type DiagonalOrientation = "nwse" | "nesw";

const DIAGONAL_ARM_PROBES: Record<DiagonalArmCorner, readonly { dx: number; dy: number; orientation: DiagonalOrientation }[]> = {
  nw: [
    { dx: -1, dy: -1, orientation: "nwse" },
    { dx: 0, dy: -1, orientation: "nesw" },
    { dx: -1, dy: 0, orientation: "nesw" }
  ],
  ne: [
    { dx: 0, dy: -1, orientation: "nwse" },
    { dx: 1, dy: -1, orientation: "nesw" },
    { dx: 1, dy: 0, orientation: "nwse" }
  ],
  se: [
    { dx: 1, dy: 0, orientation: "nesw" },
    { dx: 1, dy: 1, orientation: "nwse" },
    { dx: 0, dy: 1, orientation: "nesw" }
  ],
  sw: [
    { dx: -1, dy: 0, orientation: "nwse" },
    { dx: -1, dy: 1, orientation: "nesw" },
    { dx: 0, dy: 1, orientation: "nwse" }
  ]
};

export const DIAGONAL_ARM_CORNERS: readonly DiagonalArmCorner[] = ["nw", "ne", "se", "sw"];

// Hosts drawing junction arms toward their family's diagonal pieces.
function armDiagonalTypeFor(host: BuildingType, orientation: DiagonalOrientation): BuildingType | null {
  if (host === "wall" || host === "hazama_wall") {
    return orientation === "nwse" ? "diagonal_wall_nwse" : "diagonal_wall_nesw";
  }
  if (host === "fence") {
    return orientation === "nwse" ? "diagonal_fence_nwse" : "diagonal_fence_nesw";
  }
  return null;
}

export function diagonalArmAssetFamily(host: BuildingType): string {
  return host === "fence" ? "building.fence.wood.diagonal.arm" : "building.wall.diagonal.arm";
}

export function diagonalJunctionArms(building: BuildingSnapshot, snapshot: WorldSnapshot | null): readonly DiagonalArmCorner[] {
  if (armDiagonalTypeFor(building.type, "nwse") === null) {
    return [];
  }
  if (building.lifecycleState !== "intact") {
    return [];
  }
  return DIAGONAL_ARM_CORNERS.filter((corner) =>
    DIAGONAL_ARM_PROBES[corner].some((probe) => {
      const neighbor = findBuildingAtCell(
        { x: building.position.x + probe.dx, y: building.position.y + probe.dy },
        snapshot
      );
      return (
        neighbor !== null &&
        neighbor.type === armDiagonalTypeFor(building.type, probe.orientation) &&
        neighbor.lifecycleState === "intact"
      );
    })
  );
}

// A grid corner key k names the point at the NW corner of cell k. Offsets of
// the 4 cells sharing key k, paired with which of that cell's corners k is.
const CORNER_SHARING_CELLS: readonly { ox: number; oy: number; corner: DiagonalArmCorner }[] = [
  { ox: 0, oy: 0, corner: "nw" },
  { ox: -1, oy: 0, corner: "ne" },
  { ox: 0, oy: -1, corner: "sw" },
  { ox: -1, oy: -1, corner: "se" }
];

// Unit direction (in cell space) of a wall segment leaving a corner toward
// the contributing cell's center / along the diagonal.
const CORNER_SEGMENT_DIRECTION: Record<DiagonalArmCorner, { dx: 1 | -1; dy: 1 | -1 }> = {
  nw: { dx: 1, dy: 1 },
  ne: { dx: -1, dy: 1 },
  sw: { dx: 1, dy: -1 },
  se: { dx: -1, dy: -1 }
};

interface CornerSegment {
  readonly cell: CellCoord;
  readonly dx: 1 | -1;
  readonly dy: 1 | -1;
}

function incidentWallSegmentsAt(key: CellCoord, snapshot: WorldSnapshot | null): readonly CornerSegment[] {
  const segments: CornerSegment[] = [];
  for (const { ox, oy, corner } of CORNER_SHARING_CELLS) {
    const cell = { x: key.x + ox, y: key.y + oy };
    const neighbor = findBuildingAtCell(cell, snapshot);
    if (neighbor === null || neighbor.lifecycleState !== "intact") {
      continue;
    }
    const direction = CORNER_SEGMENT_DIRECTION[corner];
    if (neighbor.type === "diagonal_wall_nwse") {
      // nwse touches its own NW and SE corners only.
      if (corner === "nw" || corner === "se") {
        segments.push({ cell, ...direction });
      }
    } else if (neighbor.type === "diagonal_wall_nesw") {
      if (corner === "ne" || corner === "sw") {
        segments.push({ cell, ...direction });
      }
    } else if (neighbor.type === "wall" || neighbor.type === "hazama_wall") {
      if (diagonalJunctionArms(neighbor, snapshot).includes(corner)) {
        segments.push({ cell, ...direction });
      }
    }
  }
  return segments;
}

// An elbow junction (exactly two perpendicular segments meeting at a corner,
// no straight-through pair) leaves the walls' outer cut faces exposed, so it
// gets a square corner-cap post. T-joints, crossings and straight runs have a
// collinear pair and stay uncapped. The front-most participant cell (max x+y,
// then max x) owns the cap so it draws above both wall sprites.
export function junctionCornerCaps(building: BuildingSnapshot, snapshot: WorldSnapshot | null): readonly CellCoord[] {
  if (building.lifecycleState !== "intact") {
    return [];
  }
  if (
    building.type !== "wall" &&
    building.type !== "hazama_wall" &&
    building.type !== "diagonal_wall_nwse" &&
    building.type !== "diagonal_wall_nesw"
  ) {
    return [];
  }
  const position = building.position;
  const keys: readonly CellCoord[] = [
    { x: position.x, y: position.y },
    { x: position.x + 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x + 1, y: position.y + 1 }
  ];
  const caps: CellCoord[] = [];
  for (const key of keys) {
    const segments = incidentWallSegmentsAt(key, snapshot);
    if (segments.length < 2) {
      continue;
    }
    if (segments.some((a) => segments.some((b) => a.dx === -b.dx && a.dy === -b.dy))) {
      continue;
    }
    const owner = segments.reduce((best, candidate) => {
      const bestDepth = best.cell.x + best.cell.y;
      const candidateDepth = candidate.cell.x + candidate.cell.y;
      if (candidateDepth !== bestDepth) {
        return candidateDepth > bestDepth ? candidate : best;
      }
      return candidate.cell.x > best.cell.x ? candidate : best;
    });
    if (owner.cell.x === position.x && owner.cell.y === position.y) {
      caps.push(key);
    }
  }
  return caps;
}

function isNeSwGateType(buildingType: BuildingType): boolean {
  return (
    buildingType === "gate_wide_2_ne_sw" ||
    buildingType === "gate_wide_3_ne_sw" ||
    buildingType === "gate_narrow_3_ne_sw" ||
    buildingType === "gate_yagura_3_ne_sw"
  );
}

function isGateType(buildingType: BuildingType): boolean {
  return (
    buildingType === "gate_wide_2" ||
    buildingType === "gate_wide_3" ||
    buildingType === "gate_narrow_3" ||
    buildingType === "gate_yagura_3" ||
    isNeSwGateType(buildingType)
  );
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
