import { mvpDefenseScenario } from "@asama/content";
import { MAX_ELEVATION } from "@asama/shared";
import type { CellCoord, EconomySnapshot, FoodSnapshot, PlayerCommand, WorldSnapshot } from "@asama/shared";
import type { ScenarioDefinition, ScenarioWave } from "@asama/shared";
import { buildingDefinitions, absoluteFootprint, applyLotCourtyard, bridgeAbsoluteFootprint, canPlaceBuilding, clearUnitPathsThrough, isLotBuilding, restoreLotCourtyard, seedInitialBuildings, snapshotBuilding, snapshotCell, getBuildingAt } from "./buildings";
import { getAttackTarget, areEnemies, updateAttackMoveBehavior, updateCombat } from "./combat";
import { updateEconomy, applyMarketTrade, applyRecruitCommand, populationCapacity, currentApproval, maxRecruitPool } from "./economy";
import { applyScenarioElevation, elevationAt, slopeVector, stepTicksFor } from "./elevation";
import { updateEnemyAi } from "./enemyAi";
import { applyEngineerTaskCommand, updateEngineerTasks } from "./engineer";
import { requiredFoodPerCycle, updateFoodSupply } from "./food";
import { createInitialMap, createTerrainCell, getCell } from "./map";
import { findPath, formationSlots, isPassable } from "./pathfinding";
import { deserializeWorld, serializeWorld } from "./serialization";
import { createUnit } from "./units";
import {
  BLOCKED_MOVEMENT_COST,
  ECONOMY_BALANCE,
  FOOD_BALANCE,
  SEASONS,
  SIEGE_BALANCE,
  TERRAIN_COSTS,
  WORLD_RNG_SEED,
  cellKey,
  clampCell,
  intactBuildingsOfType,
  isBridge,
  isGate,
  manhattan,
  sameCell,
  type SnapshotOptions,
  type WorldState
} from "./types";

export type { WorldState } from "./types";
export { ECONOMY_BALANCE, FOOD_BALANCE, SIEGE_BALANCE } from "./types";
export { serializeWorld, deserializeWorld } from "./serialization";

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

type CliffBounds = {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
};

/**
 * Inserts dedicated "cliff" terrain cells at high-low elevation boundaries.
 * For every cell with elevation > 0, its S and E neighbours with a lower
 * elevation are converted to cliff cells (terrain="cliff", passable=false).
 * Slope cells that bridge the height difference are left untouched.
 * An SE corner cliff is added where both the S and E neighbours are cliff cells.
 *
 * With `bounds` the derivation is restricted to driver cells inside the box
 * (expanded one cell to the N/W so outside drivers still write cliffs onto
 * restored cells inside it) — used for incremental runtime re-derivation.
 */
