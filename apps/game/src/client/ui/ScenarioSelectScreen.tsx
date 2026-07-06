import { useState } from "react";
import {
  concentricCastleScenario,
  linearFortressScenario,
  riversideDefenseScenario,
  mountainCastleScenario,
} from "@asama/content";

interface ScenarioSelectScreenProps {
  onSelect: (scenarioId: string) => void;
}

interface ScenarioCard {
  readonly id: string;
  readonly name: string;
  readonly difficulty: string;
  readonly description: string;
  readonly isShowcase: boolean;
}

const SCENARIO_CARDS: readonly ScenarioCard[] = [
  {
    id: concentricCastleScenario.id,
    name: concentricCastleScenario.name,
    difficulty: "入門",
    description: concentricCastleScenario.description ?? "",
    isShowcase: false,
  },
  {
    id: linearFortressScenario.id,
    name: linearFortressScenario.name,
    difficulty: "標準",
    description: linearFortressScenario.description ?? "",
    isShowcase: false,
  },
  {
    id: riversideDefenseScenario.id,
    name: riversideDefenseScenario.name,
    difficulty: "上級",
    description: riversideDefenseScenario.description ?? "",
    isShowcase: false,
  },
  {
    id: mountainCastleScenario.id,
    name: mountainCastleScenario.name,
    difficulty: "2.0 SHOWCASE",
    description: mountainCastleScenario.description ?? "",
    isShowcase: true,
  },
];

export function ScenarioSelectScreen({ onSelect }: ScenarioSelectScreenProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="scenario-select-screen">
      <div className="scenario-select-inner">
        <h1 className="scenario-select-title">浅間</h1>
        <p className="scenario-select-subtitle">シナリオを選択してください</p>
        <div className="scenario-card-grid">
          {SCENARIO_CARDS.map((card) => (
            <button
              key={card.id}
              type="button"
              className={[
                "scenario-card",
                card.isShowcase ? "scenario-card--showcase" : "",
                hoveredId === card.id ? "scenario-card--hovered" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelect(card.id)}
              onMouseEnter={() => setHoveredId(card.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="scenario-card-header">
                <span className="scenario-card-name">{card.name}</span>
                <span
                  className={
                    card.isShowcase
                      ? "scenario-card-difficulty scenario-card-difficulty--showcase"
                      : "scenario-card-difficulty"
                  }
                >
                  {card.difficulty}
                </span>
              </div>
              <p className="scenario-card-description">{card.description}</p>
              {card.isShowcase && (
                <span className="scenario-card-new-badge">NEW</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
