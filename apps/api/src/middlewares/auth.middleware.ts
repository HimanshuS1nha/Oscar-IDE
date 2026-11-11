import { createMiddleware } from "hono/factory";
import { ResultAsync } from "neverthrow";

import { UserDal } from "@oscar/dal";

import { JWTHelper } from "../helpers/jwt.helper";

import { OscarError } from "../errors/oscar.error";

import { ErrorType } from "../enums/error.enum";

export type AuthUser = NonNullable<Awaited<ReturnType<typeof UserDal.getById>>>;

export type AuthEnv = {
  Variables: {
    user: AuthUser;
  };
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  const [scheme, token] = header?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    throw new OscarError(
      ErrorType.UNAUTHORIZED,
      "Missing or malformed Authorization header",
    );
  }

  const payloadResult = await ResultAsync.fromPromise(
    JWTHelper.verify({ token }),
    (error) =>
      new OscarError(
        ErrorType.UNAUTHORIZED,
        `Invalid token: ${String(error)}`,
        { cause: error },
      ),
  );
  if (payloadResult.isErr()) {
    throw payloadResult.error;
  }

  const { sub } = payloadResult.value;
  if (typeof sub !== "string") {
    throw new OscarError(
      ErrorType.UNAUTHORIZED,
      "Token payload has no user email",
    );
  }

  const userResult = await ResultAsync.fromPromise(
    UserDal.getByEmail({ email: sub }),
    (error) =>
      new OscarError(
        ErrorType.DATABASE_ERROR,
        `Database error: ${String(error)}`,
        { cause: error },
      ),
  );
  if (userResult.isErr()) {
    throw userResult.error;
  }

  const user = userResult.value;
  if (!user) {
    throw new OscarError(
      ErrorType.UNAUTHORIZED,
      `User with email ${sub} from token no longer exists`,
    );
  }

  c.set("user", user);

  await next();
});
