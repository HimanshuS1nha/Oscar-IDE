import z from "zod";

export const aiProviderIdValidator = z.enum(["openai", "anthropic", "gemini"]);

/** `GET /api/ai/models`: each provider's chat models, in display order. */
export const aiModelsResponseValidator = z.object({
  providers: z.array(
    z.object({
      id: aiProviderIdValidator,
      name: z.string(),
      models: z.array(z.object({ id: z.string() })),
    }),
  ),
});

export type AiModelsResponseType = z.infer<typeof aiModelsResponseValidator>;
export type AiProviderType = AiModelsResponseType["providers"][number];
