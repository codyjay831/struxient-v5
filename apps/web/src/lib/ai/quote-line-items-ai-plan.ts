import type {
  ApplyQuoteScopeSuggestionsInput,
  QuoteScopeSuggestionsGenerationMeta,
  QuoteScopeSuggestionsProposal,
} from "./quote-line-items-proposal-schema";

export type QuoteScopeSuggestionsValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string };

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Validates approved scope suggestions before persisting quote line items.
 */
export function validateQuoteScopeSuggestionsForApply(
  proposal: QuoteScopeSuggestionsProposal,
  approved: ApplyQuoteScopeSuggestionsInput,
  allowedTemplateIds: readonly string[],
  generation?: QuoteScopeSuggestionsGenerationMeta,
): QuoteScopeSuggestionsValidationResult {
  if (generation?.isSimulated && !generation.canApply) {
    return {
      ok: false,
      error:
        generation.applyBlockedReason ??
        "This is demo AI output and cannot be applied in this environment.",
    };
  }

  if (!generation?.canApply && generation?.applyBlockedReason) {
    return {
      ok: false,
      error: generation.applyBlockedReason,
    };
  }

  const templateSet = new Set(allowedTemplateIds);
  const proposalTemplateIds = new Set(
    proposal.recommendedTemplates.map((item) => item.templateId),
  );

  for (const templateId of approved.selectedTemplateIds) {
    if (!templateSet.has(templateId)) {
      return {
        ok: false,
        error: "One or more selected templates are no longer available in your Scope Library.",
      };
    }
    if (!proposalTemplateIds.has(templateId)) {
      return {
        ok: false,
        error: "One or more selected templates were not part of the reviewed proposal.",
      };
    }
  }

  const commercialByTempId = new Map(
    proposal.commercialLineItems.map((item) => [item.tempId, item]),
  );
  const optionalByTempId = new Map(
    proposal.optionalAddOns.map((item) => [item.tempId, item]),
  );

  for (const item of approved.selectedCommercialLineItems) {
    if (!commercialByTempId.has(item.tempId)) {
      return {
        ok: false,
        error: "One or more selected commercial items were not part of the reviewed proposal.",
      };
    }
    if (!item.description.trim()) {
      return {
        ok: false,
        error: "Every commercial scope item must have a description before applying.",
      };
    }
  }

  for (const tempId of approved.selectedOptionalAddOnIds) {
    if (!optionalByTempId.has(tempId)) {
      return {
        ok: false,
        error: "One or more selected optional add-ons were not part of the reviewed proposal.",
      };
    }
  }

  if (
    approved.selectedTemplateIds.length === 0 &&
    approved.selectedCommercialLineItems.length === 0 &&
    approved.selectedOptionalAddOnIds.length === 0 &&
    approved.selectedQuoteJobContext.length === 0
  ) {
    return {
      ok: false,
      error: "Select at least one scope suggestion to add to the quote.",
    };
  }

  const warnings = [...(proposal.warnings ?? [])];

  const selectedTemplateDescriptions = approved.selectedTemplateIds
    .map((id) => {
      const match = proposal.recommendedTemplates.find((t) => t.templateId === id);
      return match?.templateDescription ?? null;
    })
    .filter(Boolean) as string[];

  for (const item of approved.selectedCommercialLineItems) {
    const descKey = normalizeKey(item.description);
    const duplicateTemplate = selectedTemplateDescriptions.some(
      (templateDesc) => normalizeKey(templateDesc) === descKey,
    );
    if (duplicateTemplate) {
      warnings.push(
        `Commercial item "${item.description}" may duplicate a selected library item.`,
      );
    }
  }

  const seenDescriptions = new Set<string>();
  for (const item of approved.selectedCommercialLineItems) {
    const key = normalizeKey(item.description);
    if (seenDescriptions.has(key)) {
      return {
        ok: false,
        error: `Duplicate commercial item description: "${item.description}".`,
      };
    }
    seenDescriptions.add(key);
  }

  for (const tempId of approved.selectedOptionalAddOnIds) {
    const addOn = optionalByTempId.get(tempId);
    if (!addOn) continue;
    const key = normalizeKey(addOn.description);
    if (seenDescriptions.has(key)) {
      return {
        ok: false,
        error: `Optional add-on duplicates another selected item: "${addOn.description}".`,
      };
    }
    seenDescriptions.add(key);
  }

  return { ok: true, warnings: [...new Set(warnings)] };
}
