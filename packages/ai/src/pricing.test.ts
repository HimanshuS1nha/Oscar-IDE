import { describe, expect, it } from "vitest";

import { AI_MODELS } from "./models";
import {
  AI_MODEL_PRICES,
  formatMicroUsd,
  modelPrice,
  usageCostMicroUsd,
} from "./pricing";
import { AI_PROVIDERS } from "./providers";

describe("modelPrice", () => {
  it("has a price above zero for every chat model offered", () => {
    for (const { id: provider } of AI_PROVIDERS) {
      for (const model of AI_MODELS[provider]) {
        const price = modelPrice(provider, model);
        expect(price, `${provider}/${model}`).toBeDefined();
        expect(price!.input).toBeGreaterThan(0);
        expect(price!.output).toBeGreaterThan(0);
      }
    }
  });

  it("knows no model outside the table", () => {
    expect(modelPrice("openai", "not-a-model")).toBeUndefined();
    // A model of another provider.
    expect(modelPrice("gemini", "claude-sonnet-5-5")).toBeUndefined();
  });

  it("lists no model the server doesn't offer", () => {
    for (const { id: provider } of AI_PROVIDERS) {
      const offered: ReadonlyArray<string> = AI_MODELS[provider];
      for (const model of Object.keys(AI_MODEL_PRICES[provider])) {
        expect(offered, `${provider}/${model}`).toContain(model);
      }
    }
  });
});

describe("usageCostMicroUsd", () => {
  const price = { input: 3, output: 15 };

  it("charges input and output at their own prices", () => {
    // A million of each: $3 + $15.
    expect(
      usageCostMicroUsd(price, {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      }),
    ).toBe(18_000_000);
    expect(
      usageCostMicroUsd(price, { promptTokens: 1000, completionTokens: 0 }),
    ).toBe(3000);
    expect(
      usageCostMicroUsd(price, { promptTokens: 0, completionTokens: 1000 }),
    ).toBe(15_000);
  });

  it("is exact for fractional prices", () => {
    // 1000 × 0.1 is 100.00000000000001 in floating point.
    expect(
      usageCostMicroUsd(
        { input: 0.1, output: 0.4 },
        { promptTokens: 1000, completionTokens: 1000 },
      ),
    ).toBe(500);
  });

  it("rounds a fraction of a micro-dollar up", () => {
    expect(
      usageCostMicroUsd(
        { input: 0.05, output: 0.4 },
        { promptTokens: 1, completionTokens: 0 },
      ),
    ).toBe(1);
  });

  it("costs nothing for no tokens", () => {
    expect(
      usageCostMicroUsd(price, { promptTokens: 0, completionTokens: 0 }),
    ).toBe(0);
  });
});

describe("formatMicroUsd", () => {
  it("shows dollars and cents", () => {
    expect(formatMicroUsd(0)).toBe("$0.00");
    expect(formatMicroUsd(3_420_000)).toBe("$3.42");
    expect(formatMicroUsd(10_000_000)).toBe("$10.00");
    expect(formatMicroUsd(1_234_567_890)).toBe("$1,234.57");
  });

  it("doesn't round a little spending down to nothing", () => {
    expect(formatMicroUsd(1)).toBe("<$0.01");
    expect(formatMicroUsd(9_999)).toBe("<$0.01");
    expect(formatMicroUsd(10_000)).toBe("$0.01");
  });
});
