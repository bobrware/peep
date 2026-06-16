import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseGitHubWebhook, verifyGitHubSignature } from "./webhook.js";

describe("verifyGitHubSignature", () => {
  it("returns true for a valid sha256 signature", () => {
    const payload = JSON.stringify({ ok: true });
    const signature = `sha256=${createHmac("sha256", "secret").update(payload).digest("hex")}`;

    expect(verifyGitHubSignature({ secret: "secret", payload, signature })).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    expect(
      verifyGitHubSignature({
        secret: "secret",
        payload: JSON.stringify({ ok: true }),
        signature: "sha256=invalid",
      }),
    ).toBe(false);
  });
});

describe("parseGitHubWebhook", () => {
  it("maps pull_request opened payloads to the internal event", () => {
    const event = parseGitHubWebhook({
      event: "pull_request",
      payload: {
        action: "opened",
        installation: { id: 123 },
        repository: { name: "peep", owner: { login: "bobrware" } },
        pull_request: {
          number: 42,
          title: "Add feature",
          body: "This adds a feature.",
          draft: false,
          user: { login: "alice" },
        },
      },
    });

    expect(event).toEqual({
      type: "pull_request.opened",
      installationId: 123,
      repository: { owner: "bobrware", name: "peep" },
      pullRequest: {
        number: 42,
        title: "Add feature",
        body: "This adds a feature.",
        author: "alice",
        draft: false,
      },
    });
  });

  it("ignores unsupported events and actions", () => {
    expect(parseGitHubWebhook({ event: "issues", payload: {} })).toBeUndefined();
    expect(
      parseGitHubWebhook({
        event: "pull_request",
        payload: { action: "closed" },
      }),
    ).toBeUndefined();
  });

  it("maps pull_request ready_for_review payloads to the internal event", () => {
    const event = parseGitHubWebhook({
      event: "pull_request",
      payload: {
        action: "ready_for_review",
        installation: { id: 123 },
        repository: { name: "peep", owner: { login: "bobrware" } },
        pull_request: {
          number: 42,
          title: "Add feature",
          body: null,
          draft: false,
          user: { login: "alice" },
        },
      },
    });

    expect(event).toEqual({
      type: "pull_request.ready_for_review",
      installationId: 123,
      repository: { owner: "bobrware", name: "peep" },
      pullRequest: {
        number: 42,
        title: "Add feature",
        body: "",
        author: "alice",
        draft: false,
      },
    });
  });

  it("maps pull_request synchronize payloads to the internal event", () => {
    const event = parseGitHubWebhook({
      event: "pull_request",
      payload: {
        action: "synchronize",
        installation: { id: 123 },
        repository: { name: "peep", owner: { login: "bobrware" } },
        pull_request: {
          number: 42,
          title: "Add feature",
          body: "Body",
          draft: false,
          user: { login: "alice" },
        },
      },
    });

    expect(event).toEqual({
      type: "pull_request.synchronize",
      installationId: 123,
      repository: { owner: "bobrware", name: "peep" },
      pullRequest: {
        number: 42,
        title: "Add feature",
        body: "Body",
        author: "alice",
        draft: false,
      },
    });
  });

  it("maps pull_request_review_comment created payloads to the internal event", () => {
    const event = parseGitHubWebhook({
      event: "pull_request_review_comment",
      payload: {
        action: "created",
        installation: { id: 123 },
        repository: { name: "peep", owner: { login: "bobrware" } },
        pull_request: {
          number: 42,
          title: "Add feature",
          body: "Body",
          draft: false,
          user: { login: "alice" },
        },
        comment: {
          id: 456,
          in_reply_to_id: 123,
          body: "This is invalid, close this.",
          path: "src/example.ts",
          line: 12,
          side: "RIGHT",
          diff_hunk: "@@ -10,1 +10,3 @@",
          created_at: "2026-06-16T00:00:00Z",
          updated_at: "2026-06-16T00:01:00Z",
          url: "https://api.github.com/comment/456",
          html_url: "https://github.com/bobrware/peep/pull/42#discussion_r456",
          user: { login: "bob" },
        },
      },
    });

    expect(event).toEqual({
      type: "pull_request_review_comment.created",
      installationId: 123,
      repository: { owner: "bobrware", name: "peep" },
      pullRequest: {
        number: 42,
        title: "Add feature",
        body: "Body",
        author: "alice",
        draft: false,
      },
      comment: {
        id: 456,
        inReplyToId: 123,
        body: "This is invalid, close this.",
        author: "bob",
        path: "src/example.ts",
        line: 12,
        side: "RIGHT",
        diffHunk: "@@ -10,1 +10,3 @@",
        createdAt: "2026-06-16T00:00:00Z",
        updatedAt: "2026-06-16T00:01:00Z",
        url: "https://api.github.com/comment/456",
        htmlUrl: "https://github.com/bobrware/peep/pull/42#discussion_r456",
      },
    });
  });

  it("throws a clear error for malformed pull_request opened payloads", () => {
    expect(() =>
      parseGitHubWebhook({
        event: "pull_request",
        payload: { action: "opened" },
      }),
    ).toThrow("Invalid pull_request.opened webhook payload.");
  });
});
