import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PeepConfig } from "../ports/config.js";
import { createWebhookServer } from "./server.js";

const config: PeepConfig = {
  github: {
    appId: "app",
    privateKey: "key",
    webhookSecret: "secret",
  },
  llm: {
    provider: "openrouter",
    apiKey: "api-key",
    model: "model",
  },
  rules: [],
  on: {},
};

const servers: Array<{ close: () => void }> = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close();
  }
});

describe("createWebhookServer", () => {
  it("verifies, parses, and executes GitHub webhooks", async () => {
    const execute = vi.fn(async () => undefined);
    const url = await listen(createWebhookServer({ config, execute }));
    const body = JSON.stringify({
      action: "opened",
      installation: { id: 123 },
      repository: { name: "peep", owner: { login: "bobrware" } },
      pull_request: { number: 42 },
    });

    const response = await fetch(`${url}/webhooks/github`, {
      method: "POST",
      headers: {
        "x-github-event": "pull_request",
        "x-hub-signature-256": sign(body),
      },
      body,
    });

    expect(response.status).toBe(202);
    expect(execute).toHaveBeenCalledWith({
      config,
      event: {
        type: "pull_request.opened",
        installationId: 123,
        repository: { owner: "bobrware", name: "peep" },
        pullRequest: { number: 42 },
      },
    });
  });

  it("rejects invalid signatures", async () => {
    const execute = vi.fn(async () => undefined);
    const url = await listen(createWebhookServer({ config, execute }));

    const response = await fetch(`${url}/webhooks/github`, {
      method: "POST",
      headers: {
        "x-github-event": "pull_request",
        "x-hub-signature-256": "sha256=invalid",
      },
      body: "{}",
    });

    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("accepts ignored GitHub webhook events without executing", async () => {
    const execute = vi.fn(async () => undefined);
    const url = await listen(createWebhookServer({ config, execute }));
    const body = JSON.stringify({ action: "closed" });

    const response = await fetch(`${url}/webhooks/github`, {
      method: "POST",
      headers: {
        "x-github-event": "pull_request",
        "x-hub-signature-256": sign(body),
      },
      body,
    });

    expect(response.status).toBe(202);
    expect(execute).not.toHaveBeenCalled();
  });
});

async function listen(server: ReturnType<typeof createWebhookServer>): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();

  if (typeof address !== "object" || address === null) {
    throw new Error("Expected server address.");
  }

  return `http://127.0.0.1:${address.port}`;
}

function sign(body: string): string {
  return `sha256=${createHmac("sha256", config.github.webhookSecret).update(body).digest("hex")}`;
}
