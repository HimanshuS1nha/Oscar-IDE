/**
 * Saving chats on the server: `withPersistence` is `chat()` middleware that
 * stores each conversation's transcript in the stores you give it.
 */
export {
  withPersistence,
  reconstructChat,
  defineAIPersistence,
  type ChatTranscriptPersistence,
  type MessageStore,
} from "@tanstack/ai-persistence";
