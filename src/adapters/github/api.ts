import { App } from "octokit";
import type { ReviewFinding } from "../../core/schema.js";
import type {
  PullRequestContext,
  ReactionContent,
  ReviewComment,
  ReviewCommentDraft,
  ReviewThread,
  SubmitReviewOptions,
} from "../../ports/config.js";
import type { VcsPort } from "../../ports/vcs.js";
import { logger as defaultLogger, type PeepLogger } from "../../runtime/logger.js";
import { mapFindingsToReviewComments } from "./diff.js";

export type GitHubPullRequestAdapter = VcsPort &
  PullRequestContext & {
    getReviewComment: (commentId: number) => Promise<ReviewComment>;
    listReviewThreads: () => Promise<ReviewThread[]>;
    react: (content: ReactionContent) => Promise<void>;
    replyToReviewComment: (commentId: number, body: string) => Promise<ReviewComment>;
    resolveReviewThread: (threadId: string) => Promise<void>;
    submitReviewComments: (
      comments: ReviewCommentDraft[],
      options?: SubmitReviewOptions,
    ) => Promise<void>;
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

    async fetchDiff() {
      return adapter.fetchPullRequestDiff();
    },

    async fetchPullRequestDiff() {
      logger.info({ owner, repo, pullNumber }, "fetching pull request diff");

      const response = await apiClient.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner,
        repo,
        pull_number: pullNumber,
        headers: {
          accept: "application/vnd.github.v3.diff",
        },
      });

      const diff = getStringData(response);

      logger.info(
        { owner, repo, pullNumber, bytes: Buffer.byteLength(diff) },
        "fetched pull request diff",
      );

      return diff;
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

    async getReviewComment(commentId) {
      logger.info({ owner, repo, pullNumber, commentId }, "getting pull request review comment");

      const response = await apiClient.request(
        "GET /repos/{owner}/{repo}/pulls/comments/{comment_id}",
        {
          owner,
          repo,
          comment_id: commentId,
        },
      );
      const comment = getReviewComment(response);

      logger.info({ owner, repo, pullNumber, commentId }, "got pull request review comment");

      return comment;
    },

    async listReviewComments() {
      logger.info({ owner, repo, pullNumber }, "listing pull request review comments");

      const response = await apiClient.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
        {
          owner,
          repo,
          pull_number: pullNumber,
        },
      );

      const comments = getReviewComments(response);

      logger.info(
        { owner, repo, pullNumber, reviewComments: comments.length },
        "listed pull request review comments",
      );

      return comments;
    },

    async listReviewThreads() {
      logger.info({ owner, repo, pullNumber }, "listing pull request review threads");

      const response = await apiClient.request("POST /graphql", {
        query: listReviewThreadsQuery,
        variables: { owner, repo, pullNumber },
      });
      const threads = getReviewThreads(response);

      logger.info(
        { owner, repo, pullNumber, reviewThreads: threads.length },
        "listed pull request review threads",
      );

      return threads;
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

    async replyToReviewComment(commentId, body) {
      logger.info(
        { owner, repo, pullNumber, commentId },
        "replying to pull request review comment",
      );

      const response = await apiClient.request(
        "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies",
        {
          owner,
          repo,
          pull_number: pullNumber,
          comment_id: commentId,
          body,
        },
      );
      const comment = getReviewComment(response);

      logger.info(
        { owner, repo, pullNumber, commentId, replyCommentId: comment.id },
        "replied to pull request review comment",
      );

      return comment;
    },

    async resolveReviewThread(threadId) {
      logger.info({ owner, repo, pullNumber, threadId }, "resolving pull request review thread");

      await apiClient.request("POST /graphql", {
        query: resolveReviewThreadMutation,
        variables: { threadId },
      });

      logger.info({ owner, repo, pullNumber, threadId }, "resolved pull request review thread");
    },

    async submitReviewComments(comments, options = {}) {
      logger.info(
        {
          owner,
          repo,
          pullNumber,
          inlineComments: comments.length,
        },
        "submitting pull request review comments",
      );

      await apiClient.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
        owner,
        repo,
        pull_number: pullNumber,
        event: options.event ?? "COMMENT",
        body: buildReviewCommentsBody(comments, options),
        comments: comments.map(toGitHubReviewComment),
      });

      logger.info(
        { owner, repo, pullNumber, inlineComments: comments.length },
        "submitted pull request review comments",
      );
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

      logger.info(
        { owner, repo, pullNumber, findings: findings.length, inlineComments: comments.length },
        "submitted pull request review",
      );
    },
  };

  return adapter;
}

const listReviewThreadsQuery = `
  query PeepReviewThreads($owner: String!, $repo: String!, $pullNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pullNumber) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 100) {
              nodes {
                databaseId
                body
                author { login }
                path
                line
                diffHunk
                createdAt
                updatedAt
                url
              }
            }
          }
        }
      }
    }
  }
`;

const resolveReviewThreadMutation = `
  mutation PeepResolveReviewThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }
`;

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

