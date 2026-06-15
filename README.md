# Peep

Peep is a self-hosted, TypeScript-first framework for building code review agents.

You provide a `peep.config.ts` file that defines GitHub App credentials, LLM settings, review rules, and event handlers. Peep receives GitHub webhooks, fetches pull request diffs, asks an LLM for structured findings, and submits GitHub reviews using your config logic.

Peep is intentionally a small core. Review policy belongs in user config: schemas, severity systems, filtering, comments, reactions, and event behavior are all controlled by the consumer.

## Status

This project is currently MVP/dogfood-stage.

Implemented today:

- GitHub App webhook server
- GitHub signature verification
- `pull_request.opened`, `pull_request.ready_for_review`, and `pull_request.synchronize`
- GitHub App installation auth via Octokit
- Pull request diff fetching
- Single-call LLM review pipeline
- OpenRouter-compatible AI SDK adapter
- Zod-backed structured findings
- Inline GitHub review comments
- Optional multi-line review ranges
- PR reactions
- PR conversation comments
- PR review comment listing
- Local CLI/server runner
- Pino structured logging

Not implemented yet:

- agent/tool loop
- persistent memory
- automatic duplicate suppression
- automatic thread resolution
- comment reply workflows
- `.md` rule file loading
- multiple first-class LLM provider configs
- production packaging polish

## Quick start

Create a GitHub App with at least these permissions:

- Pull requests: read/write
- Contents: read
- Issues: write, if using `pr.comment()` or `pr.react()`

Subscribe to the Pull request webhook event.

Create `.env.local`:

```sh
GITHUB_APP_ID=...
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=...
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=z-ai/glm-5.1
```

Run Peep locally:

```sh
pnpm dev
```

Expose the server with a tunnel such as ngrok or cloudflared and configure your GitHub App webhook URL as:

```text
https://your-tunnel.example.com/webhooks/github
```

## Minimal config

```ts
import { defineConfig, findingSchema, z } from "peep";

export default defineConfig({
  github: {
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_PRIVATE_KEY!.replaceAll("\\n", "\n"),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  llm: {
    provider: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.OPENROUTER_MODEL ?? "z-ai/glm-5.1",
  },
  rules: ["Only report concrete correctness, security, or maintainability issues."],
  on: {
    "pull_request.opened": async ({ pr, agent }) => {
      if (pr.draft) {
        await pr.react("eyes");
        return;
      }

      await pr.comment("👀 Peep is reviewing this PR.");

      const findings = await agent.review({
        schema: z.array(findingSchema),
      });

      await pr.submitReview(findings, {
        event: findings.length > 0 ? "REQUEST_CHANGES" : "COMMENT",
      });
    },
  },
});
```

## Config API surface

### `defineConfig(config)`

Defines a Peep config object.

```ts
import { defineConfig } from "peep";
```

### Top-level config

```ts
type PeepConfig = {
  github: {
    appId: string;
    privateKey: string;
    webhookSecret: string;
  };
  llm: {
    provider: "openrouter";
    apiKey: string;
    model: string;
  };
  rules: string[];
  on: {
    "pull_request.opened"?: Handler;
    "pull_request.ready_for_review"?: Handler;
    "pull_request.synchronize"?: Handler;
  };
};
```

### Events

Peep currently supports these GitHub pull request events:

- `pull_request.opened`
- `pull_request.ready_for_review`
- `pull_request.synchronize`

All handlers receive:

```ts
type PullRequestEventContext = {
  pr: PullRequestContext;
  agent: ReviewAgent;
};
```

### `pr` context

```ts
type PullRequestContext = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  draft: boolean;

  comment(body: string): Promise<void>;
  react(content: ReactionContent): Promise<void>;
  listReviewComments(): Promise<ReviewComment[]>;
  submitReview(findings: ReviewFinding[], options?: SubmitReviewOptions): Promise<void>;
};
```

#### `pr.comment(body)`

Creates a PR conversation comment. GitHub implements this through the Issues comments API because every PR is also an issue.

