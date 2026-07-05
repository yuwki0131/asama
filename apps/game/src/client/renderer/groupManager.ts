import type { CellCoord, UnitId, WorldSnapshot } from "@asama/shared";

export function computeGroupCentroid(
  groupIds: readonly UnitId[],
  snapshot: WorldSnapshot
): CellCoord | null {
  if (groupIds.length === 0) {
    return null;
  }
  const idSet = new Set(groupIds);
  const presentUnits = snapshot.units.filter((u) => idSet.has(u.id));
  if (presentUnits.length === 0) {
    return null;
  }
  const sumX = presentUnits.reduce((acc, u) => acc + u.position.x, 0);
  const sumY = presentUnits.reduce((acc, u) => acc + u.position.y, 0);
  return {
    x: Math.round(sumX / presentUnits.length),
    y: Math.round(sumY / presentUnits.length),
  };
}
