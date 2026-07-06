/**
 * Global E2E setup/teardown — vitest globalSetup.
 * Starts the dev server once before all test files and stops it after.
 */
import { ensureDevServer, stopDevServer } from "./helpers";

export async function setup(): Promise<void> {
  await ensureDevServer();
}

export async function teardown(): Promise<void> {
  stopDevServer();
}
