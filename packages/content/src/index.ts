export interface UnitDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly maxHp: number;
  readonly moveSpeed: number;
  readonly assetId: string;
}

export const unitDefinitions: readonly UnitDefinition[] = [
  {
    id: "spear_ashigaru",
    displayName: "槍足軽",
    maxHp: 100,
    moveSpeed: 1,
    assetId: "unit.spear_ashigaru.idle.south"
  },
  {
    id: "sword_ashigaru",
    displayName: "刀足軽",
    maxHp: 110,
    moveSpeed: 1,
    assetId: "unit.sword_ashigaru.idle.south"
  },
  {
    id: "archer",
    displayName: "弓兵",
    maxHp: 70,
    moveSpeed: 0.95,
    assetId: "unit.archer.idle.south"
  }
];
