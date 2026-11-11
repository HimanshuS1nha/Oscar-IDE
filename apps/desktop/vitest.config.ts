import path from "node:path";
import { defineProject } from "vitest/config";

// Separate from vite.config.ts: tests need the `@/` alias, not the Electron
// and React plugins.
export default defineProject({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    name: "desktop",
    environment: "node",
    // Not e2e/: those are Playwright's.
    include: ["src/**/*.test.{ts,tsx}", "electron/**/*.test.ts"],
  },
});
