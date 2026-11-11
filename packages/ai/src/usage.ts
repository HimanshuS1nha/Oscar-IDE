import type { ChatMiddleware } from "@tanstack/ai";

/** The tokens one model call used. Output includes reasoning tokens. */
export type ModelCallUsage = {
  promptTokens: number;
  completionTokens: number;
};

/**
 * `chat()` middleware that reports the tokens of every model call in a run:
 * one call per step when the model uses tools, each sending the whole
 * conversation again. A call that fails after the provider answered is
 * reported too, since it's still billed.
 */
export const withUsage = (
  record: (usage: ModelCallUsage) => void | Promise<void>,
): ChatMiddleware => ({
  name: "usage",
  onUsage: (_ctx, usage) =>
    record({
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    }),
});
