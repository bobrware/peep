import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject, type FlexibleSchema } from "ai";
import type { LlmPort } from "../../ports/llm.js";

export type AiSdkProviderConfig = {
  provider: "openrouter";
  apiKey: string;
  model: string;
};

export function createLlmPort<TObject = unknown, TSchema extends FlexibleSchema = FlexibleSchema>({
  provider,
  apiKey,
  model,
}: AiSdkProviderConfig): LlmPort<TObject, TSchema> {
  const openrouter = createOpenAICompatible({
    name: provider,
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });

  return {
    async generateObject({ schema, prompt }) {
      const result = await generateObject({
        model: openrouter(model),
        schema,
        prompt,
      });

      return result.object as TObject;
    },
  };
}