function insertCliffCells(map: WorldState["map"], bounds?: CliffBounds): void {
  const { cells, width, height } = map;

  function cellAtCoord(x: number, y: number): Mutable<typeof cells[number]> | undefined {
    if (x < 0 || y < 0 || x >= width || y >= height) return undefined;
    return cells[y * width + x] as Mutable<typeof cells[number]> | undefined;
  }

  function isDriver(coord: CellCoord): boolean {
    return (
      bounds === undefined ||
      (coord.x >= bounds.x0 - 1 && coord.x <= bounds.x1 && coord.y >= bounds.y0 - 1 && coord.y <= bounds.y1)
    );
  }

  // Pass 1: S and E edges of high cells.
  // Iterate a snapshot of the original cell list so we don't re-process newly
  // written cliff cells that happen to share an index.
  const originalCells = [...cells];
  for (const cell of originalCells) {
    if (!isDriver(cell.coord)) continue;
    const cellElev = cell.elevation;
    if (cellElev <= 0 && cell.slope === null) continue;

    for (const dir of ["s", "e"] as const) {
      const nx = cell.coord.x + (dir === "e" ? 1 : 0);
      const ny = cell.coord.y + (dir === "s" ? 1 : 0);
      const neighbor = cellAtCoord(nx, ny);
      if (neighbor === undefined) continue;
      if (neighbor.terrain === "cliff") continue; // already a cliff cell

      const neighborElev = neighbor.elevation;
      const drop = cellElev - neighborElev;
      if (drop <= 0) continue; // no height difference

      // Skip if a slope bridges this edge.
      // "oppDir" is the slope direction at the LOW cell (neighbor) that
      // points back toward the HIGH cell (cell).
      const oppDir = dir === "s" ? "N" : "W";
      const dirUpper = dir === "s" ? "S" : "E";
      if (cell.slope === dirUpper || neighbor.slope === oppDir) continue;

      // Rewrite neighbour as a cliff cell. The original assetId is kept so
      // the renderer can draw the cell's floor tile (grass/dirt) under the
      // cliff face — otherwise only the flat underlay diamond shows through.
      const idx = ny * width + nx;
      cells[idx] = {
        ...neighbor,
        terrain: "cliff",
        passable: false,
        movementCost: 99,
        cliffFace: dir,
        cliffHeight: drop,
        elevationSkin: cell.elevationSkin,
        cliffOrigin: { terrain: neighbor.terrain, movementCost: neighbor.movementCost, passable: neighbor.passable }
      } as typeof cells[number];
    }
  }

  // Pass 2: SE corner where both S and E neighbours are cliff cells.
  for (const cell of cells) {
    if (!isDriver(cell.coord)) continue;
    if (cell.elevation <= 0) continue;
    const cx = cell.coord.x;
    const cy = cell.coord.y;
    const se = cellAtCoord(cx + 1, cy + 1);
    const s = cellAtCoord(cx, cy + 1);
    const e = cellAtCoord(cx + 1, cy);
    if (
      se !== undefined &&
      se.terrain !== "cliff" &&
      s?.terrain === "cliff" &&
      e?.terrain === "cliff" &&
      // A corner only exists over an actual drop. Without this guard a
      // cliff cell (which keeps the LOW side's elevation) acts as the
      // driver next to same-height ground and mints a cliffHeight-0
      // corner, which then chains cell by cell into an invisible
      // impassable corridor across flat terrain.
      cell.elevation - se.elevation > 0
    ) {
      const idx = (cy + 1) * width + (cx + 1);
      cells[idx] = {
        ...se,
        terrain: "cliff",
        passable: false,
        movementCost: 99,
        cliffFace: "se",
        cliffHeight: cell.elevation - se.elevation,
        elevationSkin: cell.elevationSkin,
        cliffOrigin: { terrain: se.terrain, movementCost: se.movementCost, passable: se.passable }
      } as typeof cells[number];
    }
  }
}

/** Restores a cliff cell to its pre-cliff terrain. Elevation, slope, asset
 *  and skin are kept as-is; saves that predate `cliffOrigin` fall back to the
 *  procedural base cell. */
function restoreCliffCell(map: WorldState["map"], index: number): void {
  const cell = map.cells[index];
  if (cell === undefined || cell.terrain !== "cliff") return;
  let origin = cell.cliffOrigin;
  if (origin === undefined) {
    const base = createTerrainCell(cell.coord);
    origin = { terrain: base.terrain, movementCost: base.movementCost, passable: base.passable };
  }
  const { cliffFace: _face, cliffHeight: _height, cliffOrigin: _origin, ...rest } = cell;
  map.cells[index] = {
    ...rest,
    terrain: origin.terrain,
    movementCost: origin.movementCost,
    passable: origin.passable
  };
}

/**
 * Incrementally re-derives cliff cells after a runtime terrain edit at `pos`.
 * A cell's cliff status depends only on its own elevation/slope and its
 * N/W/NW neighbours', and an edit touches at most `pos` ±1 (gentle-slope
 * partner), so a ±2 window covers every cell whose status can change. Cliff
 * cells inside the window revert to their stored origin, then the boot
 * derivation runs bounded to the window.
 */
function rederiveCliffsAround(world: WorldState, pos: CellCoord): void {
  const { map } = world;
  const x0 = Math.max(0, pos.x - 2);
  const y0 = Math.max(0, pos.y - 2);
  const x1 = Math.min(map.width - 1, pos.x + 2);
  const y1 = Math.min(map.height - 1, pos.y + 2);
  const wasCliff = new Set<string>();
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const index = y * map.width + x;
      if (map.cells[index]?.terrain === "cliff") {
        wasCliff.add(cellKey({ x, y }));
        restoreCliffCell(map, index);
      }
    }
  }
  insertCliffCells(map, { x0, y0, x1, y1 });
  // Unit paths crossing the edited cell or a newly minted cliff are stale.
  const blocked: CellCoord[] = [pos];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const cell = map.cells[y * map.width + x];
      if (cell !== undefined && cell.terrain === "cliff" && !wasCliff.has(cellKey(cell.coord))) {
        blocked.push(cell.coord);
      }
    }
  }
  clearUnitPathsThrough(world, blocked);
}

