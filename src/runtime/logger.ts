import pino, { type Logger } from "pino";

export type PeepLogger = Logger;

export const logger = pino({
  name: "peep",
  level: process.env.VITEST === "true" ? "silent" : (process.env.LOG_LEVEL ?? "info"),
});
