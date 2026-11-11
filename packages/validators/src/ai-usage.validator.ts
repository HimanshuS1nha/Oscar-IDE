import z from "zod";

/** `GET /api/ai/usage`: what the user's AI calls cost today, and their budget. */
export const aiUsageResponseValidator = z.object({
  /** Spent since midnight UTC, in micro-dollars (millionths of a dollar). */
  spentMicroUsd: z.number().int(),
  budgetMicroUsd: z.number().int(),
  /** When the day's spending goes back to zero: the next midnight UTC, as ISO 8601. */
  resetsAt: z.iso.datetime(),
});

export type AiUsageResponseType = z.infer<typeof aiUsageResponseValidator>;