/**
 * Clears the slope marker on the cell at `pos`. When the cell is one half of
 * a gentle 2-cell slope, the partner half (uphill of a lower half, downhill
 * of an upper half) is cleared too — a lone half is geometrically invalid.
 */
function clearSlopeAt(world: WorldState, pos: CellCoord): void {
  const index = pos.y * world.map.width + pos.x;
  const cell = world.map.cells[index];
  if (cell === undefined || cell.slope === null) {
    return;
  }
  const { slope, slopeHalf } = cell;
  const { slopeHalf: _cellHalf, ...cellRest } = cell;
  world.map.cells[index] = { ...cellRest, slope: null };
  if (slopeHalf === undefined) {
    return;
  }
  const vec = slopeVector(slope);
  const partnerPos =
    slopeHalf === "lower"
      ? { x: pos.x + vec.x, y: pos.y + vec.y }
      : { x: pos.x - vec.x, y: pos.y - vec.y };
  if (partnerPos.x < 0 || partnerPos.y < 0 || partnerPos.x >= world.map.width || partnerPos.y >= world.map.height) {
    return;
  }
  const partnerIndex = partnerPos.y * world.map.width + partnerPos.x;
  const partner = world.map.cells[partnerIndex];
  if (
    partner !== undefined &&
    partner.slope === slope &&
    partner.slopeHalf === (slopeHalf === "lower" ? "upper" : "lower")
  ) {
    const { slopeHalf: _partnerHalf, ...partnerRest } = partner;
    world.map.cells[partnerIndex] = { ...partnerRest, slope: null };
  }
}

/** Compatibility export: the default scenario's waves (tests, tooling). */
export const ENEMY_WAVES: readonly ScenarioWave[] = mvpDefenseScenario.waves;

export function createInitialWorld(scenario: ScenarioDefinition = mvpDefenseScenario): WorldState {
  const world: WorldState = {
    currentTick: 0,
    nextBuildingId: 1,
    invalidMoveTarget: null,
    outcome: null,
    nextWaveIndex: 0,
    terrainRevision: 0,
    scenario: {
      waves: scenario.waves,
      victory: scenario.victory
    },
    rngState: WORLD_RNG_SEED,
    food: {
      connectedStorehouseIds: [],
      nextConnectivityCheckTick: 0,
      nextConsumptionTick: FOOD_BALANCE.consumptionCycleTicks
    },
    economy: {
      gold: ECONOMY_BALANCE.initialGold,
      weapons: ECONOMY_BALANCE.initialWeapons,
      population: ECONOMY_BALANCE.initialPopulation,
      recruitPool: Math.floor(ECONOMY_BALANCE.initialPopulation * ECONOMY_BALANCE.mobilizationRate),
      plantedFarmIds: [],
      lastProcessedMonth: 0,
      lastProcessedSeason: 0
    },
    supplyState: {
      hasHadCart: false,
      retreatTimerActive: false,
      retreatTimerRemaining: 0
    },
    map: createInitialMap(),
    units: [],
    buildings: [],
    combatEvents: []
  };

  // Elevation is applied before buildings so placement validation can enforce
  // uniform-elevation footprints (elevation-contract.md).
  if (scenario.elevation !== undefined) {
    applyScenarioElevation(world.map, scenario.elevation);
  }
  // Insert dedicated cliff cells at elevation boundaries (no-op for flat maps).
  insertCliffCells(world.map);
  // Fixed scenario decorations (dev fixtures) on top of the procedural scatter.
  if (scenario.decorations !== undefined && scenario.decorations.length > 0) {
    world.map.decorations.push(...scenario.decorations);
  }

  seedInitialBuildings(world, scenario);
  // Units spawn after buildings so building placement validation does not
  // reject cells the garrison stands on. A defender standing on the honmaru
  // cell blocks capture (victory-and-defeat.md); the others screen it.
  for (const [index, spawn] of scenario.initialUnits.entries()) {
    world.units.push(createUnit(`unit:init:${index}`, spawn.owner, spawn.type, spawn.position));
  }
  // The world starts at the beginning of spring; farms present now are
  // planted for the first year's harvest.
  world.economy.plantedFarmIds = intactBuildingsOfType(world, "farm").map((farm) => farm.id);
  return world;
}

