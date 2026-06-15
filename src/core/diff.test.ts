import { describe, expect, it } from "vitest";
import { annotateDiff } from "./diff.js";

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
