/**
 * What each chat model costs, for counting each user's daily AI budget.
 * Prices are US dollars per million tokens, at the providers' standard rates.
 * Cached-input discounts are left out, so the count errs on the high side.
 *
 * Taken from the `pricing` in TanStack's model metadata, which the adapter
 * packages don't export. The table is typed against `AI_MODELS`, so a package
 * update that adds a model fails the typecheck here until it has a price.
 */
import type { AiModel } from "./models";
import type { AiProviderId } from "./providers";

export type ModelPrice = {
  /** Dollars per million input (prompt) tokens. */
  input: number;
  /** Dollars per million output tokens, reasoning included. */
  output: number;
};

export const AI_MODEL_PRICES: {
  [P in AiProviderId]: Record<AiModel<P>, ModelPrice>;
} = {
  openai: {
    "gpt-6.1-terra": { input: 1, output: 5 },
    "gpt-6.1-terra-pro": { input: 1, output: 5 },
    "gpt-6.1-sol": { input: 2, output: 10 },
    "gpt-6.1-sol-pro": { input: 2, output: 10 },
    "gpt-6-luna": { input: 0.1, output: 0.5 },
    "gpt-6-luna-pro": { input: 0.1, output: 0.5 },
    "gpt-6-sol": { input: 2, output: 10 },
    "gpt-6-sol-pro": { input: 2, output: 10 },
    "gpt-6-astra": { input: 10, output: 50 },
    "gpt-6-astra-pro": { input: 10, output: 50 },
    "gpt-5.6-luna-pro": { input: 0.2, output: 1.2 },
    "gpt-5.6-sol-pro": { input: 2.5, output: 15 },
    "gpt-5.6-terra-pro": { input: 2, output: 12 },
    "gpt-5.2": { input: 1.75, output: 14 },
    "gpt-5.2-pro": { input: 21, output: 168 },
    "gpt-5.2-chat-latest": { input: 1.75, output: 14 },
    "gpt-5.1": { input: 1.25, output: 10 },
    "gpt-5.1-codex": { input: 1.25, output: 10 },
    "gpt-5": { input: 1.25, output: 10 },
    "gpt-5-mini": { input: 0.25, output: 2 },
    "gpt-5-nano": { input: 0.05, output: 0.4 },
    "gpt-5-pro": { input: 15, output: 120 },
    "gpt-5-codex": { input: 1.25, output: 10 },
    o3: { input: 2, output: 8 },
    "o3-pro": { input: 20, output: 80 },
    "o3-mini": { input: 1.1, output: 4.4 },
    "o4-mini": { input: 1.1, output: 4.4 },
    "o3-deep-research": { input: 10, output: 40 },
    "o4-mini-deep-research": { input: 2, output: 8 },
    "gpt-4.1": { input: 2, output: 8 },
    "gpt-4.1-mini": { input: 0.4, output: 1.6 },
    "gpt-4.1-nano": { input: 0.1, output: 0.4 },
    "gpt-4": { input: 30, output: 60 },
    "gpt-4-turbo": { input: 10, output: 30 },
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
    "gpt-audio": { input: 2.5, output: 10 },
    "gpt-audio-mini": { input: 0.6, output: 2.4 },
    "gpt-5.1-chat-latest": { input: 1.25, output: 10 },
    "gpt-5-chat-latest": { input: 1.25, output: 10 },
    "gpt-5.1-codex-mini": { input: 0.25, output: 2 },
    "gpt-4o-search-preview": { input: 2.5, output: 10 },
    "gpt-4o-mini-search-preview": { input: 0.15, output: 0.6 },
    o1: { input: 15, output: 60 },
    "o1-pro": { input: 150, output: 600 },
    "gpt-5.6-sol": { input: 5, output: 30 },
    "gpt-5.6-terra": { input: 2, output: 12 },
    "gpt-5.6-luna": { input: 0.2, output: 1.2 },
    "gpt-5.5": { input: 5, output: 30 },
    "gpt-5.5-pro": { input: 30, output: 180 },
    "gpt-5.4-mini": { input: 0.75, output: 4.5 },
    "gpt-5.4-nano": { input: 0.2, output: 1.25 },
    "gpt-5.4-image-2": { input: 8, output: 15 },
    "gpt-chat-latest": { input: 5, output: 30 },
  },
  anthropic: {
    "claude-haiku-5-5": { input: 0.1, output: 0.5 },
    "claude-sonnet-5-5": { input: 2, output: 10 },
    "claude-opus-5-5": { input: 4, output: 20 },
    "claude-fable-5-1": { input: 10, output: 50 },
    "claude-opus-5": { input: 5, output: 25 },
    "claude-opus-4-6": { input: 5, output: 25 },
    "claude-opus-4-5": { input: 15, output: 75 },
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-sonnet-4-5": { input: 3, output: 15 },
    "claude-haiku-4-5": { input: 1, output: 5 },
    "claude-opus-4-7": { input: 5, output: 25 },
    "claude-opus-4-8": { input: 5, output: 25 },
    "claude-fable-5": { input: 10, output: 50 },
    "claude-sonnet-5": { input: 2, output: 10 },
  },
  gemini: {
    "gemini-4-argon": { input: 2, output: 10 },
    "gemini-3.8-flash": { input: 0.75, output: 3.75 },
    "gemini-3.7-flash": { input: 0.75, output: 3.75 },
    "gemini-3.6-flash": { input: 1.5, output: 7.5 },
    "gemini-3.5-flash": { input: 1.5, output: 9 },
    "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
    "gemini-3.1-pro-preview": { input: 2.5, output: 15 },
    "gemini-3-flash-preview": { input: 0.5, output: 3 },
    "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
    "gemini-3.1-flash-lite-preview": { input: 0.25, output: 1.5 },
    "gemini-2.5-pro": { input: 2.5, output: 15 },
    "gemini-2.5-flash": { input: 1, output: 2.5 },
    "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  },
};

/** The model's price, or undefined for a model the table doesn't know. */
export const modelPrice = (
  provider: AiProviderId,
  model: string,
): ModelPrice | undefined =>
  (AI_MODEL_PRICES[provider] as Record<string, ModelPrice | undefined>)[model];

/**
 * What a model call cost, in micro-dollars (millionths of a dollar), rounded
 * up. Dollars per million tokens are micro-dollars per token; prices go to
 * thousandths in integers first so the sum is exact.
 */
export const usageCostMicroUsd = (
  price: ModelPrice,
  usage: { promptTokens: number; completionTokens: number },
) => {
  const nanoUsd =
    usage.promptTokens * Math.round(price.input * 1000) +
    usage.completionTokens * Math.round(price.output * 1000);
  return Math.ceil(nanoUsd / 1000);
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Micro-dollars as dollars and cents, such as "$3.42". Under a cent shows as "<$0.01". */
export const formatMicroUsd = (microUsd: number) =>
  microUsd > 0 && microUsd < 10_000 ? "<$0.01" : usd.format(microUsd / 1e6);
