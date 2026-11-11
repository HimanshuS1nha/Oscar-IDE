/**
 * Provider-independent pieces: run an activity with an adapter from
 * `@oscar/ai/openai`, `@oscar/ai/anthropic` or `@oscar/ai/gemini`.
 */
export {
  chat,
  summarize,
  embed,
  generateImage,
  toolDefinition,
  maxIterations,
  streamToText,
  toServerSentEventsStream,
  toServerSentEventsResponse,
  chatParamsFromRequestBody,
  type TextAdapter,
  type AnyTextAdapter,
  type SummarizeAdapter,
  type EmbeddingAdapter,
  type ImageAdapter,
  type ToolDefinition,
  type UIMessage,
  type MessagePart,
  type TanStackMessageMetadata,
  type StreamChunk,
  type ModelMessage,
} from "@tanstack/ai";
