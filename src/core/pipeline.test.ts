import { describe, expect, it, vi } from "vitest";
import type { VcsPort } from "../ports/vcs.js";
import { reviewPullRequest } from "./pipeline.js";

describe("reviewPullRequest", () => {
  it("fetches the diff, passes the schema and prompt to the LLM, and returns its object", async () => {
    const schema = { type: "findings" };
    const generated = [{ path: "src/example.ts", line: 1, message: "Fix this" }];
    const generateObject = vi.fn(async () => generated);
    const vcs: VcsPort = {
      fetchPullRequestDiff: vi.fn(async () => "diff --git a/src/example.ts b/src/example.ts"),
    };

    const result = await reviewPullRequest({
      vcs,
      llm: { generateObject },
      rules: ["No any types"],
      schema,
    });

    expect(result).toBe(generated);
    expect(vcs.fetchPullRequestDiff).toHaveBeenCalledOnce();
    expect(generateObject).toHaveBeenCalledWith({
      schema,
      prompt: expect.stringContaining("- No any types"),
    });
    expect(generateObject).toHaveBeenCalledWith({
      schema,
      prompt: expect.stringContaining("diff --git a/src/example.ts b/src/example.ts"),
    });
  });

  it("annotates diff line coordinates before prompting", async () => {
    const generateObject = vi.fn(async () => []);
    const vcs: VcsPort = {
      fetchPullRequestDiff: vi.fn(
        async () => `diff --git a/src/example.ts b/src/example.ts
@@ -1,1 +1,1 @@
-const oldValue = true;
+const newValue = true;`,
      ),
    };

    await reviewPullRequest({
      vcs,
      llm: { generateObject },
      rules: [],
      schema: {},
    });

    expect(generateObject).toHaveBeenCalledWith({
      schema: {},
      prompt: expect.stringContaining("LEFT:1 -const oldValue = true;"),
    });
    expect(generateObject).toHaveBeenCalledWith({
      schema: {},
      prompt: expect.stringContaining("RIGHT:1 +const newValue = true;"),
    });
  });
});
