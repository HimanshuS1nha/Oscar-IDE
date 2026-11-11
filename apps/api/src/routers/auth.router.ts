import { Hono } from "hono";

import { loginValidator, registerValidator } from "@oscar/validators";

import { validator } from "../helpers/validator";

import { authMiddleware } from "../middlewares/auth.middleware";

import { AuthService } from "../services/auth.service";

const authRouter = new Hono();

authRouter.post("/login", validator("json", loginValidator), async (c) => {
  return c.json(await AuthService.login(c.req.valid("json")), 200);
});

authRouter.post(
  "/register",
  validator("json", registerValidator),
  async (c) => {
    return c.json(await AuthService.register(c.req.valid("json")), 201);
  },
);

authRouter.get("/me", authMiddleware, (c) => {
  const user = c.get("user");

  return c.json({ user }, 200);
});

export { authRouter };
