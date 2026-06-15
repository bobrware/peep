import type { Finding, ReviewFinding } from "../core/schema.js";
import type { FlexibleSchema } from "ai";

export type PullRequestOpenedContext = {
  pr: PullRequestContext;
  agent: ReviewAgent;
};

export type PullRequestContext = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  draft: boolean;
  comment: (body: string) => Promise<void>;
  react: (content: ReactionContent) => Promise<void>;
  submitReview: <TFinding extends ReviewFinding>(
    findings: TFinding[],
    options?: SubmitReviewOptions,
  ) => Promise<void>;
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
  review: <TFinding extends ReviewFinding = Finding>(
    options?: ReviewOptions,
  ) => Promise<TFinding[]>;
};

export type ReviewOptions = {
  schema?: FlexibleSchema;
};

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
  };
  rules: string[];
  on: {
    "pull_request.opened"?: (context: PullRequestOpenedContext) => Promise<void> | void;
  };
};
