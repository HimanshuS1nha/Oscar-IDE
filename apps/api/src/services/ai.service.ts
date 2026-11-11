import { randomUUID } from "node:crypto";

import { ResultAsync } from "neverthrow";

import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
  type AnyTextAdapter,
  type StreamChunk,
} from "@oscar/ai";
import { anthropicText } from "@oscar/ai/anthropic";
import { geminiText } from "@oscar/ai/gemini";
import { AI_MODELS, type AiModel } from "@oscar/ai/models";
import { openaiText } from "@oscar/ai/openai";
import type { AiProviderId } from "@oscar/ai/providers";
import { reconstructChat, withPersistence } from "@oscar/ai/persistence";
import { CLIENT_TOOLS, withoutApproval } from "@oscar/ai/tools";
import { ConversationDal } from "@oscar/dal";

import { chatPersistence } from "../lib/chat-persistence";
import { logger } from "../lib/logger";

import { OscarError } from "../errors/oscar.error";

import { ErrorType } from "../enums/error.enum";

import {
  CHAT_ACCESS_MODE_PROMPTS,
  CHAT_SYSTEM_PROMPT,
  COMMIT_MESSAGE_MAX_TOKENS,
  COMMIT_MESSAGE_SYSTEM_PROMPT,
  COMPLETION_CURSOR,
  COMPLETION_MAX_TOKENS,
  COMPLETION_SYSTEM_PROMPT,
} from "../constants/ai";

import { cleanCommitMessage } from "../helpers/clean-commit-message";
import { cleanCompletion } from "../helpers/clean-completion";

import { SERVER_TOOLS } from "../tools";

import { AiUsageService } from "./ai-usage.service";

import type {
  AiChatRequestType,
  AiCommitMessageRequestType,
  AiCommitMessageResponseType,
  AiCompletionRequestType,
  AiCompletionResponseType,
} from "@oscar/validators";
import type { AuthUser } from "../middlewares/auth.middleware";

const databaseError = (error: unknown) =>
  new OscarError(ErrorType.DATABASE_ERROR, `Database error: ${String(error)}`, {
    cause: error,
  });

/**
 * The provider's text adapter for `model`. Each reads its API key from the
 * environment: OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY.
 */
const createAdapter = (
  provider: AiProviderId,
  model: string,
): AnyTextAdapter => {
  const models: ReadonlyArray<string> = AI_MODELS[provider];
  if (!models.includes(model)) {
    throw new OscarError(
      ErrorType.BAD_REQUEST,
      `"${model}" isn't one of the ${provider} models this server supports`,
    );
  }

  try {
    switch (provider) {
      case "openai":
        return openaiText(model as AiModel<"openai">);
      case "anthropic":
        return anthropicText(model as AiModel<"anthropic">);
      case "gemini":
        return geminiText(model as AiModel<"gemini">);
    }
  } catch (error) {
    // A missing API key fails here, before any request is made.
    throw new OscarError(
      ErrorType.GENERIC_ERROR,
      `Couldn't create the ${provider} adapter: ${String(error)}`,
      { cause: error },
    );
  }
};

/** Caps the answer's length, in each provider's own option. */
const maxTokensOption = (provider: AiProviderId, maxTokens: number) => {
  switch (provider) {
    case "openai":
      return { max_output_tokens: maxTokens };
    case "anthropic":
      return { max_tokens: maxTokens };
    case "gemini":
      return { maxOutputTokens: maxTokens };
  }
};

/** Passes the stream through, logging the errors it reports to the client. */
async function* logRunErrors(
  stream: AsyncIterable<StreamChunk>,
  context: Record<string, unknown>,
) {
  for await (const chunk of stream) {
    if (chunk.type === "RUN_ERROR")
      logger.error({ ...context, chunk }, "AI run failed");
    yield chunk;
  }
}

