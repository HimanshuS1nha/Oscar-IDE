/** OpenAI adapters. Reads OPENAI_API_KEY unless the `create*` variants are given a key. */
export {
  openaiText,
  createOpenaiChat,
  openaiSummarize,
  createOpenaiSummarize,
  openaiEmbedding,
  createOpenaiEmbedding,
  openaiImage,
  createOpenaiImage,
  OPENAI_CHAT_MODELS,
  type OpenAIChatModel,
  type OpenAITextConfig,
  type OpenAIClientConfig,
} from "@tanstack/ai-openai";
