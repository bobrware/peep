export type BuildReviewPromptOptions = {
  rules: string[];
  diff: string;
};

export function buildReviewPrompt({ rules, diff }: BuildReviewPromptOptions): string {
  const formattedRules =
    rules.length > 0
      ? rules.map((rule) => `- ${rule}`).join("\n")
      : "- Review for correctness, maintainability, and security issues.";

  return `You are reviewing a GitHub pull request diff.

Rules:
${formattedRules}

Return only findings that identify concrete, actionable issues in the annotated diff.
Each finding must include:
- path: the exact file path from the diff
- line: the exact line number from a RIGHT:<line> or LEFT:<line> coordinate shown in the annotated diff
- side: "RIGHT" for a RIGHT:<line> coordinate or "LEFT" for a LEFT:<line> coordinate
- startLine and startSide only when the issue spans multiple contiguous coordinates on the same side
- message: a concise review comment
Use only coordinates explicitly shown in the annotated diff. Do not infer or guess line numbers.
If there are no concrete issues, return an empty array.

Annotated diff:
${diff}`;
}
