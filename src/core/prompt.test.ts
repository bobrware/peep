import { describe, expect, it } from "vitest";
import { buildReviewPrompt } from "./prompt.js";

describe("buildReviewPrompt", () => {
  it("includes custom rules and the diff", () => {
    const prompt = buildReviewPrompt({
      rules: ["No any types", "Prefer small functions"],
      diff: "diff --git a/src/example.ts b/src/example.ts",
    });

    expect(prompt).toContain("- No any types");
    expect(prompt).toContain("- Prefer small functions");
    expect(prompt).toContain("diff --git a/src/example.ts b/src/example.ts");
  });

  it("uses a fallback rule when no rules are configured", () => {
    const prompt = buildReviewPrompt({
      rules: [],
      diff: "diff --git a/src/example.ts b/src/example.ts",
    });

    expect(prompt).toContain("- Review for correctness, maintainability, and security issues.");
  });
});
