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
      request: vi.fn(async (route: string) => ({
        data: route.startsWith("GET ") ? "diff --git a/other.ts b/other.ts" : {},
      })),
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
        comments: [],
      },
    );
  });

  it("maps findings on diff lines to inline review comments", async () => {
    const client: GitHubApiClient = {
      request: vi.fn(async (route: string) => ({
        data: route.startsWith("GET ")
          ? `diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,3 +1,4 @@
 const kept = true;
-const removed = true;
+const added = true;
+const alsoAdded = true;
 const after = true;`
          : {},
      })),
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

    await adapter.submitReview([
      { path: "src/example.ts", line: 2, side: "RIGHT", message: "Fix added" },
      { path: "src/example.ts", line: 99, side: "RIGHT", message: "Not in diff" },
    ]);

    expect(client.request).toHaveBeenLastCalledWith(
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
      {
        owner: "bobrware",
        repo: "peep",
        pull_number: 42,
        event: "COMMENT",
        body: "Peep found 2 issues.",
        comments: [
          {
            path: "src/example.ts",
            line: 2,
            side: "RIGHT",
            body: "Fix added",
          },
        ],
      },
    );
  });

  it("reacts to the pull request", async () => {
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

    await adapter.react("eyes");

    expect(client.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/reactions",
      {
        owner: "bobrware",
        repo: "peep",
        issue_number: 42,
        content: "eyes",
        headers: { accept: "application/vnd.github+json" },
      },
    );
  });
});
