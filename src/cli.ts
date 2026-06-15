#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { startWebhookServer } from "./runtime/server.js";

export type CliOptions = {
  configPath?: string;
  port?: number;
};

export function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--config") {
      options.configPath = args[index + 1];
      index += 1;
    } else if (arg === "--port") {
      options.port = Number(args[index + 1]);
      index += 1;
    }
  }

  return options;
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  const options = parseCliArgs(args);
  const server = await startWebhookServer(options);
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;

  console.log(`Peep listening on http://localhost:${port}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli();
}
