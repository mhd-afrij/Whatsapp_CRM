import { defineConfig } from "@playwright/test";

/**
 * Phase 18: written but not executed in this environment - see README.md.
 * Points at a locally-running full stack (frontend + backend + gateway +
 * MySQL + Redis via docker-compose.yml), not a CI-managed webServer, since
 * bringing the whole stack up has not been exercised end-to-end in this
 * build yet either (see PROJECT_STATUS.md Phase 18/19).
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
