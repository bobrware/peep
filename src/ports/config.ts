import type { Finding } from "../core/schema.js";

export type PullRequestOpenedContext = {
  pr: PullRequestContext;
  agent: ReviewAgent;
};

export type PullRequestContext = {
  submitReview: (findings: Finding[], options?: SubmitReviewOptions) => Promise<void>;
};

export type ReviewAgent = {
  review: (options?: ReviewOptions) => Promise<Finding[]>;
};

export type ReviewOptions = {
  schema?: unknown;
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
