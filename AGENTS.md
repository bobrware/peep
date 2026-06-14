# Peep — Project Guide

## What is Peep?

Peep is a self-hosted, extensible framework for code review agents. Users write a TypeScript config file, run a process, and get a fully self-hosted alternative to CodeRabbit. The config defines GitHub App credentials, LLM settings, review rules, and event handlers that drive the review pipeline.

## Architecture

Hexagonal (ports & adapters). Dependencies point inward. Core never imports from adapters. Runtime/adapters perform I/O and translate external APIs into Peep's internal ports.

No DI container. Manual wiring in `runtime/execute.ts`. Dependencies are passed as function arguments.

```
src/
  core/                # Pure logic, no I/O, no external imports
    pipeline.ts        # Review pipeline (diff -> prompt -> LLM -> typed findings)
    prompt.ts          # Prompt construction from rules + diff/context
    schema.ts          # Default Zod schemas for findings
    types.ts           # Shared types (Finding, ReviewResult, etc.)

  ports/               # Interfaces only — core defines these, adapters implement them
    vcs.ts             # fetchPullRequestDiff, submitReview, createIssueComment, etc.
    llm.ts             # generateObject-compatible structured generation port
    config.ts          # defineConfig types and shape

  adapters/
    github/            # GitHub App + REST API adapter
      webhook.ts       # Webhook parsing + signature verification
      api.ts           # Octokit client: diffs, issue comments, PR reviews
      context.ts       # PR context object passed to event handlers
    ai-sdk/            # LLM adapter
      provider.ts      # Wraps AI SDK generateObject with provider config

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

## The Pipeline

For MVP, the review pipeline is a single LLM call per PR:

1. GitHub App webhook received -> runtime verifies the signature and routes to a matching event handler from config.
2. Event handler calls `agent.review()` with a Zod schema.
3. `agent.review()` fetches the PR diff via the VCS port.
4. Builds a prompt from rules + diff.
5. Calls `generateObject` via the LLM port with the schema.
6. Returns typed findings to the handler.
7. Handler calls `pr.submitReview(findings)`, which maps mappable findings to inline GitHub review comments and creates/submits one review.

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
  rules: ["No `any` types"],
  on: {
    "pull_request.opened": async ({ pr, agent }) => {
      const findings = await agent.review({
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

## MVP Scope

- Single LLM call (no agent loop, no tools)
- GitHub App webhook server with signature verification
- `pull_request.opened` event only
- Rules as strings only (no `.md` file references yet)
- One LLM provider via AI SDK (OpenRouter)
- No custom tools, no filter hooks, no comment-response workflows
- `submitReview` with a generated summary body and inline comments for findings that map to the diff

Post-MVP additions: agent loop, custom tools, `.md` rule files, additional events/actions, review/comment reply handling, filter/pipeline hooks, multiple providers.

## Tech Stack

- TypeScript, Node.js
- AI SDK for `generateObject` with Zod schemas
- Octokit for GitHub App auth and REST API calls
- Zod for schema definitions and validation

## Verified References

- GitHub App webhooks: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps
- GitHub App installation tokens: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- Webhook events and payloads: https://docs.github.com/en/webhooks/webhook-events-and-payloads
- Pull request reviews REST API: https://docs.github.com/rest/pulls/reviews
- Pull request review comments REST API: https://docs.github.com/rest/pulls/comments
- Issue/PR conversation comments REST API: https://docs.github.com/rest/issues/comments