export class AiService {
  /**
   * Makes sure the conversation is the user's, creating it on its first
   * message. Another user's conversation is reported as not found.
   */
  static async ensureConversation({
    id,
    userId,
  }: {
    id: string;
    userId: string;
  }) {
    const existing = await ResultAsync.fromPromise(
      ConversationDal.getById({ id }),
      databaseError,
    );
    if (existing.isErr()) throw existing.error;

    let conversation = existing.value;
    if (!conversation) {
      const created = await ResultAsync.fromPromise(
        ConversationDal.createIfMissing({ id, userId }).then(() =>
          ConversationDal.getById({ id }),
        ),
        databaseError,
      );
      if (created.isErr()) throw created.error;
      conversation = created.value;
    }

    if (conversation?.userId !== userId) {
      throw new OscarError(
        ErrorType.NOT_FOUND,
        `Conversation ${id} doesn't belong to user ${userId}`,
        undefined,
        "Conversation",
      );
    }
    return conversation;
  }

  /**
   * Answers the conversation's messages with the chosen model, as a Server-
   * Sent Events response in TanStack AI's format. Every tool is offered.
   * Refused once the user has spent today's AI budget.
   * Those that act on the user's files are declared without an
   * implementation: the model's calls to them are streamed to the app, which
   * runs them (after the user approves, where needed) and sends the results
   * back in its next request. The web tools run here (see `../tools`).
   *
   * In full access mode the app's tools are offered without their approval
   * step, so the run never pauses to ask; the app runs them straight away.
   */
  static async chat({
    user,
    request,
    body,
    signal,
  }: {
    user: AuthUser;
    request: AiChatRequestType;
    /** The whole request body: an AG-UI `RunAgentInput`. */
    body: unknown;
    /** Aborts when the client disconnects. */
    signal: AbortSignal;
  }) {
    const params = await ResultAsync.fromPromise(
      chatParamsFromRequestBody(body),
      (error) =>
        new OscarError(
          ErrorType.BAD_REQUEST,
          error instanceof Error ? error.message : String(error),
          { cause: error },
        ),
    );
    if (params.isErr()) throw params.error;

    const { provider, model, accessMode } = request.forwardedProps;
    const adapter = createAdapter(provider, model);
    const usageTracker = AiUsageService.tracker({
      userId: user.id,
      feature: "chat",
      provider,
      model,
    });
    await AiUsageService.assertWithinBudget(user.id);
    await AiService.ensureConversation({
      id: request.threadId,
      userId: user.id,
    });

    // Stop asking the provider once nobody is listening.
    const abortController = new AbortController();
    signal.addEventListener("abort", () => abortController.abort(), {
      once: true,
    });

    const stream = chat({
      adapter,
      messages: params.value.messages,
      systemPrompts: [CHAT_SYSTEM_PROMPT, CHAT_ACCESS_MODE_PROMPTS[accessMode]],
      // Client tools have no implementation here: their calls go to the app.
      tools: [
        ...(accessMode === "full-access"
          ? CLIENT_TOOLS.map(withoutApproval)
          : CLIENT_TOOLS),
        ...SERVER_TOOLS,
      ],
      threadId: request.threadId,
      runId: params.value.runId,
      // Set when the app answers an approval: the run picks up where it paused.
      parentRunId: params.value.parentRunId,
      resume: params.value.resume,
      abortController,
      // Saves the transcript when the run starts, pauses for an approval and
      // ends. The app's messages win over the saved ones with the same id.
      // Saves the cost of each model call, one per step of the run.
      middleware: [withPersistence(chatPersistence), usageTracker],
    });

    return toServerSentEventsResponse(
      logRunErrors(stream, {
        userId: user.id,
        conversationId: request.threadId,
        provider,
        model,
        accessMode,
      }),
      { abortController },
    );
  }

  /**
   * A saved conversation, in the shape `useChat` hydrates from: its messages,
   * ready to show. A conversation that doesn't exist yet comes back empty.
   */
  static async history({
    user,
    threadId,
    request,
  }: {
    user: AuthUser;
    threadId: string;
    /** Read for its `?threadId=`. */
    request: Request;
  }) {
    const existing = await ResultAsync.fromPromise(
      ConversationDal.getById({ id: threadId }),
      databaseError,
    );
    if (existing.isErr()) throw existing.error;
    if (existing.value && existing.value.userId !== user.id) {
      throw new OscarError(
        ErrorType.NOT_FOUND,
        `Conversation ${threadId} doesn't belong to user ${user.id}`,
        undefined,
        "Conversation",
      );
    }

    const response = await ResultAsync.fromPromise(
      reconstructChat(chatPersistence, request),
      databaseError,
    );
    if (response.isErr()) throw response.error;
    return response.value;
  }

