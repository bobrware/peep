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
  | GitHubPullRequestSynchronizeEvent;

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
  if (event !== "pull_request" || !isObject(payload)) {
    return undefined;
  }

  const pullRequestPayload = payload as PullRequestPayload;

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
