import { describe, expect, it, vi } from "vitest";
import type { GitHubWebhookEvent } from "../adapters/github/webhook.js";
import type { PeepConfig } from "../ports/config.js";
import { executeWebhookEvent } from "./execute.js";

const event: GitHubWebhookEvent = {
  type: "pull_request.opened",
  installationId: 123,
  repository: { owner: "bobrware", name: "peep" },
  pullRequest: { number: 42 },
};

describe("executeWebhookEvent", () => {
  it("builds the pull request context and runs the matching handler", async () => {
    const submitReview = vi.fn(async () => {});
    const createPullRequestAdapter = vi.fn(async () => ({
      fetchPullRequestDiff: vi.fn(async () => "diff --git a/file.ts b/file.ts"),
      react: vi.fn(async () => {}),
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
      logger: expect.anything(),
    });
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
});