export function applyCommand(world: WorldState, command: PlayerCommand): string | null {
  if (command.type === "selectUnits") {
    const selected = new Set(command.unitIds);
    for (const unit of world.units) {
      unit.selected = selected.has(unit.id);
    }
    return null;
  }

  if (command.type === "moveUnits") {
    const destination = clampCell(command.destination);
    if (!isPassable(world, destination, "player")) {
      world.invalidMoveTarget = destination;
      return "That cell is not passable";
    }

    // Group move: each unit receives its own formation slot around the
    // destination so the group arrives arranged instead of stacking.
    const movers = world.units.filter((unit) => command.unitIds.includes(unit.id));
    movers.sort((a, b) => manhattan(a.position, destination) - manhattan(b.position, destination));

    // Exclude the moving units themselves from slot occupancy checks so a
    // mover's current cell can be assigned as another mover's slot.
    const moverIds = new Set(command.unitIds);
    const worldForPaths: WorldState = { ...world, units: world.units.filter((u) => !moverIds.has(u.id)) };
    const slots = formationSlots(worldForPaths, destination, movers.length, "player");

    let assignedPath = false;
    let slotIndex = 0;
    for (const unit of movers) {
      let assigned = false;
      while (slotIndex < slots.length) {
        const slot = slots[slotIndex];
        slotIndex += 1;
        if (slot === undefined) {
          break;
        }
        const path = findPath(worldForPaths, unit.position, slot, "player");
        if (path.length === 0 && !sameCell(unit.position, slot)) {
          continue;
        }
        unit.destination = slot;
        unit.path = path;
        unit.movementProgress = 0;
        unit.attackTargetId = null;
        unit.attackMoveDestination = null;
        assigned = true;
        assignedPath = true;
        break;
      }
      if (!assigned) {
        unit.destination = null;
        unit.path = [];
        unit.movementProgress = 0;
      }
    }

    if (!assignedPath) {
      world.invalidMoveTarget = destination;
      return "No path to that cell";
    }

    world.invalidMoveTarget = null;
    return null;
  }

  if (command.type === "attackTarget") {
    const target = getAttackTarget(world, command.targetId);
    if (target === null) {
      return "No attack target";
    }

    let assignedTarget = false;
    for (const unit of world.units) {
      if (!command.unitIds.includes(unit.id) || !areEnemies(unit.owner, target.owner)) {
        continue;
      }

      unit.attackTargetId = target.id;
      unit.targetId = target.id;
      unit.destination = null;
      unit.path = [];
      unit.movementProgress = 0;
      assignedTarget = true;
    }

    if (!assignedTarget) {
      return "No unit can attack that target";
    }

    world.invalidMoveTarget = null;
    return null;
  }

  if (command.type === "placeBuilding") {
    const position = clampCell(command.position);
    const definition = buildingDefinitions[command.buildingType];
    if (definition === undefined) {
      return "Unknown building type";
    }

    if (!canPlaceBuilding(world, position, definition)) {
      world.invalidMoveTarget = position;
      return "Cannot place building there";
    }

    const footprint = isBridge(command.buildingType)
      ? bridgeAbsoluteFootprint(world, position)
      : absoluteFootprint(position, definition.footprint);
    // Gates always start open; players close them intentionally for defense.
    const isGateBuilding = isGate(command.buildingType);
    world.buildings.push({
      id: `building:${world.nextBuildingId}`,
      owner: "player",
      type: command.buildingType,
      category: definition.category,
      position,
      footprint,
      hp: definition.maxHp,
      maxHp: definition.maxHp,
      lifecycleState: "intact",
      gateState: isGateBuilding ? "open" : definition.gateState,
      passable: isGateBuilding ? true : definition.passable,
      movementCostModifier: isGateBuilding ? 2 : definition.movementCostModifier,
      assetId: definition.assetId,
      // Player-built storehouses start empty; stock arrives via harvest or
      // supply carts, not construction.
      food: command.buildingType === "storehouse" ? 0 : null,
      foodCapacity: command.buildingType === "storehouse" ? FOOD_BALANCE.storehouseCapacity : null,
      ladderHp: null,
      fillProgress: 0
    });
    world.nextBuildingId += 1;
    world.invalidMoveTarget = null;
    clearUnitPathsThrough(world, footprint);
    if (isLotBuilding(command.buildingType)) {
      applyLotCourtyard(world, footprint);
    }
    return null;
  }

  if (command.type === "demolishBuilding") {
    const position = clampCell(command.position);
    const index = world.buildings.findIndex((building) => building.footprint.some((cell) => sameCell(cell, position)));
    if (index === -1) {
      world.invalidMoveTarget = position;
      return "No building to demolish";
    }

    const [building] = world.buildings.splice(index, 1);
    if (building?.type === "honmaru") {
      world.buildings.splice(index, 0, building);
      world.invalidMoveTarget = position;
      return "Honmaru cannot be demolished";
    }

    if (building !== undefined && isLotBuilding(building.type)) {
      restoreLotCourtyard(world, building.footprint);
    }
    world.invalidMoveTarget = null;
    return null;
  }

  if (command.type === "recruitUnit") {
    return applyRecruitCommand(world, command.unitType);
  }

  if (command.type === "toggleGate") {
    const position = clampCell(command.position);
    const gate = world.buildings.find(
      (building) =>
        building.owner === "player" &&
        building.lifecycleState === "intact" &&
        building.gateState !== null &&
        building.footprint.some((cell) => sameCell(cell, position))
    );
    if (gate === undefined) {
      return "No gate there";
    }
    // Note: food connectivity intentionally does not recompute immediately
    // after a gate toggle (food-and-supply.md); the periodic check picks the
    // change up on its own schedule.
    if (gate.gateState === "closed") {
      gate.gateState = "open";
      gate.passable = true;
      gate.movementCostModifier = 2;
    } else {
      gate.gateState = "closed";
      gate.passable = false;
      gate.movementCostModifier = BLOCKED_MOVEMENT_COST;
    }
    clearUnitPathsThrough(world, gate.footprint);
    return null;
  }

  if (command.type === "marketTrade") {
    return applyMarketTrade(world, command.trade);
  }

  if (command.type === "attackMoveUnits") {
    const destination = clampCell(command.destination);
    const rejection = applyCommand(world, {
      type: "moveUnits",
      unitIds: command.unitIds,
      destination,
      issuedAtTick: command.issuedAtTick,
      clientSequence: command.clientSequence
    });
    if (rejection !== null) {
      return rejection;
    }
    for (const unit of world.units) {
      if (command.unitIds.includes(unit.id) && unit.path.length > 0) {
        unit.attackMoveDestination = destination;
      }
    }
    return null;
  }

  if (command.type === "stopUnits") {
    for (const unit of world.units) {
      if (!command.unitIds.includes(unit.id)) {
        continue;
      }
      unit.path = [];
      unit.destination = null;
      unit.movementProgress = 0;
      unit.attackTargetId = null;
      unit.attackMoveDestination = null;
      unit.task = null;
    }
    return null;
  }

  if (command.type === "engineerTask") {
    return applyEngineerTaskCommand(world, command.unitIds, command.task, clampCell(command.position));
  }

  if (command.type === "raiseTerrain") {
    const pos = clampCell(command.position);
    const index = pos.y * world.map.width + pos.x;
    const cell = world.map.cells[index];
    if (cell === undefined) return "Invalid position";
    if (cell.terrain === "water") return "Cannot raise water tiles";
    if (cell.elevation >= MAX_ELEVATION) return "Already at maximum elevation";
    if (world.economy.gold < TERRAIN_COSTS.raiseTerrain) return "Insufficient gold";
    if (getBuildingAt(world, pos) !== null) return "Cannot raise terrain under a building";
    world.map.cells[index] = { ...cell, elevation: cell.elevation + 1, elevationSkin: "ishigaki" };
    rederiveCliffsAround(world, pos);
    world.economy.gold -= TERRAIN_COSTS.raiseTerrain;
    world.terrainRevision += 1;
    world.invalidMoveTarget = null;
    return null;
  }

  if (command.type === "lowerTerrain") {
    const pos = clampCell(command.position);
    const index = pos.y * world.map.width + pos.x;
    const cell = world.map.cells[index];
    if (cell === undefined) return "Invalid position";
    if (cell.elevation <= 0) return "Already at ground level";
    if (world.economy.gold < TERRAIN_COSTS.lowerTerrain) return "Insufficient gold";
    if (getBuildingAt(world, pos) !== null) return "Cannot lower terrain under a building";
    // Remove any slope before lowering (slope would become geometrically
    // invalid); a gentle 2-cell slope loses its partner half too.
    clearSlopeAt(world, pos);
    const flattened = world.map.cells[index];
    if (flattened === undefined) return "Invalid position";
    world.map.cells[index] = { ...flattened, elevation: flattened.elevation - 1 };
    rederiveCliffsAround(world, pos);
    world.economy.gold -= TERRAIN_COSTS.lowerTerrain;
    world.terrainRevision += 1;
    world.invalidMoveTarget = null;
    return null;
  }

  if (command.type === "placeSlope") {
    const pos = clampCell(command.position);
    const gentle = (command.length ?? 1) === 2;
    const cost = gentle ? TERRAIN_COSTS.placeSlopeGentle : TERRAIN_COSTS.placeSlope;
    const index = pos.y * world.map.width + pos.x;
    const cell = world.map.cells[index];
    if (cell === undefined) return "Invalid position";
    if (cell.terrain === "water") return "Cannot place slope on water";
    if (cell.slope !== null) return "Slope already exists here";
    if (world.economy.gold < cost) return "Insufficient gold";
    const vec = slopeVector(command.toward);

    if (!gentle) {
      // The adjacent cell in the `toward` direction must be exactly one level higher.
      const adjPos = { x: pos.x + vec.x, y: pos.y + vec.y };
      if (adjPos.x < 0 || adjPos.y < 0 || adjPos.x >= world.map.width || adjPos.y >= world.map.height) {
        return "Cannot place slope at map edge";
      }
      const adjCell = getCell(world, adjPos);
      if (adjCell.elevation !== cell.elevation + 1) return "Adjacent cell must be one level higher";
      world.map.cells[index] = { ...cell, slope: command.toward };
    } else {
      // Gentle 2-cell ramp: `pos` (lower half) + the next cell toward (upper
      // half) must both be free flat land at the same level; the plateau
      // beyond the upper cell must be exactly one level higher.
      const upperPos = { x: pos.x + vec.x, y: pos.y + vec.y };
      const plateauPos = { x: pos.x + 2 * vec.x, y: pos.y + 2 * vec.y };
      const inMap = (p: CellCoord): boolean =>
        p.x >= 0 && p.y >= 0 && p.x < world.map.width && p.y < world.map.height;
      if (!inMap(upperPos) || !inMap(plateauPos)) return "Cannot place slope at map edge";
      const upperCell = getCell(world, upperPos);
      if (upperCell.terrain === "water") return "Cannot place slope on water";
      if (upperCell.slope !== null) return "Slope already exists here";
      if (upperCell.elevation !== cell.elevation) return "Both ramp cells must be on the same level";
      if (getBuildingAt(world, pos) !== null || getBuildingAt(world, upperPos) !== null) {
        return "Cannot place slope under a building";
      }
      const plateauCell = getCell(world, plateauPos);
      if (plateauCell.elevation !== cell.elevation + 1) return "Adjacent cell must be one level higher";
      const upperIndex = upperPos.y * world.map.width + upperPos.x;
      world.map.cells[index] = { ...cell, slope: command.toward, slopeHalf: "lower" };
      world.map.cells[upperIndex] = { ...upperCell, slope: command.toward, slopeHalf: "upper" };
    }
    // A slope bridges (or a removed one exposes) an elevation edge, so cliff
    // cells around it must be re-derived — e.g. building a ramp onto a
    // boot-time cliff cell restores it to walkable slope terrain.
    rederiveCliffsAround(world, pos);
    world.economy.gold -= cost;
    world.terrainRevision += 1;
    world.invalidMoveTarget = null;
    return null;
  }

  if (command.type === "removeSlope") {
    const pos = clampCell(command.position);
    const index = pos.y * world.map.width + pos.x;
    const cell = world.map.cells[index];
    if (cell === undefined) return "Invalid position";
    if (cell.slope === null) return "No slope here";
    if (world.economy.gold < TERRAIN_COSTS.removeSlope) return "Insufficient gold";
    // Gentle 2-cell slopes are removed as a pair (a lone half is invalid).
    clearSlopeAt(world, pos);
    rederiveCliffsAround(world, pos);
    world.economy.gold -= TERRAIN_COSTS.removeSlope;
    world.terrainRevision += 1;
    world.invalidMoveTarget = null;
    return null;
  }

  return null;
}

