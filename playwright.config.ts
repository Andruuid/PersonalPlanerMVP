import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3001";

/**
 * Siehe README: Datenbank migrieren und seed vor dem ersten E2E-Lauf.
 *
 * Lokaler Dev-Server: `reuseExistingServer` vermeidet einen zweiten Prozess,
 * wenn bereits `npm run dev` läuft.
 */
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 4,
  reporter: [["html", { open: "never" }], ["list"]],
  expect: {
    timeout: process.env.CI ? 30_000 : 15_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3001",
    url: baseURL,
    // Always boot a fresh dev server for E2E to avoid stale in-memory Prisma
    // client/schema state from long-running local sessions.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
