/**
 * The chat models each provider's adapter supports, for model pickers.
 * Loads all three provider packages: import it only where that's fine (the API).
 */
import { ANTHROPIC_MODELS } from "@tanstack/ai-anthropic";
import { GEMINI_MODELS } from "@tanstack/ai-gemini";
import { OPENAI_CHAT_MODELS } from "@tanstack/ai-openai";

import type { AiProviderId } from "./providers";

export const AI_MODELS = {
  openai: OPENAI_CHAT_MODELS,
  anthropic: ANTHROPIC_MODELS,
  gemini: GEMINI_MODELS,
} as const satisfies Record<AiProviderId, ReadonlyArray<string>>;

/** A model id of `provider`, e.g. `AiModel<"anthropic">`. */
export type AiModel<P extends AiProviderId = AiProviderId> =
  (typeof AI_MODELS)[P][number];
