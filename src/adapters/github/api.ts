import { App } from "octokit";
import type { ReviewFinding } from "../../core/schema.js";
import type {
  PullRequestContext,
  ReactionContent,
  ReviewComment,
  SubmitReviewOptions,
} from "../../ports/config.js";
import type { VcsPort } from "../../ports/vcs.js";
import { logger as defaultLogger, type PeepLogger } from "../../runtime/logger.js";
import { mapFindingsToReviewComments } from "./diff.js";

export type GitHubPullRequestAdapter = VcsPort &
  PullRequestContext & {
    react: (content: ReactionContent) => Promise<void>;
    submitReview: <TFinding extends ReviewFinding>(
      findings: TFinding[],
      options?: SubmitReviewOptions,
    ) => Promise<void>;
  };

export type GitHubApiClient = {
  request: (route: string, parameters: Record<string, unknown>) => Promise<unknown>;
};

export type CreateGitHubPullRequestAdapterOptions = {
  appId: string;
  privateKey: string;
  installationId: number;
  owner: string;
  repo: string;
  pullNumber: number;
  title: string;
  body: string;
  author: string;
  draft: boolean;
  client?: GitHubApiClient;
  logger?: PeepLogger;
};

export async function createGitHubPullRequestAdapter({
  appId,
  privateKey,
  installationId,
  owner,
  repo,
  pullNumber,
  title,
  body,
  author,
  draft,
  client,
  logger = defaultLogger,
}: CreateGitHubPullRequestAdapterOptions): Promise<GitHubPullRequestAdapter> {
  const apiClient =
    client ?? (await createInstallationClient({ appId, privateKey, installationId }));

  const adapter: GitHubPullRequestAdapter = {
    owner,
    repo,
    number: pullNumber,
    title,
    body,
    author,
    draft,

    async fetchPullRequestDiff() {
      const response = await apiClient.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner,
        repo,
        pull_number: pullNumber,
        headers: {
          accept: "application/vnd.github.v3.diff",
        },
      });

      return getStringData(response);
    },

    async comment(body) {
      logger.info({ owner, repo, pullNumber }, "creating pull request comment");

      await apiClient.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
        owner,
        repo,
        issue_number: pullNumber,
        body,
      });
    },

    async listReviewComments() {
      const response = await apiClient.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
        {
          owner,
          repo,
          pull_number: pullNumber,
        },
      );

      return getReviewComments(response);
    },

    async react(content) {
      logger.info({ owner, repo, pullNumber, content }, "reacting to pull request");

      await apiClient.request("POST /repos/{owner}/{repo}/issues/{issue_number}/reactions", {
        owner,
        repo,
        issue_number: pullNumber,
        content,
        headers: {
          accept: "application/vnd.github+json",
        },
      });
    },

    async submitReview(findings, options = {}) {
      const diff = await adapter.fetchPullRequestDiff();
      const comments = mapFindingsToReviewComments(findings, diff);

      logger.info(
        {
          owner,
          repo,
          pullNumber,
          findings: findings.length,
          inlineComments: comments.length,
        },
        "submitting pull request review",
      );

      await apiClient.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
        owner,
        repo,
        pull_number: pullNumber,
        event: options.event ?? "COMMENT",
        body: buildReviewBody(findings, options),
        comments,
      });
    },
  };

  return adapter;
}

async function createInstallationClient({
  appId,
  privateKey,
  installationId,
}: Pick<
  CreateGitHubPullRequestAdapterOptions,
  "appId" | "privateKey" | "installationId"
>): Promise<GitHubApiClient> {
  const app = new App({ appId, privateKey });

  return app.getInstallationOctokit(installationId);
}

function buildReviewBody(findings: ReviewFinding[], options: SubmitReviewOptions): string {
  if (typeof options.summary === "string") {
    return options.summary;
  }

  if (findings.length === 0) {
    return "Peep found no issues.";
  }

  return `Peep found ${findings.length} issue${findings.length === 1 ? "" : "s"}.`;
}

function getReviewComments(response: unknown): ReviewComment[] {
  if (!isObject(response) || !Array.isArray(response.data)) {
    throw new Error("GitHub review comments response did not contain array data.");
  }

  return response.data.flatMap((comment) => {
    if (!isObject(comment) || typeof comment.id !== "number" || typeof comment.body !== "string") {
      return [];
    }

    return [
      {
        id: comment.id,
        body: comment.body,
        path: typeof comment.path === "string" ? comment.path : undefined,
        line: typeof comment.line === "number" ? comment.line : undefined,
        side: comment.side === "LEFT" || comment.side === "RIGHT" ? comment.side : undefined,
        author: getCommentAuthor(comment),
      },
    ];
  });
}

function getCommentAuthor(comment: Record<string, unknown>): string | undefined {
  const user = comment.user;

  return isObject(user) && typeof user.login === "string" ? user.login : undefined;
}

function getStringData(response: unknown): string {
  if (
    typeof response === "object" &&
    response !== null &&
    "data" in response &&
    typeof response.data === "string"
  ) {
    return response.data;
  }

  throw new Error("GitHub pull request diff response did not contain string data.");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
