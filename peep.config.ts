import { defineConfig, findingSchema, prepareReviewFindings, z } from "./src/index.js";
import type { PullRequestEventContext, ReviewComment, ReviewCommentDraft } from "./src/index.js";

const pepperSeveritySchema = z.enum(["bell", "jalapeno", "habanero", "ghost"]);
const categorySchema = z.enum([
  "correctness",
  "security",
  "performance",
  "maintainability",
  "readability",
]);
const pepperFindingSchema = findingSchema.extend({
  severity: pepperSeveritySchema,
  category: categorySchema,
  title: z.string(),
  agentPrompt: z.string(),
});

type PepperFinding = z.infer<typeof pepperFindingSchema>;

const privateKey = requiredEnv("GITHUB_PRIVATE_KEY", "GITHIB_PRIVATE_KEY").replaceAll("\\n", "\n");

export default defineConfig({
  github: {
    appId: requiredEnv("GITHUB_APP_ID"),
    privateKey,
    webhookSecret: requiredEnv("GITHUB_WEBHOOK_SECRET"),
  },
  llm: {
    provider: "openrouter",
    apiKey: requiredEnv("OPENROUTER_API_KEY", "OPENROUTER_KEY"),
    model: process.env.OPENROUTER_MODEL ?? "z-ai/glm-5.1",
    timeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS ?? 60_000),
  },
  rules: [
    "Only report concrete correctness, security, or maintainability issues introduced by this diff.",
    "Do not comment on style preferences unless they hide a real bug.",
    "Keep each finding concise and actionable.",
    "Every finding object must include severity as one of: bell, jalapeno, habanero, ghost. Do not omit severity.",
    "Rank severity as a pepper: bell is a nit, jalapeno is minor, habanero is major, ghost is critical.",
    "Use bell only for clear but low-impact issues; do not report speculative bell-pepper nits.",
    "Every finding object must include category as one of: correctness, security, performance, maintainability, readability. Do not omit category.",
    "Classify each finding into exactly one category: correctness, security, performance, maintainability, or readability.",
    "Every finding object must include title: a bold, one-line imperative or problem statement of 12 words or fewer, such as 'Remove the redundant null check.' or 'Use a composite key for checklist rows.'",
    "Every finding object must include message: one concise paragraph explaining the issue and the recommended fix.",
    "Every finding object must include agentPrompt: a standalone prompt for an AI coding agent that identifies the file/location, explains what to verify, asks it to fix the issue only if valid, and asks it to run the narrowest relevant check.",
    "Review messages, titles, and agent prompts must be plain Markdown prose. Do not indent them or wrap them in code fences.",
  ],
  on: {
    "pull_request.opened": async (context) => {
      const { pr } = context;

      await pr.react("eyes");

      if (pr.draft) {
        return;
      }

      await acknowledgeReview(context);
      await reviewReadyPullRequest(context);
    },
    "pull_request.ready_for_review": async (context) => {
      await acknowledgeReview(context);
      await reviewReadyPullRequest(context);
    },
    "pull_request.synchronize": async (context) => {
      const { pr } = context;

      if (pr.draft) {
        return;
      }

      await pr.react("eyes");
      await reviewReadyPullRequest(context);
    },
  },
});

async function acknowledgeReview({ pr }: PullRequestEventContext): Promise<void> {
  await pr.comment("👀 Peep is reviewing this PR.");
}

async function reviewReadyPullRequest({ pr, agent }: PullRequestEventContext): Promise<void> {
  const findings = await agent.review<PepperFinding>({
    schema: z.array(pepperFindingSchema),
  });
  const reviewFindings = findings.map(({ severity, category, title, agentPrompt, ...finding }) => ({
    ...finding,
    message: formatReviewComment({
      category,
      severity,
      title,
      explanation: finding.message,
      agentPrompt,
    }),
  }));
  const diff = await pr.fetchDiff();
  const { comments } = prepareReviewFindings(reviewFindings, diff);
  const existingComments = await pr.listReviewComments();
  const newComments = filterExistingLocationComments(comments, existingComments);

  if (reviewFindings.length > 0 && newComments.length === 0) {
    return;
  }

  await pr.submitReviewComments(newComments, {
    event: newComments.some((comment) => comment.body.includes("🌶️🌶️🌶️🌶️ Ghost"))
      ? "REQUEST_CHANGES"
      : "COMMENT",
  });
}

function filterExistingLocationComments(
  comments: ReviewCommentDraft[],
  existingComments: ReviewComment[],
): ReviewCommentDraft[] {
  const existingLocations = new Set(existingComments.map(formatExistingCommentLocation));

  return comments.filter((comment) => !existingLocations.has(formatDraftCommentLocation(comment)));
}

function formatDraftCommentLocation(comment: ReviewCommentDraft): string {
  return `${comment.path}:${comment.startLine ?? ""}:${comment.startSide ?? ""}:${comment.line}:${comment.side}`;
}

function formatExistingCommentLocation(comment: ReviewComment): string {
  return `${comment.path ?? ""}:${comment.startLine ?? ""}:${comment.startSide ?? ""}:${comment.line ?? ""}:${comment.side ?? ""}`;
}

function formatReviewComment({
  category,
  severity,
  title,
  explanation,
  agentPrompt,
}: {
  category: PepperFinding["category"];
  severity: PepperFinding["severity"];
  title: string;
  explanation: string;
  agentPrompt: string;
}): string {
  return [
    `${formatCategory(category)} | ${formatPepperSeverity(severity)}`,
    `**${normalizeInlineMarkdown(title)}**`,
    normalizeReviewMessage(explanation),
    `<details>`,
    `<summary>Prompt for AI Agents</summary>`,
    "",
    normalizeReviewMessage(agentPrompt),
    "",
    `</details>`,
  ].join("\n\n");
}

function formatCategory(category: PepperFinding["category"]): string {
  switch (category) {
    case "correctness":
      return "🐛 Correctness";
    case "security":
      return "🔒 Security";
    case "performance":
      return "⚡ Performance";
    case "maintainability":
      return "🧹 Maintainability";
    case "readability":
      return "📖 Readability";
  }
}

function formatPepperSeverity(severity: PepperFinding["severity"]): string {
  switch (severity) {
    case "bell":
      return "🫑 Bell";
    case "jalapeno":
      return "🌶️ Jalapeno";
    case "habanero":
      return "🌶️🌶️ Habanero";
    case "ghost":
      return "🌶️🌶️🌶️🌶️ Ghost";
  }
}

function normalizeReviewMessage(message: string): string {
  return message
    .trim()
    .replaceAll(/```/g, "")
    .replaceAll(/\n[ \t]+/g, "\n")
    .replaceAll(/[ \t]+/g, " ");
}

function normalizeInlineMarkdown(message: string): string {
  return normalizeReviewMessage(message).replaceAll(/\n+/g, " ");
}

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];

    if (value !== undefined && value.length > 0) {
      return value;
    }
  }

  throw new Error(`Missing required env var: ${names.join(" or ")}`);
}