export function updateWorld(world: WorldState): void {
  if (world.outcome !== null) {
    return;
  }

  updateEnemyAi(world);
  // Track supply carts before combat removes dead units this tick.
  updateSupplyState(world);

  for (const unit of world.units) {
    if (unit.path.length === 0) {
      unit.destination = null;
      unit.movementProgress = 0;
      continue;
    }

    unit.movementProgress += 1;
    // Uphill steps take extra ticks (登坂コスト, elevation-contract.md).
    if (unit.movementProgress < stepTicksFor(world, unit)) {
      continue;
    }

    unit.movementProgress = 0;
    const next = unit.path.shift();
    if (next !== undefined) {
      unit.position = next;
    }

    if (unit.path.length === 0) {
      unit.destination = null;
    }
  }

  updateCombat(world);
  updateAttackMoveBehavior(world);
  updateEngineerTasks(world);
  updateFoodSupply(world);
  updateEconomy(world);
  checkOutcome(world);
  world.currentTick += 1;
}

function updateSupplyState(world: WorldState): void {
  const hasAliveCarts = world.units.some(
    (u) => u.owner === "enemy" && u.type === "supply_cart" && u.hp > 0
  );

  if (hasAliveCarts) {
    world.supplyState.hasHadCart = true;
    world.supplyState.retreatTimerActive = false;
    world.supplyState.retreatTimerRemaining = 0;
  } else if (world.supplyState.hasHadCart) {
    if (!world.supplyState.retreatTimerActive) {
      world.supplyState.retreatTimerActive = true;
      world.supplyState.retreatTimerRemaining = SIEGE_BALANCE.supplyRetreatTicks;
    } else {
      world.supplyState.retreatTimerRemaining -= 1;
    }
  }
}

