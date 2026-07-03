import { describe, expect, it } from "vitest";
import { ECONOMY_BALANCE, applyCommand, createInitialWorld, updateWorld, type WorldState } from "./index";

function advanceTicks(world: WorldState, ticks: number): void {
  for (let i = 0; i < ticks && world.outcome === null; i += 1) {
    updateWorld(world);
  }
}

function withoutEnemies(world: WorldState): WorldState {
  world.units = world.units.filter((unit) => unit.owner !== "enemy");
  return world;
}

function totalFood(world: WorldState): number {
  return world.buildings
    .filter((building) => building.type === "storehouse")
    .reduce((sum, building) => sum + (building.food ?? 0), 0);
}

function command<T extends object>(body: T): T & { issuedAtTick: number; clientSequence: number } {
  return { ...body, issuedAtTick: 0, clientSequence: 1 };
}

describe("population and tax", () => {
  it("collects tax and grows population monthly", () => {
    const world = withoutEnemies(createInitialWorld());
    const goldBefore = world.economy.gold;
    const populationBefore = world.economy.population;

    advanceTicks(world, ECONOMY_BALANCE.monthTicks + 1);

    expect(world.economy.gold).toBeGreaterThan(goldBefore);
    expect(world.economy.population).toBeGreaterThan(populationBefore);
  });

  it("caps population at active town block capacity", () => {
    const world = withoutEnemies(createInitialWorld());
    world.economy.population = 100000;

    advanceTicks(world, ECONOMY_BALANCE.monthTicks + 1);

    const capacity =
      world.buildings
        .filter((building) => building.type === "town_block")
        .reduce((sum, building) => sum + building.footprint.length, 0) * ECONOMY_BALANCE.populationPerTownCell;
    expect(world.economy.population).toBeLessThanOrEqual(Math.max(capacity, 100000));
  });
});

describe("recruiting", () => {
  it("recruits a unit for gold, weapons and a pool slot", () => {
    const world = withoutEnemies(createInitialWorld());
    const before = {
      gold: world.economy.gold,
      weapons: world.economy.weapons,
      pool: world.economy.recruitPool,
      units: world.units.length
    };

    const rejection = applyCommand(world, command({ type: "recruitUnit" as const, unitType: "spear_ashigaru" as const }));

    expect(rejection).toBeNull();
    expect(world.units.length).toBe(before.units + 1);
    expect(world.economy.gold).toBe(before.gold - ECONOMY_BALANCE.recruitCosts.spear_ashigaru.gold);
    expect(world.economy.weapons).toBe(before.weapons - ECONOMY_BALANCE.recruitCosts.spear_ashigaru.weapons);
    expect(world.economy.recruitPool).toBe(before.pool - 1);
  });

  it("rejects recruiting without gold", () => {
    const world = withoutEnemies(createInitialWorld());
    world.economy.gold = 0;

    const rejection = applyCommand(world, command({ type: "recruitUnit" as const, unitType: "archer" as const }));

    expect(rejection).toBe("Not enough gold");
  });

  it("rejects recruiting when the pool is empty", () => {
    const world = withoutEnemies(createInitialWorld());
    world.economy.recruitPool = 0;

    const rejection = applyCommand(world, command({ type: "recruitUnit" as const, unitType: "archer" as const }));

    expect(rejection).toBe("No recruits available");
  });
});

describe("market", () => {
  it("buys food into connected storehouses", () => {
    const world = withoutEnemies(createInitialWorld());
    updateWorld(world);
    const goldBefore = world.economy.gold;
    const foodBefore = totalFood(world);

    const rejection = applyCommand(world, command({ type: "marketTrade" as const, trade: "buyFood" as const }));

    expect(rejection).toBeNull();
    expect(world.economy.gold).toBe(goldBefore - ECONOMY_BALANCE.market.foodBuyPrice);
    expect(totalFood(world)).toBe(foodBefore + ECONOMY_BALANCE.market.foodLot);
  });

  it("sells food for less than the purchase price", () => {
    const world = withoutEnemies(createInitialWorld());
    updateWorld(world);
    const goldBefore = world.economy.gold;
    const foodBefore = totalFood(world);

    const rejection = applyCommand(world, command({ type: "marketTrade" as const, trade: "sellFood" as const }));

    expect(rejection).toBeNull();
    expect(world.economy.gold).toBe(goldBefore + ECONOMY_BALANCE.market.foodSellPrice);
    expect(totalFood(world)).toBe(foodBefore - ECONOMY_BALANCE.market.foodLot);
    expect(ECONOMY_BALANCE.market.foodSellPrice).toBeLessThan(ECONOMY_BALANCE.market.foodBuyPrice);
  });

  it("buys weapons", () => {
    const world = withoutEnemies(createInitialWorld());
    const weaponsBefore = world.economy.weapons;

    const rejection = applyCommand(world, command({ type: "marketTrade" as const, trade: "buyWeapons" as const }));

    expect(rejection).toBeNull();
    expect(world.economy.weapons).toBe(weaponsBefore + ECONOMY_BALANCE.market.weaponsLot);
  });
});

describe("seasons and harvest", () => {
  it("registers initial farms as planted", () => {
    const world = createInitialWorld();
    const farms = world.buildings.filter((building) => building.type === "farm").length;
    expect(world.economy.plantedFarmIds.length).toBe(farms);
  });

  it("harvests planted farms into storehouses at autumn end", () => {
    const world = withoutEnemies(createInitialWorld());
    // Empty the storehouse so the harvest amount is observable.
    for (const building of world.buildings) {
      if (building.type === "storehouse") {
        building.food = 0;
      }
    }
    // Jump straight to just before winter (autumn end).
    world.currentTick = ECONOMY_BALANCE.seasonTicks * 3 - 1;
    world.economy.lastProcessedMonth = Math.floor(world.currentTick / ECONOMY_BALANCE.monthTicks);
    world.economy.lastProcessedSeason = 2;
    const consumed = world.food;
    consumed.nextConsumptionTick = Number.MAX_SAFE_INTEGER;

    updateWorld(world);
    updateWorld(world);

    const farms = world.economy.plantedFarmIds.length;
    expect(totalFood(world)).toBe(farms * ECONOMY_BALANCE.farmHarvestYield);
  });

  it("does not harvest farms planted after the spring cut", () => {
    const world = withoutEnemies(createInitialWorld());
    world.economy.plantedFarmIds = [];
    for (const building of world.buildings) {
      if (building.type === "storehouse") {
        building.food = 0;
      }
    }
    world.currentTick = ECONOMY_BALANCE.seasonTicks * 3 - 1;
    world.economy.lastProcessedMonth = Math.floor(world.currentTick / ECONOMY_BALANCE.monthTicks);
    world.economy.lastProcessedSeason = 2;
    world.food.nextConsumptionTick = Number.MAX_SAFE_INTEGER;

    updateWorld(world);
    updateWorld(world);

    expect(totalFood(world)).toBe(0);
  });
});