function buildReviewCommentsBody(
  comments: ReviewCommentDraft[],
  options: SubmitReviewOptions,
): string {
  if (typeof options.summary === "string") {
    return options.summary;
  }

  if (comments.length === 0) {
    return "Peep found no issues.";
  }

  return `Peep found ${comments.length} issue${comments.length === 1 ? "" : "s"}.`;
}

function toGitHubReviewComment(comment: ReviewCommentDraft): {
  path: string;
  start_line?: number;
  start_side?: "LEFT" | "RIGHT";
  line: number;
  side: "LEFT" | "RIGHT";
  body: string;
} {
  return {
    path: comment.path,
    start_line: comment.startLine,
    start_side: comment.startSide,
    line: comment.line,
    side: comment.side,
    body: comment.body,
  };
}

function getReviewComments(response: unknown): ReviewComment[] {
  if (!isObject(response) || !Array.isArray(response.data)) {
    throw new Error("GitHub review comments response did not contain array data.");
  }

  return response.data.flatMap((comment) => {
    return isReviewCommentData(comment) ? [toReviewComment(comment)] : [];
  });
}

function getReviewComment(response: unknown): ReviewComment {
  if (!isObject(response) || !isReviewCommentData(response.data)) {
    throw new Error("GitHub review comment response did not contain comment data.");
  }

  return toReviewComment(response.data);
}

function getReviewThreads(response: unknown): ReviewThread[] {
  const nodes = getGraphqlReviewThreadNodes(response);

  return nodes.flatMap((node) => {
    if (!isObject(node) || typeof node.id !== "string" || typeof node.isResolved !== "boolean") {
      return [];
    }

    return [
      {
        id: node.id,
        isResolved: node.isResolved,
        comments: getGraphqlReviewThreadComments(node),
      },
    ];
  });
}

function getGraphqlReviewThreadNodes(response: unknown): unknown[] {
  if (!isObject(response) || !isObject(response.data)) {
    throw new Error("GitHub review threads response did not contain data.");
  }

  const repository = response.data.repository;
  const pullRequest = isObject(repository) ? repository.pullRequest : undefined;
  const reviewThreads = isObject(pullRequest) ? pullRequest.reviewThreads : undefined;
  const nodes = isObject(reviewThreads) ? reviewThreads.nodes : undefined;

  if (!Array.isArray(nodes)) {
    throw new Error("GitHub review threads response did not contain thread nodes.");
  }

  return nodes;
}

function getGraphqlReviewThreadComments(thread: Record<string, unknown>): ReviewComment[] {
  const comments = thread.comments;
  const nodes = isObject(comments) ? comments.nodes : undefined;

  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes.flatMap((comment) => {
    return isGraphqlReviewCommentData(comment) ? [toGraphqlReviewComment(comment)] : [];
  });
}

function toGraphqlReviewComment(comment: Record<string, unknown>): ReviewComment {
  const author = comment.author;

  return {
    id: comment.databaseId as number,
    body: comment.body as string,
    path: typeof comment.path === "string" ? comment.path : undefined,
    line: typeof comment.line === "number" ? comment.line : undefined,
    diffHunk: typeof comment.diffHunk === "string" ? comment.diffHunk : undefined,
    author: isObject(author) && typeof author.login === "string" ? author.login : undefined,
    createdAt: typeof comment.createdAt === "string" ? comment.createdAt : undefined,
    updatedAt: typeof comment.updatedAt === "string" ? comment.updatedAt : undefined,
    url: typeof comment.url === "string" ? comment.url : undefined,
  };
}

function isGraphqlReviewCommentData(value: unknown): value is Record<string, unknown> {
  return isObject(value) && typeof value.databaseId === "number" && typeof value.body === "string";
}

function toReviewComment(comment: Record<string, unknown>): ReviewComment {
  return {
    id: comment.id as number,
    body: comment.body as string,
    inReplyToId: typeof comment.in_reply_to_id === "number" ? comment.in_reply_to_id : undefined,
    path: typeof comment.path === "string" ? comment.path : undefined,
    line: typeof comment.line === "number" ? comment.line : undefined,
    side: comment.side === "LEFT" || comment.side === "RIGHT" ? comment.side : undefined,
    startLine: typeof comment.start_line === "number" ? comment.start_line : undefined,
    startSide:
      comment.start_side === "LEFT" || comment.start_side === "RIGHT"
        ? comment.start_side
        : undefined,
    originalLine: typeof comment.original_line === "number" ? comment.original_line : undefined,
    originalStartLine:
      typeof comment.original_start_line === "number" ? comment.original_start_line : undefined,
    diffHunk: typeof comment.diff_hunk === "string" ? comment.diff_hunk : undefined,
    author: getCommentAuthor(comment),
    createdAt: typeof comment.created_at === "string" ? comment.created_at : undefined,
    updatedAt: typeof comment.updated_at === "string" ? comment.updated_at : undefined,
    url: typeof comment.url === "string" ? comment.url : undefined,
    htmlUrl: typeof comment.html_url === "string" ? comment.html_url : undefined,
  };
}

function isReviewCommentData(value: unknown): value is Record<string, unknown> {
  return isObject(value) && typeof value.id === "number" && typeof value.body === "string";
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
