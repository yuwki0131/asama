interface LoadingScreenProps {
  /** The simulationStatus state string from App.tsx */
  status: string;
  /** When true the overlay transitions to faded-out state */
  isReady: boolean;
}

function statusToJapanese(status: string): string {
  switch (status) {
    case "starting":
      return "起動中...";
    case "worker":
      return "ワーカー準備中...";
    case "ready":
      return "準備完了";
    case "failed":
      return "起動失敗";
    default:
      return "読み込み中...";
  }
}

export function LoadingScreen({ status, isReady }: LoadingScreenProps) {
  return (
    <div
      className={isReady ? "loading-screen loading-screen--fading" : "loading-screen"}
      aria-live="polite"
      aria-label="ゲーム読み込み中"
    >
      <h1 className="loading-title">浅間</h1>
      <p className="loading-status">{statusToJapanese(status)}</p>
      <div className="loading-dots" aria-hidden="true">
        <span className="loading-dot loading-dot--1">●</span>
        <span className="loading-dot loading-dot--2">●</span>
        <span className="loading-dot loading-dot--3">●</span>
      </div>
    </div>
  );
}
