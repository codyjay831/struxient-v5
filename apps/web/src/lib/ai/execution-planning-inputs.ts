import {
  buildQuoteExecutionPlanningContext,
  buildQuoteExecutionPlanningContextManifest,
  type ExecutionPlanningContextItemOverride,
  type ExecutionPlanningContextManifest,
  type ExecutionPlanningContextSourceFlags,
} from "@/lib/ai/quote-execution-planning-context";

type QuoteLinePlanningInput = {
  internalNotes?: string | null;
  customerScopeTitle?: string | null;
  customerScopeDescription?: string | null;
  customerIncludedNotes?: string | null;
  customerExcludedNotes?: string | null;
  quote?: {
    internalNotes?: string | null;
    lead?: { notes?: string | null } | null;
    serviceLocation?: {
      apn?: string | null;
      apnSourceTitle?: string | null;
      detailsStatus?:
        | "DATABASE_MATCH"
        | "AI_FOUND"
        | "USER_REVIEWED"
        | "USER_CORRECTED"
        | "UNVERIFIED"
        | "CONFLICT"
        | "STALE"
        | null;
      utility?: { name?: string | null } | null;
      jurisdiction?: { name?: string | null } | null;
    } | null;
  } | null;
};

type BuildQuoteLinePlanningContextArgs = {
  line: QuoteLinePlanningInput;
  userInstructions?: string | null;
  priorMissingContext?: string[];
  sourceFlags?: ExecutionPlanningContextSourceFlags;
  itemOverrides?: Record<string, ExecutionPlanningContextItemOverride>;
};

export function buildQuoteLineExecutionPlanningContextFromLine(
  args: BuildQuoteLinePlanningContextArgs,
): string | undefined {
  const siteDetails = args.line.quote?.serviceLocation ?? null;
  const siteDetailsSummaryParts = [
    siteDetails?.detailsStatus ? `Status: ${siteDetails.detailsStatus}` : null,
    siteDetails?.apn?.trim()
      ? siteDetails.detailsStatus === "AI_FOUND"
        ? `APN: ${siteDetails.apn.trim()} — AI candidate${siteDetails.apnSourceTitle ? ` from ${siteDetails.apnSourceTitle}` : ""}; not yet user reviewed.`
        : `APN (${siteDetails.detailsStatus ?? "UNVERIFIED"}): ${siteDetails.apn.trim()}`
      : null,
    siteDetails?.utility?.name
      ? `Utility (${siteDetails.detailsStatus ?? "UNVERIFIED"}): ${siteDetails.utility.name}`
      : null,
    siteDetails?.jurisdiction?.name
      ? `Jurisdiction (${siteDetails.detailsStatus ?? "UNVERIFIED"}): ${siteDetails.jurisdiction.name}`
      : null,
  ].filter((item): item is string => Boolean(item));
  const siteDetailsSummary =
    siteDetailsSummaryParts.length > 0 ? siteDetailsSummaryParts.map((line) => `- ${line}`).join("\n") : null;
  const siteDetailsUnresolved = [
    siteDetails?.apn?.trim() ? null : "APN not verified for this site",
    siteDetails?.utility?.name && siteDetails.detailsStatus !== "AI_FOUND"
      ? null
      : "Utility assignment not verified for this site",
    siteDetails?.jurisdiction?.name ? null : "Jurisdiction assignment not verified for this site",
  ].filter((item): item is string => Boolean(item));

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
    siteDetailsSummary,
    siteDetailsUnresolved,
  }, {
    sourceFlags: args.sourceFlags,
    itemOverrides: args.itemOverrides,
  });
}

export function buildQuoteLineExecutionPlanningContextManifestFromLine(
  args: BuildQuoteLinePlanningContextArgs,
): ExecutionPlanningContextManifest {
  const siteDetails = args.line.quote?.serviceLocation ?? null;
  const siteDetailsSummaryParts = [
    siteDetails?.detailsStatus ? `Status: ${siteDetails.detailsStatus}` : null,
    siteDetails?.apn?.trim()
      ? siteDetails.detailsStatus === "AI_FOUND"
        ? `APN: ${siteDetails.apn.trim()} — AI candidate${siteDetails.apnSourceTitle ? ` from ${siteDetails.apnSourceTitle}` : ""}; not yet user reviewed.`
        : `APN (${siteDetails.detailsStatus ?? "UNVERIFIED"}): ${siteDetails.apn.trim()}`
      : null,
    siteDetails?.utility?.name
      ? `Utility (${siteDetails.detailsStatus ?? "UNVERIFIED"}): ${siteDetails.utility.name}`
      : null,
    siteDetails?.jurisdiction?.name
      ? `Jurisdiction (${siteDetails.detailsStatus ?? "UNVERIFIED"}): ${siteDetails.jurisdiction.name}`
      : null,
  ].filter((item): item is string => Boolean(item));
  const siteDetailsSummary =
    siteDetailsSummaryParts.length > 0 ? siteDetailsSummaryParts.map((line) => `- ${line}`).join("\n") : null;
  const siteDetailsUnresolved = [
    siteDetails?.apn?.trim() ? null : "APN not verified for this site",
    siteDetails?.utility?.name && siteDetails.detailsStatus !== "AI_FOUND"
      ? null
      : "Utility assignment not verified for this site",
    siteDetails?.jurisdiction?.name ? null : "Jurisdiction assignment not verified for this site",
  ].filter((item): item is string => Boolean(item));

  return buildQuoteExecutionPlanningContextManifest({
    userInstructions: args.userInstructions,
    lineInternalNotes: args.line.internalNotes,
    customerScopeTitle: args.line.customerScopeTitle,
    customerScopeDescription: args.line.customerScopeDescription,
    customerIncludedNotes: args.line.customerIncludedNotes,
    customerExcludedNotes: args.line.customerExcludedNotes,
    quoteInternalNotes: args.line.quote?.internalNotes,
    leadNotes: args.line.quote?.lead?.notes ?? null,
    priorMissingContext: args.priorMissingContext,
    siteDetailsSummary,
    siteDetailsUnresolved,
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
