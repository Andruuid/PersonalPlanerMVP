import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "server/**/*.test.ts"],
    globalSetup: ["./vitest.global-setup.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
