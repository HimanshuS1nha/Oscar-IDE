import "dotenv/config";

import { serve } from "@hono/node-server";

import { app } from "./app";
import { logger } from "./lib/logger";

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    logger.info(`Server is running on http://localhost:${info.port}`);
  },
);