function checkOutcome(world: WorldState): void {
  if (world.outcome !== null) {
    return;
  }

  // Supply-cut victory: retreat timer expired after all supply carts were destroyed.
  if (world.supplyState.retreatTimerActive && world.supplyState.retreatTimerRemaining <= 0) {
    world.units = world.units.filter((unit) => unit.owner !== "enemy");
    world.outcome = { winner: "player", reason: "supply_cut", tick: world.currentTick };
    return;
  }

  // Honmaru fall: at one simulation cut, enemy combat units occupy the
  // honmaru footprint while no defender combat unit is inside.
  const honmaru = intactBuildingsOfType(world, "honmaru")[0];
  if (honmaru !== undefined) {
    const cells = new Set(honmaru.footprint.map(cellKey));
    let enemiesInside = 0;
    let defendersInside = 0;
    for (const unit of world.units) {
      if (unit.hp <= 0 || !cells.has(cellKey(unit.position))) {
        continue;
      }
      if (unit.owner === "enemy") {
        enemiesInside += 1;
      } else if (unit.owner === "player") {
        defendersInside += 1;
      }
    }
    if (enemiesInside > 0 && defendersInside === 0) {
      world.outcome = { winner: "enemy", reason: "honmaru_fallen", tick: world.currentTick };
      return;
    }
  }

  // Defender victory by endurance: hold the honmaru until the scenario's
  // deadline (victory-and-defeat.md: 規定時間まで本丸を保持).
  const holdTicks = world.scenario.victory.holdTicks;
  if (holdTicks !== null && world.currentTick >= holdTicks) {
    world.outcome = { winner: "player", reason: "time_held", tick: world.currentTick };
    return;
  }

  // Defender victory: attacking force annihilated after every attack wave
  // has spawned; wiping the vanguard before reinforcements arrive is not a
  // win yet.
  if (
    world.currentTick > 0 &&
    world.nextWaveIndex >= world.scenario.waves.length &&
    !world.units.some((unit) => unit.owner === "enemy" && unit.hp > 0)
  ) {
    world.outcome = { winner: "player", reason: "enemy_annihilated", tick: world.currentTick };
  }
}

