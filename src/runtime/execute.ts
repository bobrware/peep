import { createLlmPort } from "../adapters/ai-sdk/provider.js";
import {
  createGitHubPullRequestAdapter,
  type CreateGitHubPullRequestAdapterOptions,
  type GitHubPullRequestAdapter,
} from "../adapters/github/api.js";
import type { GitHubWebhookEvent } from "../adapters/github/webhook.js";
import { reviewPullRequest } from "../core/pipeline.js";
import { findingSchema, type Finding } from "../core/schema.js";
import type { FlexibleSchema } from "ai";
import type { LlmPort } from "../ports/llm.js";
import type { PeepConfig } from "../ports/config.js";

export type ExecuteWebhookEventOptions = {
  config: PeepConfig;
  event: GitHubWebhookEvent;
  createPullRequestAdapter?: (
    options: CreateGitHubPullRequestAdapterOptions,
  ) => Promise<GitHubPullRequestAdapter>;
  createLlm?: (config: PeepConfig["llm"]) => LlmPort<Finding[], FlexibleSchema>;
};

export async function executeWebhookEvent({
  config,
  event,
  createPullRequestAdapter = createGitHubPullRequestAdapter,
  createLlm = createDefaultLlm,
}: ExecuteWebhookEventOptions): Promise<void> {
  const handler = config.on[event.type];

  if (handler === undefined) {
    return;
  }

  const pr = await createPullRequestAdapter({
    appId: config.github.appId,
    privateKey: config.github.privateKey,
    installationId: event.installationId,
    owner: event.repository.owner,
    repo: event.repository.name,
    pullNumber: event.pullRequest.number,
  });
  const llm = createLlm(config.llm);

  await handler({
    pr,
    agent: {
      async review({ schema = findingSchema.array() } = {}) {
        return reviewPullRequest({
          vcs: pr,
          llm,
          rules: config.rules,
          schema,
        });
      },
    },
  });
}

function createDefaultLlm(config: PeepConfig["llm"]): LlmPort<Finding[], FlexibleSchema> {
  return createLlmPort<Finding[]>(config);
}
