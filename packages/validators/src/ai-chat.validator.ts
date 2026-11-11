import z from "zod";

import { aiProviderIdValidator } from "./ai-models.validator";

/**
 * How the chat's tools that change files or run commands behave:
 * - `approval`: each call waits for the user to approve or deny it.
 * - `full-access`: they run straight away, without asking.
 */
export const aiAccessModeValidator = z.enum(["approval", "full-access"]);

export type AiAccessModeType = z.infer<typeof aiAccessModeValidator>;

/**
 * `POST /api/ai/chat`: the fields read from the AG-UI `RunAgentInput` body
 * that TanStack's `useChat` sends, besides the messages (which the server
 * parses with TanStack's own `chatParamsFromRequestBody`).
 */
export const aiChatRequestValidator = z.object({
  /** The conversation's id: `useChat`'s `threadId`. */
  threadId: z.uuid("threadId must be the conversation's id (a UUID)"),
  /** `sendMessage(text, { body })` arrives here. */
  forwardedProps: z.object(
    {
      provider: aiProviderIdValidator,
      model: z.string("model is required").min(1, "model is required"),
      /** Older apps don't send it: they always asked. */
      accessMode: aiAccessModeValidator.default("approval"),
    },
    "provider and model are required",
  ),
});

export type AiChatRequestType = z.infer<typeof aiChatRequestValidator>;

/**
 * `GET /api/ai/chat?threadId=…`: a saved conversation, which `useChat` loads
 * when it mounts (TanStack's server hydrate).
 */
export const aiChatHistoryRequestValidator = z.object({
  threadId: z.uuid("threadId must be the conversation's id (a UUID)"),
});

export type AiChatHistoryRequestType = z.infer<
  typeof aiChatHistoryRequestValidator
>;
