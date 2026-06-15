import { defineConfig, findingSchema, z } from "./src/index.js";

const pepperSeveritySchema = z.enum(["bell", "jalapeno", "habanero", "ghost"]);
const pepperFindingSchema = findingSchema.extend({
  severity: pepperSeveritySchema,
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
    model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4",
  },
  rules: [
    "Only report concrete correctness, security, or maintainability issues introduced by this diff.",
    "Do not comment on style preferences unless they hide a real bug.",
    "Keep each finding concise and actionable.",
    "Rank severity as a pepper: bell is a nit, jalapeno is minor, habanero is major, ghost is critical.",
    "Use bell only for clear but low-impact issues; do not report speculative bell-pepper nits.",
  ],
  on: {
    "pull_request.opened": async ({ pr, agent }) => {
      await pr.react("eyes");

      const findings = await agent.review<PepperFinding>({
        schema: z.array(pepperFindingSchema),
      });
      const reviewFindings = findings.map(({ severity, ...finding }) => ({
        ...finding,
        message: `${formatPepperSeverity(severity)} ${finding.message}`,
      }));

      await pr.submitReview(reviewFindings, {
        event: reviewFindings.some((finding) => finding.message.startsWith("🌶️🌶️🌶️🌶️"))
          ? "REQUEST_CHANGES"
          : "COMMENT",
      });
    },
  },
});

function formatPepperSeverity(severity: PepperFinding["severity"]): string {
  switch (severity) {
    case "bell":
      return "🫑";
    case "jalapeno":
      return "🌶️";
    case "habanero":
      return "🌶️🌶️";
    case "ghost":
      return "🌶️🌶️🌶️🌶️";
  }
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
