import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/**/*.test.ts"],
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
