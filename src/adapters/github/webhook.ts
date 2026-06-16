import { createHmac, timingSafeEqual } from "node:crypto";

export type VerifyGitHubSignatureOptions = {
  secret: string;
  payload: string | Buffer;
  signature: string | undefined;
};

export type GitHubPullRequestEvent = {
  type: "pull_request.opened" | "pull_request.ready_for_review" | "pull_request.synchronize";
  installationId: number;
  repository: {
    owner: string;
    name: string;
  };
  pullRequest: {
    number: number;
    title: string;
    body: string;
    author: string;
    draft: boolean;
  };
};

export type GitHubReviewCommentEvent = Omit<GitHubPullRequestEvent, "type"> & {
  type: "pull_request_review_comment.created";
  comment: {
    id: number;
    body: string;
    author: string;
    inReplyToId?: number;
    path?: string;
    line?: number;
    side?: "LEFT" | "RIGHT";
    diffHunk?: string;
    createdAt?: string;
    updatedAt?: string;
    url?: string;
    htmlUrl?: string;
  };
};

export type GitHubPullRequestOpenedEvent = GitHubPullRequestEvent & {
  type: "pull_request.opened";
};

export type GitHubPullRequestReadyForReviewEvent = GitHubPullRequestEvent & {
  type: "pull_request.ready_for_review";
};

export type GitHubPullRequestSynchronizeEvent = GitHubPullRequestEvent & {
  type: "pull_request.synchronize";
};

export type GitHubWebhookEvent =
  | GitHubPullRequestOpenedEvent
  | GitHubPullRequestReadyForReviewEvent
  | GitHubPullRequestSynchronizeEvent
  | GitHubReviewCommentEvent;

export type ParseGitHubWebhookOptions = {
  event: string;
  payload: unknown;
};

type PullRequestPayload = {
  action?: string;
  installation?: { id?: number };
  repository?: {
    name?: string;
    owner?: { login?: string };
  };
  pull_request?: {
    number?: number;
    title?: string;
    body?: string | null;
    draft?: boolean;
    user?: { login?: string };
  };
  comment?: {
    id?: number;
    body?: string;
    in_reply_to_id?: number;
    path?: string;
    line?: number;
    side?: string;
    diff_hunk?: string;
    created_at?: string;
    updated_at?: string;
    url?: string;
    html_url?: string;
    user?: { login?: string };
  };
};

export function verifyGitHubSignature({
  secret,
  payload,
  signature,
}: VerifyGitHubSignatureOptions): boolean {
  if (signature === undefined || !signature.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

  return timingSafeEqualString(signature, expectedSignature);
}

export function parseGitHubWebhook({
  event,
  payload,
}: ParseGitHubWebhookOptions): GitHubWebhookEvent | undefined {
  if (!isObject(payload)) {
    return undefined;
  }

  const pullRequestPayload = payload as PullRequestPayload;

  if (event === "pull_request_review_comment") {
    return parseReviewCommentEvent(pullRequestPayload);
  }

  if (event !== "pull_request") {
    return undefined;
  }

  const type = mapPullRequestAction(pullRequestPayload.action);

  if (type === undefined) {
    return undefined;
  }

  const installationId = pullRequestPayload.installation?.id;
  const owner = pullRequestPayload.repository?.owner?.login;
  const name = pullRequestPayload.repository?.name;
  const number = pullRequestPayload.pull_request?.number;
  const title = pullRequestPayload.pull_request?.title;
  const body = pullRequestPayload.pull_request?.body;
  const draft = pullRequestPayload.pull_request?.draft ?? false;
  const author = pullRequestPayload.pull_request?.user?.login;

  if (
    installationId === undefined ||
    owner === undefined ||
    name === undefined ||
    number === undefined ||
    title === undefined ||
    author === undefined
  ) {
    throw new Error(`Invalid ${type} webhook payload.`);
  }

  return {
    type,
    ...parsePullRequestPayload(type, pullRequestPayload),
  } as GitHubWebhookEvent;
}

function parseReviewCommentEvent(
  payload: PullRequestPayload,
): GitHubReviewCommentEvent | undefined {
  if (payload.action !== "created") {
    return undefined;
  }

  const pullRequestEvent = parsePullRequestPayload("pull_request_review_comment.created", payload);
  const comment = payload.comment;
  const commentId = comment?.id;
  const commentBody = comment?.body;
  const commentAuthor = comment?.user?.login;

  if (
    comment === undefined ||
    commentId === undefined ||
    commentBody === undefined ||
    commentAuthor === undefined
  ) {
    throw new Error("Invalid pull_request_review_comment.created webhook payload.");
  }

  return {
    ...pullRequestEvent,
    type: "pull_request_review_comment.created",
    comment: {
      id: commentId,
      body: commentBody,
      author: commentAuthor,
      inReplyToId: comment.in_reply_to_id,
      path: comment.path,
      line: comment.line,
      side: comment.side === "LEFT" || comment.side === "RIGHT" ? comment.side : undefined,
      diffHunk: comment.diff_hunk,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      url: comment.url,
      htmlUrl: comment.html_url,
    },
  };
}

function parsePullRequestPayload(
  type: string,
  payload: PullRequestPayload,
): Omit<GitHubPullRequestEvent, "type"> {
  const installationId = payload.installation?.id;
  const owner = payload.repository?.owner?.login;
  const name = payload.repository?.name;
  const number = payload.pull_request?.number;
  const title = payload.pull_request?.title;
  const body = payload.pull_request?.body;
  const draft = payload.pull_request?.draft ?? false;
  const author = payload.pull_request?.user?.login;

  if (
    installationId === undefined ||
    owner === undefined ||
    name === undefined ||
    number === undefined ||
    title === undefined ||
    author === undefined
  ) {
    throw new Error(`Invalid ${type} webhook payload.`);
  }

  return {
    installationId,
    repository: { owner, name },
    pullRequest: { number, title, body: body ?? "", author, draft },
  };
}

function mapPullRequestAction(action: string | undefined): GitHubWebhookEvent["type"] | undefined {
  if (action === "opened") {
    return "pull_request.opened";
  }

  if (action === "ready_for_review") {
    return "pull_request.ready_for_review";
  }

  if (action === "synchronize") {
    return "pull_request.synchronize";
  }

  return undefined;
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
