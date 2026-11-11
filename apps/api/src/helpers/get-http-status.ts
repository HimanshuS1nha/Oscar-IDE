import { ErrorType } from "../enums/error.enum";

import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { OscarError } from "../errors/oscar.error";

export const getHttpStatus = (error: OscarError): ContentfulStatusCode => {
  switch (error.type) {
    case ErrorType.BAD_REQUEST:
      return 400;
    case ErrorType.UNAUTHORIZED:
      return 401;
    case ErrorType.NOT_FOUND:
      return 404;
    case ErrorType.CONFLICT:
      return 409;
    case ErrorType.BUDGET_EXCEEDED:
      return 429;
    case ErrorType.DATABASE_ERROR:
      return 500;
    case ErrorType.GENERIC_ERROR:
      return 500;
    default:
      return 500;
  }
};
