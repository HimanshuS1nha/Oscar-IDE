import { logger } from "../lib/logger";

import type { Context, Next } from "hono";

export const loggingMiddleware = async (c: Context, next: Next) => {
  const requestId = crypto.randomUUID();

  logger.debug(`Incoming request to ${c.req.path} with ID = ${requestId}`);

  c.set("requestId", requestId);

  const start = performance.now();

  const result = await next();

  const end = performance.now();

  logger.debug(
    `Incoming request to ${c.req.path} with ID = ${requestId} resolved in ${(end - start).toFixed(3)}ms`,
  );

  return result;
};
