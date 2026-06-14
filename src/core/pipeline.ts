import type { LlmPort } from "../ports/llm.js";
import type { VcsPort } from "../ports/vcs.js";
import { buildReviewPrompt } from "./prompt.js";

export type ReviewPullRequestOptions<TObject, TSchema = unknown> = {
  vcs: VcsPort;
  llm: LlmPort<TObject, TSchema>;
  rules: string[];
  schema: TSchema;
};

export async function reviewPullRequest<TObject, TSchema = unknown>({
  vcs,
  llm,
  rules,
  schema,
}: ReviewPullRequestOptions<TObject, TSchema>): Promise<TObject> {
  const diff = await vcs.fetchPullRequestDiff();
  const prompt = buildReviewPrompt({ rules, diff });

  return llm.generateObject({ schema, prompt });
}
