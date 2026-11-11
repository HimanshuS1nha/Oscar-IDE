/** Each user's AI budget per day, in dollars, unless `DAILY_BUDGET_USD` sets one. */
export const DEFAULT_DAILY_BUDGET_USD = 10;

/**
 * `DAILY_BUDGET_USD` in micro-dollars. Unset or empty means the default. A
 * value that isn't a number of dollars stops the server from starting, rather
 * than leaving AI calls unlimited or blocked by mistake.
 */
export const parseDailyBudget = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_DAILY_BUDGET_USD * 1e6;
  }
  const dollars = Number(value);
  if (!Number.isFinite(dollars) || dollars < 0) {
    throw new Error(
      `DAILY_BUDGET_USD must be a number of dollars, such as 10, not "${value}"`,
    );
  }
  return Math.round(dollars * 1e6);
};

/** Today's span for the budget: from midnight UTC to the next midnight UTC. */
export const budgetDay = (now: Date) => {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const resetsAt = new Date(start);
  resetsAt.setUTCDate(start.getUTCDate() + 1);
  return { start, resetsAt };
};
