import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, type FlexibleSchema } from "ai";
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
      const result = await generateText({
        model: openrouter(model),
        output: Output.json(),
        prompt: `${prompt}\n\nReturn valid JSON only. Do not include markdown fences, prose, or explanations.`,
      });

      return parseSchemaObject(schema, result.output) as TObject;
    },
  };
}

function parseSchemaObject(schema: FlexibleSchema, json: unknown): unknown {
  if ("parse" in schema && typeof schema.parse === "function") {
    return schema.parse(json);
  }

  return json;
}
