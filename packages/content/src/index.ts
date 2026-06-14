export interface UnitDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly maxHp: number;
  readonly moveSpeed: number;
  readonly assetId: string;
}

export const unitDefinitions: readonly UnitDefinition[] = [
  {
    id: "ashigaru",
    displayName: "足軽",
    maxHp: 100,
    moveSpeed: 1,
    assetId: "unit.ashigaru.placeholder"
  }
];
