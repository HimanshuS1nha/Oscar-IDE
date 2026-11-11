import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "api",
    env: {
      // Read when the modules load. Nothing connects: the pool opens on the
      // first query, and these tests make none.
      DATABASE_URL: "mysql://test:test@127.0.0.1:3306/oscar_test",
      JWT_SECRET: "test-secret",
      LOG_LEVEL: "silent",
    },
  },
});
