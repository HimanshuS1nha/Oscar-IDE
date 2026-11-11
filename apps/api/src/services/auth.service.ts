import { ResultAsync } from "neverthrow";

import { UserDal } from "@oscar/dal";

import { HashingHelper } from "../helpers/hahing.helper";
import { JWTHelper } from "../helpers/jwt.helper";

import { OscarError } from "../errors/oscar.error";

import { ErrorType } from "../enums/error.enum";

import type {
  LoginValidatorType,
  RegisterValidatorType,
} from "@oscar/validators";

export class AuthService {
  static async login(data: LoginValidatorType) {
    const userResult = await ResultAsync.fromPromise(
      UserDal.INTERNAL_getByEmail({ email: data.email }),
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
        `User not found for ${data.email}`,
      );
    }

    const doesPasswordMatch = await HashingHelper.verify({
      hashedValue: user.passwordHash,
      originalValue: data.password,
    });
    if (!doesPasswordMatch) {
      throw new OscarError(
        ErrorType.UNAUTHORIZED,
        `Password did not match for ${data.email}`,
      );
    }

    const accessToken = await JWTHelper.sign({
      subject: user.email,
      data: { id: user.id, name: user.name },
      expirationTime: "15d",
    });

    return { message: "Logged in successfully", token: accessToken };
  }

  static async register(data: RegisterValidatorType) {
    const existingUserResult = await ResultAsync.fromPromise(
      UserDal.getByEmail({ email: data.email }),
      (error) =>
        new OscarError(
          ErrorType.DATABASE_ERROR,
          `Database error: ${String(error)}`,
          { cause: error },
        ),
    );
    if (existingUserResult.isErr()) {
      throw existingUserResult.error;
    }
    if (existingUserResult.value) {
      throw new OscarError(
        ErrorType.CONFLICT,
        `User already exists for ${data.email}`,
        undefined,
        "User",
      );
    }

    const passwordHash = await HashingHelper.hash({ value: data.password });

    const userResult = await ResultAsync.fromPromise(
      UserDal.create({ name: data.name, email: data.email, passwordHash }),
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

    return { message: "Registered successfully" };
  }
}
