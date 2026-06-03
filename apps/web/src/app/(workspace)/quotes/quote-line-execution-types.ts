/** Shared quote-line execution types — safe for client imports (no server actions). */
import type { ExecutionContextAssessment } from "@/lib/ai/execution-context-assessment-schema";
import type {
  ExecutionPlanningContextBucket,
  ExecutionPlanningContextManifest,
  ExecutionPlanningContextSourceFlags,
} from "@/lib/ai/quote-execution-planning-context";

export type QuoteLineExecutionFormState = {
  error?: string;
  warnings?: string[];
};

export type QuoteLineExecutionRevalidateScope = "quote" | "execution-review";

export type QuoteLineExecutionAiApplyMode = "append" | "replace";

export type QuoteLineExecutionAiGenerateOptions = {
  userInstructions?: string;
  priorMissingContext?: string[];
  sourceFlags?: ExecutionPlanningContextSourceFlags;
  itemOverrides?: Record<
    string,
    {
      include?: boolean;
      bucket?: ExecutionPlanningContextBucket;
    }
  >;
};

export type QuoteLineExecutionAiApplyOptions = {
  mode?: QuoteLineExecutionAiApplyMode;
  keepTaskIds?: string[];
  revalidateScope?: QuoteLineExecutionRevalidateScope;
};

export type { ExecutionContextAssessment };
export type {
  ExecutionPlanningContextBucket,
  ExecutionPlanningContextManifest,
  ExecutionPlanningContextSourceFlags,
};