export function snapshotWorld(world: WorldState, options: SnapshotOptions = {}): WorldSnapshot {
  const includeMapCells = options.includeMapCells ?? true;
  const nextWave = world.scenario.waves[world.nextWaveIndex];
  const nextWaveTick = nextWave !== undefined ? nextWave.tick : null;
  const holdDeadlineTick = world.scenario.victory.holdTicks;

  // Drain the combat-event buffer: the snapshot consumer receives each event
  // exactly once (P6 contract). While the sim is paused or after the outcome
  // is decided updateWorld does not run, so no new events accumulate and
  // subsequent snapshots carry an empty array; events from the deciding tick
  // itself are still delivered by the first snapshot taken after it.
  const events = world.combatEvents;
  world.combatEvents = [];

  return {
    currentTick: world.currentTick,
    invalidMoveTarget: world.invalidMoveTarget,
    outcome: world.outcome,
    food: snapshotFood(world),
    economy: snapshotEconomy(world),
    terrainRevision: world.terrainRevision,
    supplyRetreat: {
      active: world.supplyState.retreatTimerActive,
      remainingTicks: world.supplyState.retreatTimerRemaining
    },
    map: {
      width: world.map.width,
      height: world.map.height,
      cells: includeMapCells ? world.map.cells.map(snapshotCell) : [],
      decorations: includeMapCells ? world.map.decorations : []
    },
    units: world.units.map((unit) => ({
      id: unit.id,
      owner: unit.owner,
      type: unit.type,
      position: unit.position,
      destination: unit.destination,
      path: unit.path,
      selected: unit.selected,
      hp: unit.hp,
      maxHp: unit.maxHp,
      attackDamage: unit.attackDamage,
      attackRange: unit.attackRange,
      attackCooldownTicks: unit.attackCooldownTicks,
      attackCooldownRemaining: unit.attackCooldownRemaining,
      targetId: unit.targetId,
      assetId: unit.assetId,
      task: unit.task,
      movementProgress: unit.movementProgress,
      // Effective step duration including the current step's climb penalty so
      // client interpolation stays in sync with the slower uphill movement.
      ticksPerStep: stepTicksFor(world, unit),
      elevation: elevationAt(world, unit.position)
    })),
    buildings: world.buildings.map((building) => snapshotBuilding(world, building)),
    events,
    nextWaveTick,
    holdDeadlineTick
  };
}

