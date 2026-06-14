import { describe, expect, it, vi } from "vitest";
import type { GitHubApiClient } from "./api.js";
import { createGitHubPullRequestAdapter } from "./api.js";

describe("createGitHubPullRequestAdapter", () => {
  it("fetches the pull request diff", async () => {
    const client: GitHubApiClient = {
      request: vi.fn(async () => ({ data: "diff --git a/file.ts b/file.ts" })),
    };
    const adapter = await createGitHubPullRequestAdapter({
      appId: "app",
      privateKey: "key",
      installationId: 123,
      owner: "bobrware",
      repo: "peep",
      pullNumber: 42,
      client,
    });

    await expect(adapter.fetchPullRequestDiff()).resolves.toBe("diff --git a/file.ts b/file.ts");
    expect(client.request).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner: "bobrware",
      repo: "peep",
      pull_number: 42,
      headers: { accept: "application/vnd.github.v3.diff" },
    });
  });

  it("submits a body-only pull request review", async () => {
    const client: GitHubApiClient = {
      request: vi.fn(async () => ({ data: {} })),
    };
    const adapter = await createGitHubPullRequestAdapter({
      appId: "app",
      privateKey: "key",
      installationId: 123,
      owner: "bobrware",
      repo: "peep",
      pullNumber: 42,
      client,
    });

    await adapter.submitReview(
      [{ path: "src/example.ts", line: 1, side: "RIGHT", message: "Fix this" }],
      { event: "REQUEST_CHANGES" },
    );

    expect(client.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
      {
        owner: "bobrware",
        repo: "peep",
        pull_number: 42,
        event: "REQUEST_CHANGES",
        body: "Peep found 1 issue.",
      },
    );
  });
});
