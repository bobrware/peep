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

Diff:
${diff}`;
}
