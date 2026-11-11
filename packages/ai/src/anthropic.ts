/** Anthropic adapters. Reads ANTHROPIC_API_KEY unless the `create*` variants are given a key. */
export {
  anthropicText,
  createAnthropicChat,
  anthropicSummarize,
  createAnthropicSummarize,
  ANTHROPIC_MODELS,
  type AnthropicChatModel,
  type AnthropicTextConfig,
} from "@tanstack/ai-anthropic";
