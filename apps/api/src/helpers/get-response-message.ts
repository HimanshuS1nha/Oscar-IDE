import { GENERIC_ERROR_MESSAGE } from "../constants/messages";
import { ErrorType } from "../enums/error.enum";

import type { OscarError } from "../errors/oscar.error";

export const getResponseMessage = (error: OscarError): string => {
  switch (error.type) {
    // Written for the client: says what to fix in the request.
    case ErrorType.BAD_REQUEST:
      return error.message;
    case ErrorType.UNAUTHORIZED:
      return "Unauthorized";
    case ErrorType.NOT_FOUND:
      return error.entity ? `${error.entity} not found` : "Not found";
    case ErrorType.CONFLICT:
      return error.entity ? `${error.entity} already exists` : "Already exists";
    // Written for the user: says how much and when it resets.
    case ErrorType.BUDGET_EXCEEDED:
      return error.message;
    case ErrorType.DATABASE_ERROR:
      return GENERIC_ERROR_MESSAGE;
    case ErrorType.GENERIC_ERROR:
      return GENERIC_ERROR_MESSAGE;
    default:
      return GENERIC_ERROR_MESSAGE;
  }
};
