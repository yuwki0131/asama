import { MAP_HEIGHT, MAP_WIDTH, type CellCoord, type PlayerCommand, type UnitId, type WorldSnapshot } from "@asama/shared";

interface UnitState {
  readonly id: UnitId;
  position: CellCoord;
  destination: CellCoord | null;
  selected: boolean;
}

export interface WorldState {
  currentTick: number;
  units: UnitState[];
}

export function createInitialWorld(): WorldState {
  return {
    currentTick: 0,
    units: [
      {
        id: "unit:ashigaru:1",
        position: { x: 64, y: 64 },
        destination: null,
        selected: false
      }
    ]
  };
}

export function applyCommand(world: WorldState, command: PlayerCommand): void {
  if (command.type === "selectUnits") {
    const selected = new Set(command.unitIds);
    for (const unit of world.units) {
      unit.selected = selected.has(unit.id);
    }
    return;
  }

  if (command.type === "moveUnits") {
    for (const unit of world.units) {
      if (command.unitIds.includes(unit.id)) {
        unit.destination = clampCell(command.destination);
      }
    }
  }
}

export function updateWorld(world: WorldState): void {
  for (const unit of world.units) {
    if (unit.destination === null) {
      continue;
    }

    const next = stepToward(unit.position, unit.destination);
    unit.position = next;

    if (next.x === unit.destination.x && next.y === unit.destination.y) {
      unit.destination = null;
    }
  }

  world.currentTick += 1;
}

export function snapshotWorld(world: WorldState): WorldSnapshot {
  return {
    currentTick: world.currentTick,
    map: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT
    },
    units: world.units.map((unit) => ({
      id: unit.id,
      position: unit.position,
      selected: unit.selected
    }))
  };
}

function stepToward(from: CellCoord, to: CellCoord): CellCoord {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  return {
    x: from.x + dx,
    y: from.y + dy
  };
}

function clampCell(cell: CellCoord): CellCoord {
  return {
    x: Math.max(0, Math.min(MAP_WIDTH - 1, Math.round(cell.x))),
    y: Math.max(0, Math.min(MAP_HEIGHT - 1, Math.round(cell.y)))
  };
}
