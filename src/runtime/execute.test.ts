import { describe, expect, it, vi } from "vitest";
import type { GitHubWebhookEvent } from "../adapters/github/webhook.js";
import type { PeepConfig } from "../ports/config.js";
import { findingSchema } from "../core/schema.js";
import { executeWebhookEvent } from "./execute.js";
import { z } from "zod";

const event: GitHubWebhookEvent = {
  type: "pull_request.opened",
  installationId: 123,
  repository: { owner: "bobrware", name: "peep" },
  pullRequest: { number: 42, title: "Add feature", body: "Body", author: "alice", draft: false },
};

describe("executeWebhookEvent", () => {
  it("builds the pull request context and runs the matching handler", async () => {
    const submitReview = vi.fn(async () => {});
    const createPullRequestAdapter = vi.fn(async () => ({
      owner: "bobrware",
      repo: "peep",
      number: 42,
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
      fetchDiff: vi.fn(async () => "diff --git a/file.ts b/file.ts"),
      comment: vi.fn(async () => {}),
      getReviewComment: vi.fn(async () => ({ id: 1, body: "comment" })),
      listReviewComments: vi.fn(async () => []),
      listReviewThreads: vi.fn(async () => []),
      fetchPullRequestDiff: vi.fn(async () => "diff --git a/file.ts b/file.ts"),
      react: vi.fn(async () => {}),
      replyToReviewComment: vi.fn(async () => ({ id: 1, body: "reply" })),
      resolveReviewThread: vi.fn(async () => {}),
      submitReviewComments: vi.fn(async () => {}),
      submitReview,
    }));
    const createLlm = vi.fn(() => ({
      generateObject: vi.fn(async () => [
        { path: "file.ts", line: 1, side: "RIGHT" as const, message: "Fix this" },
      ]),
    }));
    const handler = vi.fn(async ({ agent, pr }) => {
      const findings = await agent.review();
      await pr.submitReview(findings, { event: "COMMENT" });
    });
    const config: PeepConfig = {
      github: { appId: "app", privateKey: "key", webhookSecret: "secret" },
      llm: { provider: "openrouter", apiKey: "api-key", model: "model" },
      rules: ["No any types"],
      on: { "pull_request.opened": handler },
    };

    await executeWebhookEvent({ config, event, createPullRequestAdapter, createLlm });

    expect(createPullRequestAdapter).toHaveBeenCalledWith({
      appId: "app",
      privateKey: "key",
      installationId: 123,
      owner: "bobrware",
      repo: "peep",
      pullNumber: 42,
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
      logger: expect.anything(),
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        pr: expect.objectContaining({
          owner: "bobrware",
          repo: "peep",
          number: 42,
          title: "Add feature",
          body: "Body",
          author: "alice",
          draft: false,
        }),
      }),
    );
    expect(createLlm).toHaveBeenCalledWith(config.llm);
    expect(handler).toHaveBeenCalledOnce();
    expect(submitReview).toHaveBeenCalledWith(
      [{ path: "file.ts", line: 1, side: "RIGHT", message: "Fix this" }],
      { event: "COMMENT" },
    );
  });

  it("does nothing when no handler is configured", async () => {
    const createPullRequestAdapter = vi.fn();
    const config: PeepConfig = {
      github: { appId: "app", privateKey: "key", webhookSecret: "secret" },
      llm: { provider: "openrouter", apiKey: "api-key", model: "model" },
      rules: [],
      on: {},
    };

    await executeWebhookEvent({ config, event, createPullRequestAdapter });

    expect(createPullRequestAdapter).not.toHaveBeenCalled();
  });

  it("dispatches pull_request.ready_for_review handlers", async () => {
    const createPullRequestAdapter = vi.fn(async () => ({
      owner: "bobrware",
      repo: "peep",
      number: 42,
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
      fetchDiff: vi.fn(async () => "diff --git a/file.ts b/file.ts"),
      comment: vi.fn(async () => {}),
      getReviewComment: vi.fn(async () => ({ id: 1, body: "comment" })),
      listReviewComments: vi.fn(async () => []),
      listReviewThreads: vi.fn(async () => []),
      fetchPullRequestDiff: vi.fn(async () => "diff --git a/file.ts b/file.ts"),
      react: vi.fn(async () => {}),
      replyToReviewComment: vi.fn(async () => ({ id: 1, body: "reply" })),
      resolveReviewThread: vi.fn(async () => {}),
      submitReviewComments: vi.fn(async () => {}),
      submitReview: vi.fn(async () => {}),
    }));
    const handler = vi.fn(async () => {});
    const config: PeepConfig = {
      github: { appId: "app", privateKey: "key", webhookSecret: "secret" },
      llm: { provider: "openrouter", apiKey: "api-key", model: "model" },
      rules: [],
      on: { "pull_request.ready_for_review": handler },
    };

    await executeWebhookEvent({
      config,
      event: { ...event, type: "pull_request.ready_for_review" },
      createPullRequestAdapter,
    });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("dispatches pull_request.synchronize handlers", async () => {
    const createPullRequestAdapter = vi.fn(async () => ({
      owner: "bobrware",
      repo: "peep",
      number: 42,
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
      fetchDiff: vi.fn(async () => "diff --git a/file.ts b/file.ts"),
      comment: vi.fn(async () => {}),
      getReviewComment: vi.fn(async () => ({ id: 1, body: "comment" })),
      listReviewComments: vi.fn(async () => []),
      listReviewThreads: vi.fn(async () => []),
      fetchPullRequestDiff: vi.fn(async () => "diff --git a/file.ts b/file.ts"),
      react: vi.fn(async () => {}),
      replyToReviewComment: vi.fn(async () => ({ id: 1, body: "reply" })),
      resolveReviewThread: vi.fn(async () => {}),
      submitReviewComments: vi.fn(async () => {}),
      submitReview: vi.fn(async () => {}),
    }));
    const handler = vi.fn(async () => {});
    const config: PeepConfig = {
      github: { appId: "app", privateKey: "key", webhookSecret: "secret" },
      llm: { provider: "openrouter", apiKey: "api-key", model: "model" },
      rules: [],
      on: { "pull_request.synchronize": handler },
    };

    await executeWebhookEvent({
      config,
      event: { ...event, type: "pull_request.synchronize" },
      createPullRequestAdapter,
    });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("dispatches pull_request_review_comment.created handlers with comment context", async () => {
    const createPullRequestAdapter = vi.fn(async () => ({
      owner: "bobrware",
      repo: "peep",
      number: 42,
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
      fetchDiff: vi.fn(async () => "diff --git a/file.ts b/file.ts"),
      comment: vi.fn(async () => {}),
      getReviewComment: vi.fn(async () => ({ id: 1, body: "comment" })),
      listReviewComments: vi.fn(async () => []),
      listReviewThreads: vi.fn(async () => []),
      fetchPullRequestDiff: vi.fn(async () => "diff --git a/file.ts b/file.ts"),
      react: vi.fn(async () => {}),
      replyToReviewComment: vi.fn(async () => ({ id: 1, body: "reply" })),
      resolveReviewThread: vi.fn(async () => {}),
      submitReviewComments: vi.fn(async () => {}),
      submitReview: vi.fn(async () => {}),
    }));
    const handler = vi.fn(async () => {});
    const config: PeepConfig = {
      github: { appId: "app", privateKey: "key", webhookSecret: "secret" },
      llm: { provider: "openrouter", apiKey: "api-key", model: "model" },
      rules: [],
      on: { "pull_request_review_comment.created": handler },
    };

    await executeWebhookEvent({
      config,
      event: {
        ...event,
        type: "pull_request_review_comment.created",
        comment: { id: 123, body: "This is invalid", author: "bob", inReplyToId: 99 },
      },
      createPullRequestAdapter,
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        comment: { id: 123, body: "This is invalid", author: "bob", inReplyToId: 99 },
      }),
    );
  });

  it("allows configs to use finding schemas with custom fields", async () => {
    const pepperFindingSchema = findingSchema.extend({
      severity: z.enum(["bell", "ghost"]),
    });
    type PepperFinding = z.infer<typeof pepperFindingSchema>;
    const submitReview = vi.fn(async () => {});
    const createPullRequestAdapter = vi.fn(async () => ({
      owner: "bobrware",
      repo: "peep",
      number: 42,
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
      fetchDiff: vi.fn(async () => "diff --git a/file.ts b/file.ts"),
      comment: vi.fn(async () => {}),
      getReviewComment: vi.fn(async () => ({ id: 1, body: "comment" })),
      listReviewComments: vi.fn(async () => []),
      listReviewThreads: vi.fn(async () => []),
      fetchPullRequestDiff: vi.fn(async () => "diff --git a/file.ts b/file.ts"),
      react: vi.fn(async () => {}),
      replyToReviewComment: vi.fn(async () => ({ id: 1, body: "reply" })),
      resolveReviewThread: vi.fn(async () => {}),
      submitReviewComments: vi.fn(async () => {}),
      submitReview,
    }));
    const createLlm = vi.fn(() => ({
      generateObject: vi.fn(async () => [
        {
          path: "file.ts",
          line: 1,
          side: "RIGHT" as const,
          message: "Fix this",
          severity: "ghost" as const,
        },
      ]),
    }));
    const config: PeepConfig = {
      github: { appId: "app", privateKey: "key", webhookSecret: "secret" },
      llm: { provider: "openrouter", apiKey: "api-key", model: "model" },
      rules: [],
      on: {
        "pull_request.opened": async ({ agent, pr }) => {
          const findings = await agent.review<PepperFinding>({
            schema: z.array(pepperFindingSchema),
          });

          await pr.submitReview(
            findings.map(({ severity, ...finding }) => ({
              ...finding,
              message: `${severity}: ${finding.message}`,
            })),
          );
        },
      },
    };

    await executeWebhookEvent({ config, event, createPullRequestAdapter, createLlm });

    expect(submitReview).toHaveBeenCalledWith([
      { path: "file.ts", line: 1, side: "RIGHT", message: "ghost: Fix this" },
    ]);
  });
});
