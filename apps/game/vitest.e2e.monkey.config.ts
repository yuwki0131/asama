import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/monkey.test.ts"],
    environment: "node",
    testTimeout: 300_000,   // 5 min (covers default 60s run + 30s margin + overhead)
    hookTimeout: 60_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    reporters: ["verbose"],
    globalSetup: ["e2e/setup.ts"]
  }
});
