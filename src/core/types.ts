import type { ReviewFinding } from "./schema.js";

export type ReviewResult<TFinding extends ReviewFinding = ReviewFinding> = TFinding[];
