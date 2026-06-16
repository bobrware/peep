import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, NoObjectGeneratedError, Output, type FlexibleSchema } from "ai";
import type { LlmPort } from "../../ports/llm.js";

export type AiSdkProviderConfig = {
  provider: "openrouter";
  apiKey: string;
  model: string;
  timeoutMs?: number;
};

export function createLlmPort<TObject = unknown, TSchema extends FlexibleSchema = FlexibleSchema>({
  provider,
  apiKey,
  model,
  timeoutMs = 60_000,
}: AiSdkProviderConfig): LlmPort<TObject, TSchema> {
  const openrouter = createOpenAICompatible({
    name: provider,
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://github.com/bobrware/peep",
      "X-Title": "Peep",
    },
  });

  return {
    async generateObject({ schema, prompt }) {
      const promptWithJsonInstruction = `${prompt}\n\nReturn valid JSON only. Do not include markdown fences, prose, or explanations.`;

      try {
        const result = await generateText({
          model: openrouter(model),
          maxRetries: 0,
          output: Output.json(),
          prompt: promptWithJsonInstruction,
          timeout: timeoutMs,
        });

        return parseSchemaObject(schema, result.output) as TObject;
      } catch (error) {
        if (!NoObjectGeneratedError.isInstance(error)) {
          throw error;
        }

        if (error.text === undefined) {
          throw error;
        }

        const json = JSON.parse(stripMarkdownFence(error.text));

        return parseSchemaObject(schema, json) as TObject;
      }
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

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);

  return match?.[1] ?? trimmed;
}
