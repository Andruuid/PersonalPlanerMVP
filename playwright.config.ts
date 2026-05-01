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
    // Spawn node directly on next's bin script — no `npm` and no `.cmd` shim
    // in between. On Windows both wrappers leave cmd.exe as the parent, and
    // when Playwright kills the parent the node child survives and squats on
    // the port. The next E2E run then fails with EADDRINUSE and every test
    // reports ERR_CONNECTION_REFUSED / timeout.
    command: "node node_modules/next/dist/bin/next dev --port 3001",
    url: baseURL,
    // Always boot a fresh dev server for E2E to avoid stale in-memory Prisma
    // client/schema state from long-running local sessions.
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
