import z from "zod";

import { aiProviderIdValidator } from "./ai-models.validator";

/** The most the app sends about the changes being committed. */
export const AI_COMMIT_MESSAGE_LIMITS = {
  /** `git diff --stat` and the patch, cut to fit. */
  changesCharacters: 40_000,
  recentCommits: 15,
  recentCommitCharacters: 300,
} as const;

/**
 * `POST /api/ai/commit-message`: a commit message for the changes about to
 * be committed. `recentCommits` are the subjects of the last few commits, so
 * the suggestion can follow the repository's style.
 */
export const aiCommitMessageRequestValidator = z.object({
  provider: aiProviderIdValidator,
  model: z.string("model is required").min(1, "model is required"),
  /** The diffstat, then the patch (possibly cut short), then any new untracked files. */
  changes: z
    .string()
    .min(1, "There are no changes to describe")
    .max(AI_COMMIT_MESSAGE_LIMITS.changesCharacters),
  recentCommits: z
    .array(z.string().max(AI_COMMIT_MESSAGE_LIMITS.recentCommitCharacters))
    .max(AI_COMMIT_MESSAGE_LIMITS.recentCommits),
  branch: z.string().max(255).nullable(),
});

export type AiCommitMessageRequestType = z.infer<
  typeof aiCommitMessageRequestValidator
>;

export const aiCommitMessageResponseValidator = z.object({
  /** A subject line, optionally followed by a blank line and a body. */
  message: z.string(),
});

export type AiCommitMessageResponseType = z.infer<
  typeof aiCommitMessageResponseValidator
>;
