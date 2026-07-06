import type { PlayerCommand, WorldSnapshot } from "@asama/shared";

export interface AsamaTestBridge {
  /** Returns the most recent WorldSnapshot, or null before first tick. */
  getSnapshot(): WorldSnapshot | null;
  /** Enqueue a PlayerCommand via the simulation worker. */
  enqueue(command: PlayerCommand): void;
  /** Set simulation speed (0=paused). */
  setSpeed(speed: 0 | 1 | 2 | 4): void;
  /** Resolves when snapshot.currentTick >= tick. */
  waitForTick(tick: number): Promise<WorldSnapshot>;
  /** Returns the current build tool mode (null = Select). */
  getBuildTool(): string | null;
  /** Returns the absolute screen position of a cell center in px. */
  cellToScreenPoint(cell: { x: number; y: number }): { x: number; y: number } | null;
}

declare global {
  interface Window {
    __asamaTest?: AsamaTestBridge;
  }
}
