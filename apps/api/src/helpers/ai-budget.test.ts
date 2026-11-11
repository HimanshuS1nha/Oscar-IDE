import { describe, expect, it } from "vitest";

import {
  budgetDay,
  DEFAULT_DAILY_BUDGET_USD,
  parseDailyBudget,
} from "./ai-budget";

describe("parseDailyBudget", () => {
  it("defaults when unset or empty", () => {
    const fallback = DEFAULT_DAILY_BUDGET_USD * 1e6;
    expect(parseDailyBudget(undefined)).toBe(fallback);
    expect(parseDailyBudget("")).toBe(fallback);
    expect(parseDailyBudget("  ")).toBe(fallback);
  });

  it("reads dollars as micro-dollars", () => {
    expect(parseDailyBudget("10")).toBe(10_000_000);
    expect(parseDailyBudget("2.5")).toBe(2_500_000);
    expect(parseDailyBudget("0.1")).toBe(100_000);
    // Zero turns the AI features off.
    expect(parseDailyBudget("0")).toBe(0);
  });

  it("refuses a value that isn't a number of dollars", () => {
    expect(() => parseDailyBudget("ten")).toThrow(/DAILY_BUDGET_USD/);
    expect(() => parseDailyBudget("$10")).toThrow(/DAILY_BUDGET_USD/);
    expect(() => parseDailyBudget("-1")).toThrow(/DAILY_BUDGET_USD/);
    expect(() => parseDailyBudget("Infinity")).toThrow(/DAILY_BUDGET_USD/);
  });
});

describe("budgetDay", () => {
  it("runs from midnight UTC to the next", () => {
    const { start, resetsAt } = budgetDay(new Date("2026-11-11T17:42:05.123Z"));
    expect(start.toISOString()).toBe("2026-11-11T00:00:00.000Z");
    expect(resetsAt.toISOString()).toBe("2026-11-12T00:00:00.000Z");
  });

  it("starts a new day at midnight exactly", () => {
    const { start } = budgetDay(new Date("2026-11-12T00:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-11-12T00:00:00.000Z");
  });

  it("crosses months and years", () => {
    expect(
      budgetDay(new Date("2026-02-28T23:59:59.999Z")).resetsAt.toISOString(),
    ).toBe("2026-03-01T00:00:00.000Z");
    expect(
      budgetDay(new Date("2026-12-31T12:00:00.000Z")).resetsAt.toISOString(),
    ).toBe("2027-01-01T00:00:00.000Z");
  });
});
