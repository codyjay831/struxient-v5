/** Shared quote-line execution types — safe for client imports (no server actions). */
import type { ExecutionContextAssessment } from "@/lib/ai/execution-context-assessment-schema";

export type QuoteLineExecutionFormState = {
  error?: string;
  warnings?: string[];
};

export type QuoteLineExecutionRevalidateScope = "quote" | "execution-review";

export type QuoteLineExecutionAiApplyMode = "append" | "replace";

export type QuoteLineExecutionAiGenerateOptions = {
  userInstructions?: string;
  priorMissingContext?: string[];
};

export type QuoteLineExecutionAiApplyOptions = {
  mode?: QuoteLineExecutionAiApplyMode;
  keepTaskIds?: string[];
  revalidateScope?: QuoteLineExecutionRevalidateScope;
};

export type { ExecutionContextAssessment };
