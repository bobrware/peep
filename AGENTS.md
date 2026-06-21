# Peep — Project Guide

## What is Peep?

Peep is a self-hosted, extensible framework for code review agents. Users write a TypeScript config file, run a process, and get a fully self-hosted alternative to CodeRabbit. The config defines GitHub App credentials, LLM settings, review rules, and event handlers that drive the review pipeline.

## Architecture

Hexagonal (ports & adapters). Dependencies point inward. Core never imports from adapters. Runtime/adapters perform I/O and translate external APIs into Peep's internal ports.

No DI container. Manual wiring in `runtime/execute.ts`. Dependencies are passed as function arguments.

```
src/
  core/                # Pure logic, no I/O, no external imports
    pipeline.ts        # Diff-only analysis pipeline (diff -> prompt -> LLM -> typed findings)
    agent.ts           # Agent-loop orchestration over abstract ports, not concrete adapters
    prompt.ts          # Prompt construction from rules + diff/context
    schema.ts          # Default Zod schemas for findings
    types.ts           # Shared types (Finding, ReviewResult, etc.)

  ports/               # Interfaces only — core defines these, adapters implement them
    vcs.ts             # fetchPullRequestDiff, submitReview, createIssueComment, etc.
    llm.ts             # generateObject-compatible structured generation port
    sandbox.ts         # sandbox session interface for agent tools and isolated command execution
    config.ts          # defineConfig types and shape

  adapters/
    github/            # GitHub App + REST API adapter
      webhook.ts       # Webhook parsing + signature verification
      api.ts           # Octokit client: diffs, issue comments, PR reviews
      context.ts       # PR context object passed to event handlers
    ai-sdk/            # LLM adapter
      provider.ts      # Wraps AI SDK generateObject / ToolLoopAgent model config
    e2b/               # E2B sandbox adapter for agent-loop code review
      sandbox.ts       # Creates ephemeral sandbox sessions and runs file/shell tools

  config/
    loader.ts          # Loads user's TS config file
    define.ts          # defineConfig() implementation — validates and returns typed config

  runtime/
    server.ts          # HTTP server, webhook endpoint, process entry point
    execute.ts         # Composition root — wires config -> adapters -> pipeline

  index.ts             # Public API exports (defineConfig, z, schemas)
```

## Key Rules

- `core/` must never import from `adapters/`. This is the primary architectural boundary.
- `ports/` contains interfaces only. No implementations, no I/O.
- Adapters depend on ports. Ports depend on core types. Core depends on nothing project-specific outside core.
- All dependencies are passed as function arguments. No singletons, no global state, no service locators.
- The composition root is `runtime/execute.ts`. This is the only file that knows about both core and concrete adapters.
- Sandbox support must be behind `ports/sandbox.ts`; do not let E2B, Vercel Sandbox, Cloudflare Sandbox, or local process details leak into core or config handlers.

## GitHub App Surface Area

Peep should assume a GitHub App installation flow, not a user OAuth token flow.

- Webhook payloads sent to a GitHub App include an `installation.id`; use it to authenticate as that installation.
- Authentication flow: create a GitHub App JWT from `appId` + private key, exchange it with `POST /app/installations/{installation_id}/access_tokens`, then call repository APIs with the installation access token. Installation tokens expire after 1 hour. Octokit can manage this exchange/refresh.
- Minimum App permissions for the MVP:
  - **Pull requests: read** to receive `pull_request` webhooks and read PR metadata/diffs.
  - **Pull requests: write** to create PR reviews and inline review comments.
  - **Contents: read** if the adapter fetches file contents or repository blobs beyond the PR diff.
  - **Issues: write** only if Peep posts conversation-level PR comments through the Issues comments API.
- Subscribe to the `pull_request` webhook for the MVP. Useful actions include `opened`, `synchronize`, `reopened`, and `ready_for_review`; MVP may handle only `opened`.
- Future comment/review events are separate subscriptions:
  - `issue_comment` is for conversation comments on issues and PRs, and requires Issues permission.
  - `pull_request_review` is for submitted/dismissed/edited PR review containers.
  - `pull_request_review_comment` is for comments on the diff, and requires Pull requests permission.
  - `pull_request_review_thread` is for review thread activity.

## GitHub Review Model

GitHub has separate comment constructs:

