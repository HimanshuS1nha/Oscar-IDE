import type { ErrorType } from "../enums/error.enum.js";

export class OscarError extends Error {
  constructor(
    readonly type: ErrorType,
    message: string,
    options?: ErrorOptions,
    readonly entity?: string,
  ) {
    super(message, options);
  }
}
