import { Hono } from "hono";
import { cors } from "hono/cors";

import { aiRouter } from "./routers/ai.router";
import { authRouter } from "./routers/auth.router";

import { errorMiddleware } from "./middlewares/error.middleware";
import { loggingMiddleware } from "./middlewares/logging.middleware";

export const app = new Hono().basePath("/api");
app.onError(errorMiddleware);

// The desktop app calls from its dev server or a file:// page. Auth is a
// bearer token, not a cookie, so any origin is fine.
app.use("*", cors());
app.use("*", loggingMiddleware);

app.route("/auth", authRouter);
app.route("/ai", aiRouter);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});
