import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/autoplay.test.ts"],
    environment: "node",
    testTimeout: 660_000,   // 11 min per scenario (maxTick 21600, polling overhead included)
    hookTimeout: 60_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    reporters: ["verbose"],
    globalSetup: ["e2e/setup.ts"]
  }
});