- **Issue comment / PR conversation comment** — endpoint `POST /repos/{owner}/{repo}/issues/{issue_number}/comments`. Every PR is an issue, but not every issue is a PR. These comments are not tied to code.
- **Pull request review** — endpoint `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`. A review is a container with an optional body, state/event (`APPROVE`, `REQUEST_CHANGES`, or `COMMENT`), and optional inline draft comments.
- **Pull request review comment** — an inline diff comment attached to a review or created directly via the PR review comments API.

Important implementation details:

- To create and submit a review in one call, send `event: "COMMENT" | "REQUEST_CHANGES" | "APPROVE"` to `POST /pulls/{pull_number}/reviews`. `body` is required for `COMMENT` and `REQUEST_CHANGES`.
- If `event` is omitted when creating a review, GitHub creates a pending review. Submit it later with `POST /pulls/{pull_number}/reviews/{review_id}/events` and an `event`.
- Inline comments need GitHub diff coordinates, not just arbitrary file lines. The older `position` field is a diff position, not a blob line number. Newer requests can use `line`, `side`, `start_line`, and `start_side`, but the target still must be a line in the PR diff.
- Findings therefore need enough location data to map to GitHub: at minimum `path`, target line, side (`RIGHT` for added/context lines, `LEFT` for deletions), and comment body. The GitHub adapter should validate/filter findings that cannot be mapped to the current diff before submitting.
- `pr.submitReview(findings)` is the high-level helper that maps findings to inline review comments and creates one GitHub review with a summary body. Users can drop down to lower-level helpers when they need issue comments or direct API control.

## Analysis Pipeline and Agent Loop

Peep has two review-analysis strategies:

- **Diff analysis** — the existing fast path: one structured LLM call over the annotated PR diff.
- **Sandbox analysis** — the agent-loop path: create an ephemeral sandbox, materialize the PR workspace, expose constrained tools, and return typed findings.

Prefer the public handler API name `agent.analyze(...)`. Avoid adding new public verbs such as `review` vs `investigate`; those names do not describe the product model well. `agent.analyze({ strategy: "diff" })` should map to the current single-call pipeline. `agent.analyze({ strategy: "sandbox" })` should run the sandbox-backed tool loop. During migration, existing `agent.review()` may remain as a compatibility alias for diff analysis, but new examples and code should use `agent.analyze()`.

Diff analysis flow:

1. GitHub App webhook received -> runtime verifies the signature and routes to a matching event handler from config.
2. Event handler calls `agent.analyze({ strategy: "diff" })` with a Zod schema.
3. Peep fetches the PR diff via the VCS port.
4. Builds a prompt from rules + diff.
5. Calls `generateObject` via the LLM port with the schema.
6. Returns typed findings to the handler.
7. Handler calls `pr.submitReview(findings)`, which maps mappable findings to inline GitHub review comments and creates/submits one review.

Sandbox analysis flow:

1. GitHub App webhook received -> runtime verifies the signature and routes to a matching event handler from config.
2. Event handler calls `agent.analyze({ strategy: "sandbox" })` with a Zod schema.
3. Runtime creates an ephemeral sandbox session through the configured sandbox port. E2B is the first target adapter.
4. Runtime materializes the PR workspace in the sandbox, preferably by cloning/checking out the PR head with a short-lived GitHub installation token. Never pass the GitHub App private key or Peep server environment into the sandbox.
5. AI SDK `ToolLoopAgent` runs with constrained tools such as `getDiff`, `listFiles`, `readFile`, `search`, and allowlisted `runCommand`.
6. The agent returns typed findings only. It must not submit GitHub comments, mutate repository state, or perform GitHub side effects directly.
7. Runtime disposes the sandbox in `finally`.
8. Handler calls `pr.submitReview(findings)` or lower-level PR helpers.

## Config Shape

Users write a single `peep.config.ts` file. The config uses an `on` object with event keys and handler functions. Each handler receives a context with the PR and an agent object.

