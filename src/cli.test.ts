import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./cli.js";

describe("parseCliArgs", () => {
  it("parses config path and port", () => {
    expect(parseCliArgs(["--config", "custom.config.ts", "--port", "4000"])).toEqual({
      configPath: "custom.config.ts",
      port: 4000,
    });
  });

  it("returns empty options when no args are provided", () => {
    expect(parseCliArgs([])).toEqual({});
  });
});
