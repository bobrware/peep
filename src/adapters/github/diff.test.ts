import { describe, expect, it } from "vitest";
import { mapFindingsToReviewComments, prepareReviewFindings } from "./diff.js";

const diff = `diff --git a/src/one.ts b/src/one.ts
index 1111111..2222222 100644
--- a/src/one.ts
+++ b/src/one.ts
@@ -10,4 +10,5 @@
 const contextBefore = true;
-const removed = true;
+const added = true;
+const alsoAdded = true;
 const contextAfter = true;
diff --git a/src/two.ts b/src/two.ts
index 3333333..4444444 100644
--- a/src/two.ts
+++ b/src/two.ts
@@ -20,2 +20,2 @@
-const oldTwo = true;
+const newTwo = true;`;

describe("mapFindingsToReviewComments", () => {
  it("maps findings on added, deleted, and context lines", () => {
    expect(
      mapFindingsToReviewComments(
        [
          { path: "src/one.ts", line: 11, side: "RIGHT", message: "Added" },
          { path: "src/one.ts", line: 11, side: "LEFT", message: "Deleted" },
          { path: "src/one.ts", line: 10, side: "RIGHT", message: "Context right" },
          { path: "src/one.ts", line: 10, side: "LEFT", message: "Context left" },
        ],
        diff,
      ),
    ).toEqual([
      { path: "src/one.ts", line: 11, side: "RIGHT", body: "Added" },
      { path: "src/one.ts", line: 11, side: "LEFT", body: "Deleted" },
      { path: "src/one.ts", line: 10, side: "RIGHT", body: "Context right" },
      { path: "src/one.ts", line: 10, side: "LEFT", body: "Context left" },
    ]);
  });

  it("maps findings in the correct file and drops unmappable findings", () => {
    expect(
      mapFindingsToReviewComments(
        [
          { path: "src/two.ts", line: 20, side: "RIGHT", message: "Second file" },
          { path: "src/one.ts", line: 20, side: "RIGHT", message: "Wrong file" },
          { path: "src/two.ts", line: 99, side: "RIGHT", message: "Missing line" },
        ],
        diff,
      ),
    ).toEqual([{ path: "src/two.ts", line: 20, side: "RIGHT", body: "Second file" }]);
  });

  it("prepares mapped comments and returns unmappable findings", () => {
    const missingFinding = {
      path: "src/two.ts",
      line: 99,
      side: "RIGHT" as const,
      message: "Missing",
    };

    expect(
      prepareReviewFindings(
        [{ path: "src/two.ts", line: 20, side: "RIGHT", message: "Second file" }, missingFinding],
        diff,
      ),
    ).toEqual({
      comments: [{ path: "src/two.ts", line: 20, side: "RIGHT", body: "Second file" }],
      unmappableFindings: [missingFinding],
    });
  });

  it("maps valid multi-line findings to GitHub range comments", () => {
    expect(
      mapFindingsToReviewComments(
        [
          {
            path: "src/one.ts",
            startLine: 11,
            startSide: "RIGHT",
            line: 12,
            side: "RIGHT",
            message: "Range",
          },
        ],
        diff,
      ),
    ).toEqual([
      {
        path: "src/one.ts",
        start_line: 11,
        start_side: "RIGHT",
        line: 12,
        side: "RIGHT",
        body: "Range",
      },
    ]);
  });

  it("falls back to a single-line comment when the range is not mappable", () => {
    expect(
      mapFindingsToReviewComments(
        [
          {
            path: "src/one.ts",
            startLine: 9,
            startSide: "RIGHT",
            line: 12,
            side: "RIGHT",
            message: "Range",
          },
        ],
        diff,
      ),
    ).toEqual([{ path: "src/one.ts", line: 12, side: "RIGHT", body: "Range" }]);
  });
});
