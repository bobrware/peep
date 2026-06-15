import { App } from "octokit";
import type { Finding } from "../../core/schema.js";
import type { ReactionContent, SubmitReviewOptions } from "../../ports/config.js";
import type { VcsPort } from "../../ports/vcs.js";
import { logger as defaultLogger, type PeepLogger } from "../../runtime/logger.js";
import { mapFindingsToReviewComments } from "./diff.js";

export type GitHubPullRequestAdapter = VcsPort & {
  react: (content: ReactionContent) => Promise<void>;
  submitReview: (findings: Finding[], options?: SubmitReviewOptions) => Promise<void>;
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
  client,
  logger = defaultLogger,
}: CreateGitHubPullRequestAdapterOptions): Promise<GitHubPullRequestAdapter> {
  const apiClient =
    client ?? (await createInstallationClient({ appId, privateKey, installationId }));

  const adapter: GitHubPullRequestAdapter = {
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
        { owner, repo, pullNumber, findings: findings.length, inlineComments: comments.length },
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

function buildReviewBody(findings: Finding[], options: SubmitReviewOptions): string {
  if (typeof options.summary === "string") {
    return options.summary;
  }

  if (findings.length === 0) {
    return "Peep found no issues.";
  }

  return `Peep found ${findings.length} issue${findings.length === 1 ? "" : "s"}.`;
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