```ts
await pr.comment("Peep is reviewing this PR.");
```

#### `pr.react(content)`

Adds a reaction to the PR body / issue.

```ts
await pr.react("eyes");
```

Supported reactions:

```ts
"+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes";
```

#### `pr.listReviewComments()`

Lists existing inline review comments on the PR.

```ts
const comments = await pr.listReviewComments();
```

Useful for user-defined memory, deduplication, or context. Peep core does not currently apply automatic duplicate suppression.

#### `pr.submitReview(findings, options)`

Submits one GitHub pull request review. Findings that map to valid diff coordinates become inline comments. Findings that cannot be mapped to the current diff are dropped.

```ts
await pr.submitReview(findings, {
  event: "COMMENT",
});
```

Options:

```ts
type SubmitReviewOptions = {
  event?: "COMMENT" | "REQUEST_CHANGES" | "APPROVE";
  summary?: boolean | string;
};
```

### `agent.review()`

Fetches the PR diff, builds an annotated prompt, calls the configured LLM, and validates the structured output with the provided schema.

```ts
const findings = await agent.review({
  schema: z.array(findingSchema),
});
```

Peep annotates diffs with explicit coordinates before prompting, for example:

```text
RIGHT:46 +const value = computeValue()
LEFT:12 -const oldValue = computeValue()
LEFT:20 RIGHT:20  const unchanged = true
```

The model is expected to use those coordinates in findings.

## Findings

Peep's default finding schema is intentionally small:

```ts
const findingSchema = z.object({
  path: z.string(),
  startLine: z.number().int().positive().optional(),
  startSide: z.enum(["LEFT", "RIGHT"]).optional(),
  line: z.number().int().positive(),
  side: z.enum(["LEFT", "RIGHT"]).default("RIGHT"),
  message: z.string(),
});
```

`startLine` and `startSide` are optional. Use them when a comment should span a contiguous multi-line range on the same side of the diff.

Peep core only requires the `ReviewFinding` shape needed to submit comments. Users can extend findings in their config.

## Extending findings

Example: add custom severity and category fields without changing Peep core.

```ts
import { findingSchema, z } from "peep";

const customFindingSchema = findingSchema.extend({
  severity: z.enum(["bell", "jalapeno", "habanero", "ghost"]),
  category: z.enum(["correctness", "security", "performance", "maintainability"]),
});

type CustomFinding = z.infer<typeof customFindingSchema>;

const findings = await agent.review<CustomFinding>({
  schema: z.array(customFindingSchema),
});

await pr.submitReview(
  findings.map(({ severity, category, ...finding }) => ({
    ...finding,
    message: `${category} | ${severity}\n\n${finding.message}`,
  })),
);
```

## Runtime API

For embedding Peep yourself:

```ts
import { createWebhookServer, startWebhookServer } from "peep";
```

### `startWebhookServer()`

Loads config and starts the GitHub webhook server.

```ts
await startWebhookServer({
  configPath: "peep.config.ts",
  port: 3000,
});
```

### `createWebhookServer()`

Creates a Node HTTP server from an already-loaded config.

```ts
const server = createWebhookServer({ config });
server.listen(3000);
```

### Webhook endpoint

Peep listens for GitHub webhooks at:

```text
POST /webhooks/github
```

## Local development

```sh
pnpm install
pnpm dev
```

Useful checks:

```sh
pnpm run typecheck
pnpm run test
pnpm run check
pnpm run build
```

Run with debug logs:

```sh
LOG_LEVEL=debug pnpm dev
```

## Design notes

Peep follows a ports-and-adapters structure:

- `core/` contains pure prompt/pipeline/schema logic.
- `ports/` defines interfaces and config types.
- `adapters/` implements GitHub and AI SDK integrations.
- `runtime/` wires config, adapters, and core together.

Core avoids opinionated review policy. If you want severity, confidence, deduplication, skip rules, labels, or custom summaries, define those in your config using extended schemas and handler logic.
