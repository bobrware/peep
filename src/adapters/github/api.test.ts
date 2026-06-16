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
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
      client,
    });

    expect(adapter).toMatchObject({
      owner: "bobrware",
      repo: "peep",
      number: 42,
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
    });
    await expect(adapter.fetchPullRequestDiff()).resolves.toBe("diff --git a/file.ts b/file.ts");
    await expect(adapter.fetchDiff()).resolves.toBe("diff --git a/file.ts b/file.ts");
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
        data:
          route === "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments"
            ? []
            : route.startsWith("GET ")
              ? "diff --git a/other.ts b/other.ts"
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
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
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
        data:
          route === "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments"
            ? []
            : route.startsWith("GET ")
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
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
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

  it("submits prepared review comments", async () => {
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
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
      client,
    });

    await adapter.submitReviewComments(
      [
        {
          path: "src/example.ts",
          startLine: 2,
          startSide: "RIGHT",
          line: 3,
          side: "RIGHT",
          body: "Fix this range",
        },
      ],
      { event: "REQUEST_CHANGES", summary: "Custom summary" },
    );

    expect(client.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
      {
        owner: "bobrware",
        repo: "peep",
        pull_number: 42,
        event: "REQUEST_CHANGES",
        body: "Custom summary",
        comments: [
          {
            path: "src/example.ts",
            start_line: 2,
            start_side: "RIGHT",
            line: 3,
            side: "RIGHT",
            body: "Fix this range",
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
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
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

  it("creates pull request conversation comments", async () => {
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
      title: "Add feature",
      body: "Body",
      author: "alice",
      draft: false,
      client,
    });

    await adapter.comment("Peep is reviewing this PR.");

    expect(client.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        owner: "bobrware",
        repo: "peep",
        issue_number: 42,
        body: "Peep is reviewing this PR.",
      },
    );
  });

  it("lists review comments with diff metadata", async () => {
    const client: GitHubApiClient = {
      request: vi.fn(async () => ({
        data: [
          {
            id: 123,
            body: "Fix this",
            path: "src/example.ts",
            line: 12,
            side: "RIGHT",
            start_line: 10,
            start_side: "RIGHT",
            original_line: 11,
            original_start_line: 9,
            diff_hunk: "@@ -10,1 +10,3 @@",
            user: { login: "peep[bot]" },
            created_at: "2026-06-16T00:00:00Z",
            updated_at: "2026-06-16T00:01:00Z",
            url: "https://api.github.com/comment/123",
            html_url: "https://github.com/bobrware/peep/pull/42#discussion_r123",
          },
        ],
      })),
    };
    const adapter = await createGitHubPullRequestAdapter({
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
      client,
    });

    await expect(adapter.listReviewComments()).resolves.toEqual([
      {
        id: 123,
        body: "Fix this",
        path: "src/example.ts",
        line: 12,
        side: "RIGHT",
        startLine: 10,
        startSide: "RIGHT",
        originalLine: 11,
        originalStartLine: 9,
        diffHunk: "@@ -10,1 +10,3 @@",
        author: "peep[bot]",
        createdAt: "2026-06-16T00:00:00Z",
        updatedAt: "2026-06-16T00:01:00Z",
        url: "https://api.github.com/comment/123",
        htmlUrl: "https://github.com/bobrware/peep/pull/42#discussion_r123",
      },
    ]);
  });
});
