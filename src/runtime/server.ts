import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { parseGitHubWebhook, verifyGitHubSignature } from "../adapters/github/webhook.js";
import { loadConfig } from "../config/loader.js";
import type { PeepConfig } from "../ports/config.js";
import { executeWebhookEvent } from "./execute.js";

export type CreateWebhookServerOptions = {
  config: PeepConfig;
  execute?: typeof executeWebhookEvent;
};

export type StartWebhookServerOptions = {
  configPath?: string;
  port?: number;
};

export function createWebhookServer({
  config,
  execute = executeWebhookEvent,
}: CreateWebhookServerOptions): Server {
  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/webhooks/github") {
      writeResponse(response, 404, "Not found");
      return;
    }

    const body = await readRequestBody(request);
    const signature = getHeader(request, "x-hub-signature-256");

    if (
      !verifyGitHubSignature({
        secret: config.github.webhookSecret,
        payload: body,
        signature,
      })
    ) {
      writeResponse(response, 401, "Invalid signature");
      return;
    }

    let event;

    try {
      const payload = JSON.parse(body.toString("utf8")) as unknown;
      const eventName = getHeader(request, "x-github-event");
      event = parseGitHubWebhook({ event: eventName ?? "", payload });
    } catch (error) {
      writeResponse(response, 400, error instanceof Error ? error.message : "Bad request");
      return;
    }

    try {
      if (event !== undefined) {
        await execute({ config, event });
      }

      writeResponse(response, 202, "Accepted");
    } catch (error) {
      writeResponse(response, 500, error instanceof Error ? error.message : "Internal server error");
    }
  });
}

export async function startWebhookServer({
  configPath,
  port = Number(process.env.PORT ?? 3000),
}: StartWebhookServerOptions = {}): Promise<Server> {
  const config = await loadConfig(configPath);
  const server = createWebhookServer({ config });

  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  return server;
}

function getHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];

  return Array.isArray(value) ? value[0] : value;
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

function writeResponse(response: ServerResponse, statusCode: number, body: string): void {
  response.writeHead(statusCode, { "content-type": "text/plain" });
  response.end(body);
}
