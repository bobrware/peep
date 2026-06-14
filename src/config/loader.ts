import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import type { PeepConfig } from "../ports/config.js";

type ConfigModule = {
  default?: PeepConfig;
};

export async function loadConfig(configPath = "peep.config.ts"): Promise<PeepConfig> {
  const configUrl = pathToFileURL(configPath).href;
  const configModule = (await tsImport(configUrl, import.meta.url)) as ConfigModule;
  const defaultExport = unwrapDefaultExport(configModule);

  if (defaultExport === undefined) {
    throw new Error(`Config file ${configPath} must have a default export.`);
  }

  return defaultExport;
}

function unwrapDefaultExport(configModule: ConfigModule): PeepConfig | undefined {
  if (configModule.default === undefined) {
    return undefined;
  }

  if (isTranspiledModule(configModule.default)) {
    return unwrapDefaultExport(configModule.default);
  }

  return configModule.default;
}

function isTranspiledModule(value: unknown): value is ConfigModule {
  return typeof value === "object" && value !== null && "__esModule" in value;
}
