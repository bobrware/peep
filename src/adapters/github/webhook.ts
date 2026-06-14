import { createHmac, timingSafeEqual } from "node:crypto";

export type VerifyGitHubSignatureOptions = {
  secret: string;
  payload: string | Buffer;
  signature: string | undefined;
};

export type GitHubPullRequestOpenedEvent = {
  type: "pull_request.opened";
  installationId: number;
  repository: {
    owner: string;
    name: string;
  };
  pullRequest: {
    number: number;
  };
};

export type GitHubWebhookEvent = GitHubPullRequestOpenedEvent;

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
  pull_request?: { number?: number };
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

  if (pullRequestPayload.action !== "opened") {
    return undefined;
  }

  const installationId = pullRequestPayload.installation?.id;
  const owner = pullRequestPayload.repository?.owner?.login;
  const name = pullRequestPayload.repository?.name;
  const number = pullRequestPayload.pull_request?.number;

  if (
    installationId === undefined ||
    owner === undefined ||
    name === undefined ||
    number === undefined
  ) {
    throw new Error("Invalid pull_request.opened webhook payload.");
  }

  return {
    type: "pull_request.opened",
    installationId,
    repository: { owner, name },
    pullRequest: { number },
  };
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
