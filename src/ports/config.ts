import type { Finding, ReviewFinding } from "../core/schema.js";
import type { FlexibleSchema } from "ai";

export type PullRequestEventContext = {
  pr: PullRequestContext;
  agent: ReviewAgent;
};

export type PullRequestReviewCommentEventContext = PullRequestEventContext & {
  comment: ReviewComment;
};

export type PullRequestOpenedContext = PullRequestEventContext;
export type PullRequestReadyForReviewContext = PullRequestEventContext;
export type PullRequestSynchronizeContext = PullRequestEventContext;
export type PullRequestReviewCommentCreatedContext = PullRequestReviewCommentEventContext;

export type PullRequestContext = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  draft: boolean;
  fetchDiff: () => Promise<string>;
  comment: (body: string) => Promise<void>;
  getReviewComment: (commentId: number) => Promise<ReviewComment>;
  listReviewComments: () => Promise<ReviewComment[]>;
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

export type ReviewComment = {
  id: number;
  body: string;
  inReplyToId?: number;
  path?: string;
  line?: number;
  side?: "LEFT" | "RIGHT";
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
  originalLine?: number;
  originalStartLine?: number;
  diffHunk?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
  htmlUrl?: string;
};

export type ReviewCommentDraft = {
  path: string;
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
  line: number;
  side: "LEFT" | "RIGHT";
  body: string;
};

export type ReviewThread = {
  id: string;
  isResolved: boolean;
  comments: ReviewComment[];
};

export type ReactionContent =
  | "+1"
  | "-1"
  | "laugh"
  | "confused"
  | "heart"
  | "hooray"
  | "rocket"
  | "eyes";

export type ReviewAgent = {
  analyze: <TFinding extends ReviewFinding = Finding>(
    options?: AnalyzeOptions,
  ) => Promise<TFinding[]>;
  review: <TFinding extends ReviewFinding = Finding>(
    options?: ReviewOptions,
  ) => Promise<TFinding[]>;
};

export type AnalysisStrategy = "diff" | "sandbox";

export type AnalyzeOptions = {
  strategy?: AnalysisStrategy;
  schema?: FlexibleSchema;
};

export type ReviewOptions = Omit<AnalyzeOptions, "strategy">;

export type SubmitReviewOptions = {
  event?: "COMMENT" | "REQUEST_CHANGES" | "APPROVE";
  summary?: boolean | string;
};

export type PeepConfig = {
  github: {
    appId: string;
    privateKey: string;
    webhookSecret: string;
  };
  llm: {
    provider: "openrouter";
    apiKey: string;
    model: string;
    timeoutMs?: number;
  };
  sandbox?: {
    provider: "e2b";
    apiKey: string;
    timeoutMs?: number;
    maxSteps?: number;
    commands?: {
      allow?: string[];
    };
  };
  rules: string[];
  on: {
    "pull_request.opened"?: (context: PullRequestOpenedContext) => Promise<void> | void;
    "pull_request.ready_for_review"?: (
      context: PullRequestReadyForReviewContext,
    ) => Promise<void> | void;
    "pull_request.synchronize"?: (context: PullRequestSynchronizeContext) => Promise<void> | void;
    "pull_request_review_comment.created"?: (
      context: PullRequestReviewCommentCreatedContext,
    ) => Promise<void> | void;
  };
};
