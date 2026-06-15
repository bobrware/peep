import { createLlmPort } from "../adapters/ai-sdk/provider.js";
import {
  createGitHubPullRequestAdapter,
  type CreateGitHubPullRequestAdapterOptions,
  type GitHubPullRequestAdapter,
} from "../adapters/github/api.js";
import type { GitHubWebhookEvent } from "../adapters/github/webhook.js";
import { reviewPullRequest } from "../core/pipeline.js";
import { findingSchema, type Finding, type ReviewFinding } from "../core/schema.js";
import type { FlexibleSchema } from "ai";
import type { LlmPort } from "../ports/llm.js";
import type { PeepConfig, ReviewOptions } from "../ports/config.js";
import { logger as defaultLogger, type PeepLogger } from "./logger.js";

export type ExecuteWebhookEventOptions = {
  config: PeepConfig;
  event: GitHubWebhookEvent;
  createPullRequestAdapter?: (
    options: CreateGitHubPullRequestAdapterOptions,
  ) => Promise<GitHubPullRequestAdapter>;
  createLlm?: (config: PeepConfig["llm"]) => LlmPort<Finding[], FlexibleSchema>;
  logger?: PeepLogger;
};

export async function executeWebhookEvent({
  config,
  event,
  createPullRequestAdapter = createGitHubPullRequestAdapter,
  createLlm = createDefaultLlm,
  logger = defaultLogger,
}: ExecuteWebhookEventOptions): Promise<void> {
  const handler = config.on[event.type];

  if (handler === undefined) {
    logger.info({ event: event.type }, "no handler configured for event");
    return;
  }

  logger.info(
    {
      event: event.type,
      owner: event.repository.owner,
      repo: event.repository.name,
      pullNumber: event.pullRequest.number,
    },
    "executing webhook handler",
  );

  const pr = await createPullRequestAdapter({
    appId: config.github.appId,
    privateKey: config.github.privateKey,
    installationId: event.installationId,
    owner: event.repository.owner,
    repo: event.repository.name,
    pullNumber: event.pullRequest.number,
    title: event.pullRequest.title,
    body: event.pullRequest.body,
    author: event.pullRequest.author,
    logger,
  });
  const llm = createLlm(config.llm);

  await handler({
    pr,
    agent: {
      async review<TFinding extends ReviewFinding = Finding>(options?: ReviewOptions) {
        const schema = options?.schema ?? findingSchema.array();
        const findings = await reviewPullRequest({
          vcs: pr,
          llm,
          rules: config.rules,
          schema,
        });

        return findings as TFinding[];
      },
    },
  });

  logger.info({ event: event.type }, "webhook handler completed");
}

function createDefaultLlm(config: PeepConfig["llm"]): LlmPort<Finding[], FlexibleSchema> {
  return createLlmPort<Finding[]>(config);
}
