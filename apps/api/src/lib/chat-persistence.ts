import type { ModelMessage } from "@oscar/ai";
import {
  defineAIPersistence,
  type ChatTranscriptPersistence,
} from "@oscar/ai/persistence";
import { MessageDal } from "@oscar/dal";

const TITLE_LENGTH = 80;

/** The first line of the first thing the user said, to name the chat by. */
const titleFor = (messages: ReadonlyArray<ModelMessage>) => {
  const first = messages.find((message) => message.role === "user");
  if (!first) return undefined;

  const text =
    typeof first.content === "string"
      ? first.content
      : (first.content ?? [])
          .map((part) => (part.type === "text" ? part.content : ""))
          .join(" ");
  const line = text.trim().split("\n")[0]?.trim();
  if (!line) return undefined;
  return line.length > TITLE_LENGTH
    ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…`
    : line;
};

/**
 * Where TanStack AI saves each conversation's transcript: the `message` table,
 * keyed by conversation id. The chat route checks the conversation is the
 * user's before a run starts, so these only ever see the user's own threads.
 */
export const chatPersistence = defineAIPersistence<
  ChatTranscriptPersistence["stores"]
>({
  stores: {
    messages: {
      loadThread: (threadId: string) =>
        MessageDal.loadThread({ conversationId: threadId }),
      saveThread: (threadId, messages) =>
        MessageDal.replaceThread({
          conversationId: threadId,
          messages,
          title: titleFor(messages),
        }),
    },
  },
});
