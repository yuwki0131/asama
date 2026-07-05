import type { BuildingSnapshot, UnitSnapshot } from "@asama/shared";
import { aggregateSelectedUnits, buildingTypeLabel } from "./selectionPanelUtils";

interface SelectionInfoPanelProps {
  readonly selectedUnits: readonly UnitSnapshot[];
  readonly selectedBuilding: BuildingSnapshot | null;
}

export function SelectionInfoPanel({ selectedUnits, selectedBuilding }: SelectionInfoPanelProps) {
  if (selectedUnits.length === 0 && selectedBuilding === null) {
    return null;
  }

  if (selectedUnits.length > 0) {
    const groups = aggregateSelectedUnits(selectedUnits);
    return (
      <aside className="selection-info-panel" aria-label="選択情報">
        <span className="sip-title">選択中 ({selectedUnits.length})</span>
        {groups.map((g) => (
          <span key={g.type} className="sip-group">
            <span className="sip-type">{g.label}</span>
            {g.count > 1 && <span className="sip-count">×{g.count}</span>}
            <span className="sip-hp">
              HP {g.totalHp}/{g.maxTotalHp}
            </span>
            <span className="sip-stat">攻{g.attackDamage}</span>
            <span className="sip-stat">射{g.attackRange}</span>
          </span>
        ))}
      </aside>
    );
  }

  const b = selectedBuilding!;
  return (
    <aside className="selection-info-panel" aria-label="選択情報">
      <span className="sip-title">{buildingTypeLabel(b.type)}</span>
      <span className="sip-group">
        <span className="sip-hp">
          HP {b.hp}/{b.maxHp}
        </span>
        {b.food !== null && b.foodCapacity !== null && (
          <span className="sip-stat">
            兵糧 {b.food}/{b.foodCapacity}
          </span>
        )}
        <span className={`sip-stat ${b.connectedToHonmaru ? "sip-connected" : "sip-disconnected"}`}>
          {b.connectedToHonmaru ? "接続" : "孤立"}
        </span>
        {b.gateState !== null && (
          <span className="sip-stat">{b.gateState === "open" ? "門:開" : "門:閉"}</span>
        )}
      </span>
    </aside>
  );
}
