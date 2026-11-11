import { defineConfig } from "vitest/config";

// One run for the whole monorepo. Every app and package is a project; a
// project only needs its own `vitest.config.ts` when it needs more than the
// defaults (desktop has one for the `@/` alias).
export default defineConfig({
  test: {
    projects: ["apps/*", "packages/*"],
  },
});
