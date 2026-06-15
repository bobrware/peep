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
        pull_request: { number: 42 },
      },
    });

    expect(event).toEqual({
      type: "pull_request.opened",
      installationId: 123,
      repository: { owner: "bobrware", name: "peep" },
      pullRequest: { number: 42 },
    });
  });

  it("ignores unsupported events and actions", () => {
    expect(parseGitHubWebhook({ event: "issues", payload: {} })).toBeUndefined();
    expect(
      parseGitHubWebhook({
        event: "pull_request",
        payload: { action: "synchronize" },
      }),
    ).toBeUndefined();
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
