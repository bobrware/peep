import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "./loader.js";

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `peep-config-${crypto.randomUUID()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { force: true, recursive: true });
});

describe("loadConfig", () => {
  it("loads a TypeScript config default export", async () => {
    const configPath = join(testDir, "peep.config.ts");
    await writeFile(
      configPath,
      `export default {
        github: { appId: "app", privateKey: "key", webhookSecret: "secret" },
        llm: { provider: "openrouter", apiKey: "key", model: "model" },
        rules: ["No any types"],
        on: {},
      };`,
    );

    const config = await loadConfig(configPath);

    expect(config.rules).toEqual(["No any types"]);
    expect(config.llm.provider).toBe("openrouter");
  });

  it("throws a clear error when the config has no default export", async () => {
    const configPath = join(testDir, "peep.config.ts");
    await writeFile(configPath, "export const config = {};");

    await expect(loadConfig(configPath)).rejects.toThrow(
      `Config file ${configPath} must have a default export.`,
    );
  });
});
