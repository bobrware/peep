import { defineConfig } from "./src/index.js";

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
  ],
  on: {
    "pull_request.opened": async ({ pr, agent }) => {
      await pr.react("eyes");

      const findings = await agent.review();

      await pr.submitReview(findings, {
        event: findings.length > 0 ? "REQUEST_CHANGES" : "COMMENT",
      });
    },
  },
});

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];

    if (value !== undefined && value.length > 0) {
      return value;
    }
  }

  throw new Error(`Missing required env var: ${names.join(" or ")}`);
}
