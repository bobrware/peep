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

Return only findings that identify concrete, actionable issues in the diff.
Each finding must include:
- path: the exact file path from the diff
- line: the exact changed or context line number in the diff
- side: "RIGHT" for added/current lines or "LEFT" for deleted/base lines
- message: a concise review comment
If there are no concrete issues, return an empty array.

Diff:
${diff}`;
}
