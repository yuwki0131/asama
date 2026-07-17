import { useState } from "react";
import { scenarios } from "@asama/content";
import type { ContentScenarioDefinition } from "@asama/content";

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

// シナリオごとの表示メタデータ (難度ラベルとショーケース強調)。
// roster (@asama/content の scenarios) に無い id は「標準」扱いで表示する。
const SCENARIO_META: Record<string, { difficulty: string; isShowcase?: boolean }> = {
  "concentric-castle": { difficulty: "入門" },
  "linear-fortress": { difficulty: "標準" },
  "riverside-defense": { difficulty: "上級" },
  "mountain-castle": { difficulty: "2.0 SHOWCASE", isShowcase: true },
  "water-castle": { difficulty: "標準" },
  "castle-town-gate": { difficulty: "標準" },
  "cut-pass-fort": { difficulty: "標準" },
  "stepped-fortress": { difficulty: "上級" },
  "five-tier-keep": { difficulty: "上級" },
  "free-play": { difficulty: "自由演習" },
};

const SCENARIO_CARDS: readonly ScenarioCard[] = scenarios.map((scenario) => {
  const meta = SCENARIO_META[scenario.id] ?? { difficulty: "標準" };
  return {
    id: scenario.id,
    name: scenario.name,
    difficulty: meta.difficulty,
    description: (scenario as ContentScenarioDefinition).description ?? "",
    isShowcase: meta.isShowcase ?? false,
  };
});

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
