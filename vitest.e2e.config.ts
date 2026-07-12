import { defineConfig } from "vitest/config";

/**
 * Vitest config for the real-Next.js e2e suite (e2e/**). Kept separate from the
 * default vitest.config.ts so `npm test` (fast unit tests) does not run the
 * heavy install+build+server e2e. Run via `npm run test:e2e`.
 */
export default defineConfig({
  test: {
    include: ["e2e/**/*.spec.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 300_000,
    pool: "forks",
    fileParallelism: false,
  },
});
