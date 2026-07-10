import { MAP_HEIGHT, MAP_WIDTH, type CellCoord } from "@asama/shared";
import { getBuildingAt } from "./buildings";
import { canTraverseElevation, climbCost } from "./elevation";
import { getCell } from "./map";
import { ORTHOGONAL_DIRECTIONS, cellKey, isBridge, isGate, isInsideMap, manhattan, sameCell } from "./types";
import type { UnitState, WorldState } from "./types";

export function formationSlots(world: WorldState, destination: CellCoord, count: number, perspective?: "player"): CellCoord[] {
  const slots: CellCoord[] = [];
  const visited = new Set<string>([cellKey(destination)]);
  const queue: CellCoord[] = [destination];
  let explored = 0;
  const explorationLimit = Math.max(count * 12, 200);

  while (queue.length > 0 && slots.length < count && explored < explorationLimit) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    explored += 1;
    if (isPassable(world, current, perspective)) {
      slots.push(current);
    }
    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = cellKey(next);
      if (visited.has(key) || !isInsideMap(next)) {
        continue;
      }
      visited.add(key);
      queue.push(next);
    }
  }
  return slots;
}

export function findSpawnCell(world: WorldState, preferred: CellCoord, perspective?: "player"): CellCoord | null {
  if (isPassable(world, preferred, perspective)) {
    return preferred;
  }
  for (let radius = 1; radius <= 4; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const candidate = { x: preferred.x + dx, y: preferred.y + dy };
        if (isPassable(world, candidate, perspective)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

export const PATH_RETRY_COOLDOWN_TICKS = 40;

export function findPath(world: WorldState, start: CellCoord, goal: CellCoord, perspective?: "player"): CellCoord[] {
  if (sameCell(start, goal)) {
    return [];
  }

  const open = new Map<string, PathNode>();
  const closed = new Set<string>();
  const nodes = new Map<string, PathNode>();
  const startKey = cellKey(start);
  const startNode = {
    coord: start,
    g: 0,
    f: manhattan(start, goal),
    parentKey: null
  };
  open.set(startKey, startNode);
  nodes.set(startKey, startNode);

  while (open.size > 0) {
    const current = lowestCostNode(open);
    const currentKey = cellKey(current.coord);
    open.delete(currentKey);

    if (sameCell(current.coord, goal)) {
      return reconstructPath(currentKey, nodes);
    }

    closed.add(currentKey);

    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const neighbor = { x: current.coord.x + direction.x, y: current.coord.y + direction.y };
      const neighborKey = cellKey(neighbor);
      if (!isInsideMap(neighbor) || closed.has(neighborKey) || !canStep(world, current.coord, neighbor, perspective)) {
        continue;
      }

      const tentativeG = current.g + movementCostForStep(world, current.coord, neighbor);
      const known = open.get(neighborKey);
      if (known !== undefined && tentativeG >= known.g) {
        continue;
      }

      const nextNode = {
        coord: neighbor,
        g: tentativeG,
        f: tentativeG + manhattan(neighbor, goal),
        parentKey: currentKey
      };
      open.set(neighborKey, nextNode);
      nodes.set(neighborKey, nextNode);
    }
  }

  return [];
}

export function findPathToAttackRange(world: WorldState, start: CellCoord, target: CellCoord, range: number, perspective?: "player"): CellCoord[] {
  const candidates: CellCoord[] = [];
  for (let y = Math.max(0, target.y - range); y <= Math.min(MAP_HEIGHT - 1, target.y + range); y += 1) {
    for (let x = Math.max(0, target.x - range); x <= Math.min(MAP_WIDTH - 1, target.x + range); x += 1) {
      const candidate = { x, y };
      if (manhattan(candidate, target) <= range && isPassable(world, candidate, perspective)) {
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => {
    const distanceA = manhattan(start, a);
    const distanceB = manhattan(start, b);
    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }
    return cellKey(a).localeCompare(cellKey(b));
  });

  for (const candidate of candidates) {
    const path = findPath(world, start, candidate, perspective);
    if (path.length > 0 || sameCell(start, candidate)) {
      return path;
    }
  }

  return [];
}

interface PathNode {
  readonly coord: CellCoord;
  readonly g: number;
  readonly f: number;
  readonly parentKey: string | null;
}

function lowestCostNode(nodes: Map<string, PathNode>): PathNode {
  let best: PathNode | null = null;
  for (const node of nodes.values()) {
    if (best === null || node.f < best.f || (node.f === best.f && cellKey(node.coord) < cellKey(best.coord))) {
      best = node;
    }
  }

  if (best === null) {
    throw new Error("Cannot select a path node from an empty open set");
  }

  return best;
}

function reconstructPath(goalKey: string, nodes: Map<string, PathNode>): CellCoord[] {
  const path: CellCoord[] = [];
  let current = nodes.get(goalKey);

  while (current !== undefined && current.parentKey !== null) {
    path.push(current.coord);
    current = nodes.get(current.parentKey);
  }

  return path.reverse();
}

export function isPassable(world: WorldState, coord: CellCoord, perspective?: "player" | "supply"): boolean {
  if (!isInsideMap(coord)) {
    return false;
  }

  if (getUnitAt(world, coord) !== null) {
    return false;
  }

  const cell = getCell(world, coord);
  const building = getBuildingAt(world, coord);
  if (building !== null) {
    // Supply perspective: player gates are always passable for food connectivity
    // regardless of open/closed state (通用口の抽象化).
    const effectivePassable =
      perspective === "supply" && building.owner === "player" && isGate(building.type)
        ? true
        : building.passable;

    // gate_wide_3 / gate_wide_3_ne_sw (3-cell gate): when passable, only the
    // center cell (footprint[1]) acts as the opening. The two end cells are
    // gate pillars and remain impassable regardless of open/closed state.
    if (
      (building.type === "gate_wide_3" || building.type === "gate_wide_3_ne_sw") &&
      effectivePassable
    ) {
      const centerCell = building.footprint[Math.floor(building.footprint.length / 2)];
      if (centerCell === undefined || !sameCell(coord, centerCell)) {
        return false;
      }
    }

    return effectivePassable && (cell.passable || isBridge(building.type));
  }

  return cell.passable;
}

/**
 * Edge-based traversal check: movement legality between two adjacent cells is
 * a property of the pair, not of the destination cell alone. A step is legal
 * when the destination is passable AND the elevation edge rule allows it
 * (matching surface heights; cliffs and slope sides block).
 */
export function canStep(world: WorldState, from: CellCoord, to: CellCoord, perspective?: "player" | "supply"): boolean {
  return isPassable(world, to, perspective) && canTraverseElevation(world, from, to);
}

/** Cost of entering `to` from `from`: terrain/building cost plus climb cost. */
export function movementCostForStep(world: WorldState, from: CellCoord, to: CellCoord): number {
  return movementCostAt(world, to) + climbCost(world, from, to);
}

export function movementCostAt(world: WorldState, coord: CellCoord): number {
  const terrainCost = getCell(world, coord).movementCost;
  const building = getBuildingAt(world, coord);
  if (building === null) {
    return terrainCost;
  }
  return terrainCost + building.movementCostModifier;
}

export function getUnitAt(world: WorldState, coord: CellCoord): UnitState | null {
  return world.units.find((unit) => unit.hp > 0 && sameCell(unit.position, coord)) ?? null;
}
