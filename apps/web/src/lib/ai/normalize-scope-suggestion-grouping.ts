import type {
  CommercialLineItemSuggestion,
  LineItemDetailSuggestion,
  OptionalAddOnSuggestion,
  QuoteScopeSuggestionsProposal,
} from "./quote-line-items-proposal-schema";

const EXECUTION_STEP_PATTERN =
  /\b(permit|inspection|utility|coordinate|coordination|remove|removal|install|grounding|mobilize|demolition|demo|tear.?off|access|verify|verification|schedule|logistics)\b/i;

const VAGUE_COMMERCIAL_PATTERN =
  /\b(manage project logistics|project logistics|coordination fee|general coordination|project management)\b/i;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function newDetail(content: string, label?: string): LineItemDetailSuggestion {
  return {
    tempId: crypto.randomUUID(),
    label: label ?? null,
    content: content.trim(),
    audience: "internal",
  };
}

function mergeDetailsIntoParent(
  parent: CommercialLineItemSuggestion,
  detail: LineItemDetailSuggestion,
): CommercialLineItemSuggestion {
  const exists = parent.lineItemDetails.some(
    (d) => normalizeKey(d.content) === normalizeKey(detail.content),
  );
  if (exists) return parent;
  return {
    ...parent,
    lineItemDetails: [...parent.lineItemDetails, detail],
  };
}

function isExecutionStepDescription(description: string): boolean {
  return EXECUTION_STEP_PATTERN.test(description);
}

function isVagueCommercial(description: string): boolean {
  return VAGUE_COMMERCIAL_PATTERN.test(description);
}

function pickBestParent(
  parents: CommercialLineItemSuggestion[],
  stepDescription: string,
): CommercialLineItemSuggestion | null {
  if (parents.length === 0) return null;
  if (parents.length === 1) return parents[0]!;

  const stepTokens = new Set(normalizeKey(stepDescription).split(" "));
  let best = parents[0]!;
  let bestScore = -1;

  for (const parent of parents) {
    const parentTokens = normalizeKey(parent.description).split(" ");
    let overlap = 0;
    for (const token of parentTokens) {
      if (stepTokens.has(token)) overlap += 1;
    }
    if (overlap > bestScore) {
      bestScore = overlap;
      best = parent;
    }
  }
  return best;
}

/**
 * Post-parse guard: merge step-like commercial rows into parents and reframe vague rows.
 */
export function normalizeScopeSuggestionGrouping(
  proposal: QuoteScopeSuggestionsProposal,
): QuoteScopeSuggestionsProposal {
  const warnings = [...proposal.warnings];
  const parents: CommercialLineItemSuggestion[] = [];
  const optionalAddOns = [...proposal.optionalAddOns];
  const orphanSteps: CommercialLineItemSuggestion[] = [];
  const deferredVague: CommercialLineItemSuggestion[] = [];

  for (const item of proposal.commercialLineItems) {
    if (isVagueCommercial(item.description)) {
      deferredVague.push(item);
      continue;
    }

    if (isExecutionStepDescription(item.description) && item.lineItemDetails.length === 0) {
      orphanSteps.push(item);
      continue;
    }

    parents.push(item);
  }

  for (const item of deferredVague) {
    warnings.push(
      `Reframed vague commercial row "${item.description}" as detail under the primary scope item.`,
    );
    if (parents.length === 0) {
      parents.push({
        tempId: crypto.randomUUID(),
        description: "Primary scope of work",
        confidence: "low",
        reasoning: item.reasoning,
        customerScopeTitle: item.customerScopeTitle,
        customerScopeDescription: item.customerScopeDescription,
        lineItemDetails: [
          newDetail(item.description, "Coordination"),
          ...item.lineItemDetails,
        ],
        executionPlanningNotes: [...item.executionPlanningNotes],
        missingInfo: [...item.missingInfo],
      });
    } else {
      const target = parents[0]!;
      parents[0] = mergeDetailsIntoParent(target, newDetail(item.description, "Coordination"));
    }
  }

  for (const step of orphanSteps) {
    const parent = pickBestParent(parents, step.description);
    if (parent) {
      const idx = parents.findIndex((p) => p.tempId === parent.tempId);
      if (idx >= 0) {
        parents[idx] = mergeDetailsIntoParent(parent, newDetail(step.description));
        warnings.push(`Merged execution step "${step.description}" into "${parent.description}".`);
      }
    } else {
      parents.push({
        ...step,
        reasoning: step.reasoning ?? "Grouped from execution-step-like scope.",
      });
    }
  }

  const dedupedParents: CommercialLineItemSuggestion[] = [];
  const seen = new Set<string>();
  for (const parent of parents) {
    const key = normalizeKey(parent.description);
    if (seen.has(key)) {
      const existingIdx = dedupedParents.findIndex((p) => normalizeKey(p.description) === key);
      if (existingIdx >= 0) {
        const existing = dedupedParents[existingIdx]!;
        dedupedParents[existingIdx] = {
          ...existing,
          lineItemDetails: [
            ...existing.lineItemDetails,
            ...parent.lineItemDetails.filter(
              (d) =>
                !existing.lineItemDetails.some(
                  (e) => normalizeKey(e.content) === normalizeKey(d.content),
                ),
            ),
          ],
          executionPlanningNotes: [
            ...existing.executionPlanningNotes,
            ...parent.executionPlanningNotes.filter(
              (n) => !existing.executionPlanningNotes.includes(n),
            ),
          ],
          missingInfo: [
            ...existing.missingInfo,
            ...parent.missingInfo.filter((m) => !existing.missingInfo.includes(m)),
          ],
        };
        warnings.push(`Merged duplicate commercial item "${parent.description}".`);
      }
      continue;
    }
    seen.add(key);
    dedupedParents.push(parent);
  }

  return {
    ...proposal,
    warnings: [...new Set(warnings)],
    commercialLineItems: dedupedParents,
    optionalAddOns,
  };
}
