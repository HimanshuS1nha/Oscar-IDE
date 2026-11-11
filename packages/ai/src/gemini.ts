/** Google Gemini adapters. Reads GOOGLE_API_KEY or GEMINI_API_KEY unless the `create*` variants are given a key. */
export {
  geminiText,
  createGeminiChat,
  geminiSummarize,
  createGeminiSummarize,
  geminiEmbedding,
  createGeminiEmbedding,
  geminiImage,
  createGeminiImage,
  GEMINI_MODELS,
  type GeminiTextModel,
  type GeminiTextConfig,
  type GeminiClientConfig,
} from "@tanstack/ai-gemini";
