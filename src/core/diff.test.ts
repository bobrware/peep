import { describe, expect, it } from "vitest";
import { annotateDiff, parseDiff } from "./diff.js";

describe("annotateDiff", () => {
  it("adds explicit LEFT and RIGHT coordinates to diff lines", () => {
    expect(
      annotateDiff(`diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -10,3 +10,4 @@
 const kept = true;
-const removed = true;
+const added = true;
+const alsoAdded = true;`),
    ).toContain(`@@ -10,3 +10,4 @@
LEFT:10 RIGHT:10  const kept = true;
LEFT:11 -const removed = true;
RIGHT:11 +const added = true;
RIGHT:12 +const alsoAdded = true;`);
  });
});

describe("parseDiff", () => {
  it("parses files, hunks, line kinds, and coordinates", () => {
    expect(
      parseDiff(`diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -10,3 +10,4 @@
 const kept = true;
-const removed = true;
+const added = true;
+const alsoAdded = true;`),
    ).toEqual({
      files: [
        {
          oldPath: "src/example.ts",
          path: "src/example.ts",
          hunks: [
            {
              header: "@@ -10,3 +10,4 @@",
              oldStart: 10,
              newStart: 10,
              lines: [
                {
                  kind: "context",
                  content: "const kept = true;",
                  leftLine: 10,
                  rightLine: 10,
                },
                { kind: "deletion", content: "const removed = true;", leftLine: 11 },
                { kind: "addition", content: "const added = true;", rightLine: 11 },
                { kind: "addition", content: "const alsoAdded = true;", rightLine: 12 },
              ],
            },
          ],
        },
      ],
    });
  });
});
