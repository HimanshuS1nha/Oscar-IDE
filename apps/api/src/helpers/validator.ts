import { zValidator } from "@hono/zod-validator";

import type { ZodType } from "@oscar/validators";
import type { ValidationTargets } from "hono";

export const validator = <
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw result.error;
    }
  });
