import { ZodError } from "@oscar/validators";

import { logger } from "../lib/logger";

import { getResponseMessage } from "../helpers/get-response-message";
import { getHttpStatus } from "../helpers/get-http-status";

import { OscarError } from "../errors/oscar.error";

import { GENERIC_ERROR_MESSAGE } from "../constants/messages";

import type { Context } from "hono";
import type { HTTPResponseError } from "hono/types";

export const errorMiddleware = (
  error: Error | HTTPResponseError,
  c: Context,
) => {
  const requestId = c.get("requestId");

  logger.error({
    error,
    cause: error.cause,
    stackTrace: error.stack,
    path: c.req.path,
    requestId,
  });

  if (error instanceof OscarError) {
    return c.json({ message: getResponseMessage(error) }, getHttpStatus(error));
  } else if (error instanceof ZodError) {
    const message = error.issues.map((err) => err.message).join("; ");
    return c.json({ message }, 400);
  } else {
    return c.json({ message: GENERIC_ERROR_MESSAGE }, 500);
  }
};
