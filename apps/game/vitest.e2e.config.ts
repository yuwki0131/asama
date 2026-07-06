import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/**/*.test.ts"],
    // autoplay/monkey have dedicated configs + npm scripts (longer budgets)
    exclude: ["e2e/autoplay.test.ts", "e2e/monkey.test.ts"],
    environment: "node",
    testTimeout: 90_000,
    hookTimeout: 60_000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true }
    },
    reporters: ["verbose"],
    globalSetup: ["e2e/setup.ts"]
  }
});
