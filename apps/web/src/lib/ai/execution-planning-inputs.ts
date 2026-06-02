import { buildQuoteExecutionPlanningContext } from "@/lib/ai/quote-execution-planning-context";

type QuoteLinePlanningInput = {
  internalNotes?: string | null;
  customerScopeTitle?: string | null;
  customerScopeDescription?: string | null;
  customerIncludedNotes?: string | null;
  customerExcludedNotes?: string | null;
  quote?: {
    internalNotes?: string | null;
    lead?: { notes?: string | null } | null;
  } | null;
};

type BuildQuoteLinePlanningContextArgs = {
  line: QuoteLinePlanningInput;
  userInstructions?: string | null;
  priorMissingContext?: string[];
};

export function buildQuoteLineExecutionPlanningContextFromLine(
  args: BuildQuoteLinePlanningContextArgs,
): string | undefined {
  return buildQuoteExecutionPlanningContext({
    userInstructions: args.userInstructions,
    lineInternalNotes: args.line.internalNotes,
    customerScopeTitle: args.line.customerScopeTitle,
    customerScopeDescription: args.line.customerScopeDescription,
    customerIncludedNotes: args.line.customerIncludedNotes,
    customerExcludedNotes: args.line.customerExcludedNotes,
    quoteInternalNotes: args.line.quote?.internalNotes,
    leadNotes: args.line.quote?.lead?.notes ?? null,
    priorMissingContext: args.priorMissingContext,
  });
}

export function buildTemplateExecutionPlanningContext(
  description: string,
  userInstructions?: string | null,
): string | undefined {
  const trimmedDescription = description.trim();
  const trimmedInstructions = userInstructions?.trim() ?? "";
  const blocks: string[] = [];

  if (trimmedDescription.length > 0) {
    blocks.push(`Template scope:\n${trimmedDescription}`);
  }
  if (trimmedInstructions.length > 0) {
    blocks.push(`User clarifications:\n${trimmedInstructions}`);
  }

  if (blocks.length === 0) {
    return undefined;
  }
  return blocks.join("\n\n---\n\n");
}