function snapshotEconomy(world: WorldState): EconomySnapshot {
  const seasonIndex = Math.floor(world.currentTick / ECONOMY_BALANCE.seasonTicks);
  return {
    gold: world.economy.gold,
    weapons: world.economy.weapons,
    population: world.economy.population,
    populationCapacity: populationCapacity(world),
    approval: currentApproval(),
    recruitPool: world.economy.recruitPool,
    recruitPoolMax: maxRecruitPool(world),
    season: SEASONS[seasonIndex % SEASONS.length] ?? "spring",
    year: Math.floor(seasonIndex / SEASONS.length) + 1,
    plantedFarms: world.economy.plantedFarmIds.length
  };
}

function snapshotFood(world: WorldState): FoodSnapshot {
  const storehouses = intactBuildingsOfType(world, "storehouse");
  const connectedIds = new Set(world.food.connectedStorehouseIds);
  let available = 0;
  let total = 0;
  let capacity = 0;
  for (const storehouse of storehouses) {
    total += storehouse.food ?? 0;
    capacity += storehouse.foodCapacity ?? 0;
    if (connectedIds.has(storehouse.id)) {
      available += storehouse.food ?? 0;
    }
  }
  return {
    available,
    total,
    capacity,
    requiredPerCycle: requiredFoodPerCycle(world),
    nextConsumptionInTicks: Math.max(0, world.food.nextConsumptionTick - world.currentTick)
  };
}