```ts
import { defineConfig, findingSchema, z } from "peep";

export default defineConfig({
  github: {
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_PRIVATE_KEY!,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  llm: {
    provider: "openrouter",
    apiKey: process.env.OPENROUTER_KEY!,
    model: "anthropic/claude-sonnet-4",
  },
  sandbox: {
    provider: "e2b",
    apiKey: process.env.E2B_API_KEY!,
    timeoutMs: 120_000,
    maxSteps: 20,
    commands: {
      allow: [
        "ls",
        "cat",
        "sed",
        "rg",
        "git diff",
        "git status",
        "pnpm test",
        "pnpm typecheck",
        "pnpm lint",
      ],
    },
  },
  rules: ["No `any` types"],
  on: {
    "pull_request.opened": async ({ pr, agent }) => {
      const findings = await agent.analyze({
        strategy: "sandbox",
        schema: z.array(findingSchema),
      });

      await pr.submitReview(findings, {
        event: "COMMENT",
        summary: true,
      });
    },
  },
});
```

`agent.analyze()` should default to `strategy: "diff"` when no sandbox strategy is requested, so simple configs remain small.

Sandbox config is optional. If `strategy: "sandbox"` is requested without sandbox config, fail clearly before running the handler's review submission logic.

## Sandbox Agent Loop

E2B is the first sandbox provider to implement. Design the port so Vercel Sandbox, Cloudflare Sandbox, and local development sandboxes can be added without changing core behavior.

Initial sandbox port shape:

```ts
export type SandboxPort = {
  createSession(input: SandboxCreateInput): Promise<SandboxSession>;
};

export type SandboxSession = {
  id: string;
  run(command: string, options?: SandboxRunOptions): Promise<SandboxRunResult>;
  readFile(path: string): Promise<string>;
  writeFile?(path: string, contents: string): Promise<void>;
  dispose(): Promise<void>;
};
```

MVP sandbox tools should be read-oriented:

- `getDiff()` returns the annotated PR diff.
- `listFiles({ glob? })` lists workspace files.
- `readFile({ path })` reads a bounded-size file.
- `search({ query, glob? })` searches with `rg` or equivalent and bounded output.
- `runCommand({ command })` runs only allowlisted commands with time/output limits.

Do not add write-capable fixing behavior in the first sandbox milestone. If write tools are added later, they must be opt-in, isolated to a branch or patch artifact, and must not push or submit changes without explicit user configuration.

Sandbox safety defaults:

- One ephemeral sandbox per analysis run.
- Always dispose sessions in `finally`.
- Never expose Peep server env vars, GitHub App private keys, provider API keys, or webhook secrets to the sandbox.
- Use only short-lived GitHub installation tokens when a clone/fetch is required.
- Treat PR code and all sandbox output as untrusted.
- Restrict outbound network and shell commands where the provider supports it.
- Enforce max steps, wall-clock timeout, command timeout, output byte limits, file read limits, and token/cost limits.
- Redact secrets from command output before sending it back to the model or logs.
- For untrusted fork PRs, prefer diff analysis or a read-only sandbox with no dependency install/network access.

## MVP Scope

Current MVP includes the diff-analysis path, GitHub webhook handling, GitHub App auth, PR review submission, and dogfood review policy in `peep.config.ts`.

Next sandbox milestone:

- Add `agent.analyze()` as the preferred public review-analysis API.
- Keep or migrate `agent.review()` as a compatibility alias for diff analysis.
- Add `ports/sandbox.ts`.
- Add E2B sandbox adapter.
- Add AI SDK `ToolLoopAgent` orchestration for sandbox analysis.
- Add read-only tools: diff, list files, read file, search, allowlisted shell.
- Return typed findings through the configured schema.
- Keep GitHub side effects in PR helpers such as `pr.submitReview(...)`.

Still out of scope for the first sandbox milestone: write/fix agents, persistent memory, automatic duplicate suppression in core, `.md` rule file loading, multiple first-class LLM provider configs, and production packaging polish.

## Tech Stack

- TypeScript, Node.js
- AI SDK for `generateObject`, `ToolLoopAgent`, tools, and Zod schemas
- Octokit for GitHub App auth and REST API calls
- E2B for the first cloud sandbox adapter
- Zod for schema definitions and validation

## Verified References

- GitHub App webhooks: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps
- GitHub App installation tokens: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- Webhook events and payloads: https://docs.github.com/en/webhooks/webhook-events-and-payloads
- Pull request reviews REST API: https://docs.github.com/rest/pulls/reviews
- Pull request review comments REST API: https://docs.github.com/rest/pulls/comments
- Issue/PR conversation comments REST API: https://docs.github.com/rest/issues/comments
