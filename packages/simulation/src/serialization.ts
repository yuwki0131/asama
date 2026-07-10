import { mvpDefenseScenario } from "@asama/content";
import type { SerializedWorld } from "@asama/shared";
import { ECONOMY_BALANCE } from "./types";
import type { WorldState } from "./types";

const SAVE_VERSION = 1;

export function serializeWorld(world: WorldState): SerializedWorld {
  return { version: SAVE_VERSION, world: JSON.parse(JSON.stringify(world)) };
}

export function deserializeWorld(serialized: SerializedWorld): WorldState {
  if (serialized.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version: ${serialized.version}`);
  }
  const world = serialized.world as WorldState;
  if (
    typeof world !== "object" ||
    world === null ||
    !Array.isArray(world.units) ||
    !Array.isArray(world.buildings) ||
    typeof world.currentTick !== "number" ||
    world.map?.cells === undefined
  ) {
    throw new Error("Malformed save payload");
  }
  for (const unit of world.units) {
    unit.pathRetryCooldown ??= 0;
    unit.task ??= null;
    unit.attackMoveDestination ??= null;
  }
  for (const building of world.buildings) {
    building.ladderHp ??= null;
    building.fillProgress ??= 0;
  }
  // Pre-elevation saves: backfill flat terrain (elevation-contract.md).
  world.map.cells = world.map.cells.map((cell) => ({
    ...cell,
    elevation: cell.elevation ?? 0,
    slope: cell.slope ?? null,
    elevationSkin: cell.elevationSkin ?? "cliff"
  }));
  world.nextWaveIndex ??= 0;
  world.scenario ??= { waves: mvpDefenseScenario.waves, victory: mvpDefenseScenario.victory };
  world.supplyState ??= { hasHadCart: false, retreatTimerActive: false, retreatTimerRemaining: 0 };
  world.map.decorations ??= [];
  // Pre-P6 saves: start with an empty combat-event buffer.
  world.combatEvents ??= [];
  // Pre-terrain-building saves: start revision at 0.
  world.terrainRevision ??= 0;
  world.economy ??= {
    gold: ECONOMY_BALANCE.initialGold,
    weapons: ECONOMY_BALANCE.initialWeapons,
    population: ECONOMY_BALANCE.initialPopulation,
    recruitPool: Math.floor(ECONOMY_BALANCE.initialPopulation * ECONOMY_BALANCE.mobilizationRate),
    plantedFarmIds: [],
    lastProcessedMonth: Math.floor(world.currentTick / ECONOMY_BALANCE.monthTicks),
    lastProcessedSeason: Math.floor(world.currentTick / ECONOMY_BALANCE.seasonTicks)
  };
  return world;
}
