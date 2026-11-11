/** The providers Oscar can talk to, in the order pickers show them. */
export const AI_PROVIDERS = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "gemini", name: "Gemini" },
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"];