  /**
   * An inline suggestion: the text the model would insert at the cursor,
   * given the code around it. Not saved, and offers no tools. Counts
   * toward the user's daily budget like the chat.
   */
  static async complete({
    user,
    request,
    signal,
  }: {
    user: AuthUser;
    request: AiCompletionRequestType;
    /** Aborts when the app gives up on the suggestion (the user kept typing). */
    signal: AbortSignal;
  }): Promise<AiCompletionResponseType> {
    const { provider, model, path, language, prefix, suffix } = request;
    const adapter = createAdapter(provider, model);
    const usageTracker = AiUsageService.tracker({
      userId: user.id,
      feature: "completion",
      provider,
      model,
    });
    await AiUsageService.assertWithinBudget(user.id);

    const abortController = new AbortController();
    signal.addEventListener("abort", () => abortController.abort(), {
      once: true,
    });

    const content = [
      `File: ${path || "untitled"}`,
      `Language: ${language || "plain text"}`,
      "",
      "<file>",
      `${prefix}${COMPLETION_CURSOR}${suffix}`,
      "</file>",
    ].join("\n");

    const result = await ResultAsync.fromPromise(
      chat({
        adapter,
        messages: [{ role: "user", content }],
        systemPrompts: [COMPLETION_SYSTEM_PROMPT],
        threadId: randomUUID(),
        stream: false,
        // Speed matters more than depth here. Models that can't turn
        // thinking off use their lightest level.
        reasoning: "off",
        modelOptions: maxTokensOption(provider, COMPLETION_MAX_TOKENS),
        middleware: [usageTracker],
        abortController,
      }),
      (error) =>
        new OscarError(
          ErrorType.GENERIC_ERROR,
          `Inline completion failed: ${String(error)}`,
          { cause: error },
        ),
    );
    if (result.isErr()) {
      // The app gave up on it: nobody reads the answer, and it isn't an error.
      if (signal.aborted) return { completion: "" };
      throw result.error;
    }

    return {
      completion: cleanCompletion({ reply: result.value.text, prefix, suffix }),
    };
  }

  /**
   * A commit message for the changes about to be committed, in the style of
   * the repository's recent commits. Not saved, and offers no tools. Counts
   * toward the user's daily budget like the chat.
   */
  static async commitMessage({
    user,
    request,
    signal,
  }: {
    user: AuthUser;
    request: AiCommitMessageRequestType;
    /** Aborts when the app stops waiting. */
    signal: AbortSignal;
  }): Promise<AiCommitMessageResponseType> {
    const { provider, model, changes, recentCommits, branch } = request;
    const adapter = createAdapter(provider, model);
    const usageTracker = AiUsageService.tracker({
      userId: user.id,
      feature: "commit-message",
      provider,
      model,
    });
    await AiUsageService.assertWithinBudget(user.id);

    const abortController = new AbortController();
    signal.addEventListener("abort", () => abortController.abort(), {
      once: true,
    });

    const content = [
      ...(branch ? [`Branch: ${branch}`, ""] : []),
      ...(recentCommits.length > 0
        ? ["Recent commits:", ...recentCommits.map((subject) => `- ${subject}`), ""]
        : []),
      "<changes>",
      changes,
      "</changes>",
    ].join("\n");

    const result = await ResultAsync.fromPromise(
      chat({
        adapter,
        messages: [{ role: "user", content }],
        systemPrompts: [COMMIT_MESSAGE_SYSTEM_PROMPT],
        threadId: randomUUID(),
        stream: false,
        reasoning: "off",
        modelOptions: maxTokensOption(provider, COMMIT_MESSAGE_MAX_TOKENS),
        middleware: [usageTracker],
        abortController,
      }),
      (error) =>
        new OscarError(
          ErrorType.GENERIC_ERROR,
          `Commit message suggestion failed: ${String(error)}`,
          { cause: error },
        ),
    );
    if (result.isErr()) {
      if (signal.aborted) return { message: "" };
      throw result.error;
    }

    return { message: cleanCommitMessage(result.value.text) };
  }
}
