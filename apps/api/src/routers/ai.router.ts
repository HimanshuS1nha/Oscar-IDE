import { Hono } from "hono";

import { AI_MODELS } from "@oscar/ai/models";
import { AI_PROVIDERS } from "@oscar/ai/providers";
import {
  aiChatHistoryRequestValidator,
  aiChatRequestValidator,
  aiCommitMessageRequestValidator,
  aiCompletionRequestValidator,
  type AiModelsResponseType,
  type AiUsageResponseType,
} from "@oscar/validators";

import { validator } from "../helpers/validator";

import { authMiddleware } from "../middlewares/auth.middleware";

import { AiService } from "../services/ai.service";
import { AiUsageService } from "../services/ai-usage.service";

const aiRouter = new Hono();

/** Public: the model list isn't secret, and the app shows it before sign-in. */
aiRouter.get("/models", (c) => {
  const response: AiModelsResponseType = {
    providers: AI_PROVIDERS.map(({ id, name }) => ({
      id,
      name,
      models: AI_MODELS[id].map((model) => ({ id: model })),
    })),
  };

  // Changes only with a deploy; let clients reuse it for an hour.
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(response, 200);
});

/**
 * Streams the AI's answer to a conversation. The body is what TanStack's
 * `useChat` sends with `fetchServerSentEvents` (an AG-UI `RunAgentInput`):
 * `threadId` is the conversation id, `messages` the whole conversation, and
 * `forwardedProps` holds `{ provider, model }` from `sendMessage`'s body.
 */
aiRouter.post(
  "/chat",
  authMiddleware,
  validator("json", aiChatRequestValidator),
  async (c) =>
    AiService.chat({
      user: c.get("user"),
      request: c.req.valid("json"),
      // The validated copy keeps only the fields above; TanStack parses the rest.
      body: await c.req.json(),
      signal: c.req.raw.signal,
    }),
);

/**
 * A saved conversation's messages, which `useChat` loads when it mounts: the
 * GET half of TanStack's server persistence, on the same URL as the chat.
 */
aiRouter.get(
  "/chat",
  authMiddleware,
  validator("query", aiChatHistoryRequestValidator),
  async (c) =>
    AiService.history({
      user: c.get("user"),
      threadId: c.req.valid("query").threadId,
      request: c.req.raw,
    }),
);

/** An inline code suggestion for the editor, from the code around the cursor. */
aiRouter.post(
  "/complete",
  authMiddleware,
  validator("json", aiCompletionRequestValidator),
  async (c) =>
    c.json(
      await AiService.complete({
        user: c.get("user"),
        request: c.req.valid("json"),
        signal: c.req.raw.signal,
      }),
      200,
    ),
);

/** A commit message for the changes the app is about to commit. */
aiRouter.post(
  "/commit-message",
  authMiddleware,
  validator("json", aiCommitMessageRequestValidator),
  async (c) =>
    c.json(
      await AiService.commitMessage({
        user: c.get("user"),
        request: c.req.valid("json"),
        signal: c.req.raw.signal,
      }),
      200,
    ),
);

/** What the user's AI calls cost today, against their daily budget. */
aiRouter.get("/usage", authMiddleware, async (c) => {
  const response: AiUsageResponseType = await AiUsageService.today(
    c.get("user").id,
  );
  return c.json(response, 200);
});

export { aiRouter };
