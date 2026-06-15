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
    try {
      return schema.parse(json);
    } catch (error) {
      const unwrappedJson = unwrapArrayContainer(json);

      if (unwrappedJson !== json) {
        return schema.parse(unwrappedJson);
      }

      throw error;
    }
  }

  return json;
}

function unwrapArrayContainer(json: unknown): unknown {
  if (!isRecord(json)) {
    return json;
  }

  for (const key of ["findings", "reviewFindings", "issues", "comments"]) {
    const value = json[key];

    if (Array.isArray(value)) {
      return value;
    }
  }

  return json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
