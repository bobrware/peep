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
    "Rank severity as a pepper: bell is a nit, jalapeno is minor, habanero is major, ghost is critical.",
    "Use bell only for clear but low-impact issues; do not report speculative bell-pepper nits.",
    "Classify each finding into exactly one category: correctness, security, performance, maintainability, or readability.",
    "Review messages must be plain Markdown prose. Do not indent messages or wrap them in code fences.",
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
  const reviewFindings = findings.map(({ severity, category, ...finding }) => ({
    ...finding,
    message: `${formatCategory(category)} | ${formatPepperSeverity(severity)}\n\n${normalizeReviewMessage(finding.message)}`,
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

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];

    if (value !== undefined && value.length > 0) {
      return value;
    }
  }

  throw new Error(`Missing required env var: ${names.join(" or ")}`);
}
