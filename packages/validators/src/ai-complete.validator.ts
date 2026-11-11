import z from "zod";

import { aiProviderIdValidator } from "./ai-models.validator";

/** The most code the app sends from before and after the cursor. */
export const AI_COMPLETION_LIMITS = {
  prefixCharacters: 8000,
  suffixCharacters: 3000,
} as const;

/**
 * `POST /api/ai/complete`: an inline suggestion for the editor. `prefix` and
 * `suffix` are the code just before and after the cursor, not the whole file.
 */
export const aiCompletionRequestValidator = z.object({
  provider: aiProviderIdValidator,
  model: z.string("model is required").min(1, "model is required"),
  /** The file's path in the open folder, for the model's sake. */
  path: z.string().max(1024),
  /** Monaco's language id, such as "typescript". */
  language: z.string().max(100),
  prefix: z.string().max(AI_COMPLETION_LIMITS.prefixCharacters),
  suffix: z.string().max(AI_COMPLETION_LIMITS.suffixCharacters),
});

export type AiCompletionRequestType = z.infer<
  typeof aiCompletionRequestValidator
>;

export const aiCompletionResponseValidator = z.object({
  /** The text to insert at the cursor. Empty when there's no suggestion. */
  completion: z.string(),
});

export type AiCompletionResponseType = z.infer<
  typeof aiCompletionResponseValidator
>;
