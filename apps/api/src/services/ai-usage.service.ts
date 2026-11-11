import { ResultAsync } from "neverthrow";

import type { AiProviderId } from "@oscar/ai/providers";
import {
  formatMicroUsd,
  modelPrice,
  usageCostMicroUsd,
} from "@oscar/ai/pricing";
import { withUsage } from "@oscar/ai/usage";
import { AiUsageDal } from "@oscar/dal";

import { logger } from "../lib/logger";

import { OscarError } from "../errors/oscar.error";

import { ErrorType } from "../enums/error.enum";

import { budgetDay, parseDailyBudget } from "../helpers/ai-budget";

import type { AiUsageResponseType } from "@oscar/validators";

/** Read once at startup: a bad value stops the server here. */
const DAILY_BUDGET_MICRO_USD = parseDailyBudget(process.env.DAILY_BUDGET_USD);

type AiFeature = "chat" | "completion" | "commit-message";

const databaseError = (error: unknown) =>
  new OscarError(ErrorType.DATABASE_ERROR, `Database error: ${String(error)}`, {
    cause: error,
  });

/**
 * Each user's daily AI budget. Every model call is saved with its cost (its
 * tokens at the model's price), and a request is refused once the user's
 * calls since midnight UTC cost the budget or more. The check comes before a
 * request, so the last one of the day can go a little over.
 */
export class AiUsageService {
  /** What the user has spent today, and their budget. */
  static async today(userId: string): Promise<AiUsageResponseType> {
    const { start, resetsAt } = budgetDay(new Date());
    const spent = await ResultAsync.fromPromise(
      AiUsageDal.costSince({ userId, since: start }),
      databaseError,
    );
    if (spent.isErr()) throw spent.error;

    return {
      spentMicroUsd: spent.value,
      budgetMicroUsd: DAILY_BUDGET_MICRO_USD,
      resetsAt: resetsAt.toISOString(),
    };
  }

  /** Refuses the request once the user has spent today's budget. */
  static async assertWithinBudget(userId: string) {
    const { spentMicroUsd, budgetMicroUsd } =
      await AiUsageService.today(userId);
    if (spentMicroUsd >= budgetMicroUsd) {
      throw new OscarError(
        ErrorType.BUDGET_EXCEEDED,
        `You've used today's ${formatMicroUsd(budgetMicroUsd)} AI budget. It resets at midnight UTC.`,
      );
    }
  }

  /**
   * `chat()` middleware that saves the cost of each model call the run makes.
   * Refuses a model without a price, whose calls couldn't be counted.
   * A failed save is logged, not thrown: the user's answer still arrives.
   */
  static tracker({
    userId,
    feature,
    provider,
    model,
  }: {
    userId: string;
    feature: AiFeature;
    provider: AiProviderId;
    model: string;
  }) {
    const price = modelPrice(provider, model);
    if (!price) {
      throw new OscarError(
        ErrorType.BAD_REQUEST,
        `"${model}" has no price set on this server, so its usage can't be counted`,
      );
    }

    return withUsage(async (usage) => {
      const costMicroUsd = usageCostMicroUsd(price, usage);
      const saved = await ResultAsync.fromPromise(
        AiUsageDal.record({
          userId,
          feature,
          provider,
          model,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          costMicroUsd,
        }),
        databaseError,
      );
      if (saved.isErr()) {
        logger.error(
          {
            error: saved.error,
            userId,
            feature,
            provider,
            model,
            costMicroUsd,
          },
          "Couldn't save AI usage",
        );
      }
    });
  }
}
