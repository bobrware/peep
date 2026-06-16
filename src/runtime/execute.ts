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
    draft: event.pullRequest.draft,
    logger,
  });
  const llm = createLoggedLlm(createLlm(config.llm), config.llm, logger);

  await handler({
    pr,
    agent: {
      async review<TFinding extends ReviewFinding = Finding>(options?: ReviewOptions) {
        const schema = options?.schema ?? findingSchema.array();
        logger.info("starting agent review");
        const findings = await reviewPullRequest({
          vcs: createLoggedVcs(pr, logger),
          llm,
          rules: config.rules,
          schema,
        });
        logger.info(
          { findings: Array.isArray(findings) ? findings.length : undefined },
          "agent review completed",
        );

        return findings as TFinding[];
      },
    },
  });

  logger.info({ event: event.type }, "webhook handler completed");
}

function createDefaultLlm(config: PeepConfig["llm"]): LlmPort<Finding[], FlexibleSchema> {
  return createLlmPort<Finding[]>(config);
}

function createLoggedVcs(
  vcs: GitHubPullRequestAdapter,
  logger: PeepLogger,
): GitHubPullRequestAdapter {
  return {
    ...vcs,
    async fetchPullRequestDiff() {
      const startedAt = Date.now();

      logger.info("fetching pull request diff for review");

      try {
        const diff = await vcs.fetchPullRequestDiff();

        logger.info(
          { durationMs: Date.now() - startedAt, bytes: Buffer.byteLength(diff) },
          "fetched pull request diff for review",
        );

        return diff;
      } catch (error) {
        logger.error(
          { error, durationMs: Date.now() - startedAt },
          "failed to fetch pull request diff",
        );
        throw error;
      }
    },
  };
}

function createLoggedLlm<TObject, TSchema>(
  llm: LlmPort<TObject, TSchema>,
  config: PeepConfig["llm"],
  logger: PeepLogger,
): LlmPort<TObject, TSchema> {
  return {
    async generateObject(options) {
      const startedAt = Date.now();

      logger.info(
        {
          provider: config.provider,
          model: config.model,
          promptChars: options.prompt.length,
          timeoutMs: config.timeoutMs ?? 60_000,
        },
        "calling llm for structured review",
      );

      try {
        const result = await llm.generateObject(options);

        logger.info(
          {
            durationMs: Date.now() - startedAt,
            provider: config.provider,
            model: config.model,
            objects: Array.isArray(result) ? result.length : undefined,
          },
          "llm structured review completed",
        );

        return result;
      } catch (error) {
        logger.error(
          {
            error,
            durationMs: Date.now() - startedAt,
            provider: config.provider,
            model: config.model,
          },
          "llm structured review failed",
        );
        throw error;
      }
    },
  };
}
