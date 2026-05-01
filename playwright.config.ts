import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3001";

const isWindows = process.platform === "win32";
const shouldRunWebKit =
  process.env.PLAYWRIGHT_INCLUDE_WEBKIT === "1" ||
  process.env.PLAYWRIGHT_INCLUDE_WEBKIT === "true" ||
  (!isWindows && process.env.PLAYWRIGHT_SKIP_WEBKIT !== "1");

const projects = [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: "firefox",
    use: { ...devices["Desktop Firefox"] },
  },
  ...(shouldRunWebKit
    ? [
        {
          name: "webkit",
          use: { ...devices["Desktop Safari"] },
        },
      ]
    : []),
  ...(shouldRunWebKit
    ? [
        {
          name: "mobile-safari",
          use: { ...devices["iPhone 13"] },
        },
      ]
    : [
        {
          name: "mobile-chrome",
          use: { ...devices["Pixel 7"] },
        },
      ]),
];

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
  // 2-vCPU GitHub runners can't sustain 4 parallel workers × 4 browsers; the
  // dev/start server queues requests and tests time out. 2 is the sweet spot.
  workers: process.env.CI ? 2 : 4,
  reporter: [["html", { open: "never" }], ["list"]],
  // Test timeout must be higher than `expect.timeout`, otherwise a single slow
  // expect consumes the entire test budget.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: {
    timeout: process.env.CI ? 30_000 : 15_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects,
  webServer: {
    // Spawn node directly on next's bin script — no `npm` and no `.cmd` shim.
    // On Windows both wrappers leave cmd.exe as the parent, and when Playwright
    // kills the parent the node child survives and squats on the port,
    // breaking the next run with EADDRINUSE.
    command: "node node_modules/next/dist/bin/next dev --port 3001",
    url: baseURL,
    // Always boot a fresh server for E2E to avoid stale in-memory Prisma
    // client/schema state from long-running local sessions.
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
