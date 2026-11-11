import { defineConfig } from "@playwright/test";

// Drives the built app (dist/ and dist-electron/): run `pnpm test:e2e`, which
// builds first. On Linux without a display, run it under `xvfb-run`.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  outputDir: "./test-results",
});
