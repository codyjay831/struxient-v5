import type {
  CommercialLineItemSuggestion,
  LineItemDetailSuggestion,
  OptionalAddOnSuggestion,
  QuoteScopeSuggestionsProposal,
} from "./quote-line-items-proposal-schema";
import { sanitizeQuickScopeLineTitle } from "./quick-scope-title-guardrails";

const EXECUTION_STEP_PATTERN =
  /\b(permit|inspection|utility|coordinate|coordination|remove|removal|install|grounding|mobilize|demolition|demo|tear.?off|access|verify|verification|schedule|logistics)\b/i;

const VAGUE_COMMERCIAL_PATTERN =
  /\b(manage project logistics|project logistics|coordination fee|general coordination|project management)\b/i;

const GENERIC_OBSERVATION_PATTERN =
  /\b(gate code|site access|customer preference|building department|inspection schedule|utility approval process)\b/i;

const HIGH_VALUE_OBSERVATION_PATTERN =
  /\b(price|cost|allowance|material|equipment|model|color|selection|include|included|exclude|exclusion|assumption|warranty|change order|handoff|order|ordering|lead time|permit|inspection|policy|scope|quantity|measurement|sheathing|decking|low[-\s]?slope|amperage|service size)\b/i;

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

function normalizeObservation(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (GENERIC_OBSERVATION_PATTERN.test(trimmed)) return null;
  if (!HIGH_VALUE_OBSERVATION_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function isString(value: string | null): value is string {
  return value !== null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeObservationList(value: unknown): string[] {
  return [
    ...new Set(normalizeStringList(value).map(normalizeObservation).filter(isString)),
  ];
}

function capHiddenObservations(
  proposal: QuoteScopeSuggestionsProposal,
): QuoteScopeSuggestionsProposal {
  const lineCount = proposal.commercialLineItems.length;

  if (lineCount >= 5) {
    return {
      ...proposal,
      quoteMissingInfo: [
        "Multiple work areas detected. Use Clarify Scope for a contractor-led deep review when needed.",
      ],
      commercialLineItems: proposal.commercialLineItems.map((item) => ({
        ...item,
        missingInfo: [],
      })),
    };
  }

  const filteredLineItems = proposal.commercialLineItems.map((item) => ({
    ...item,
    missingInfo: normalizeObservationList(item.missingInfo),
  }));
  const quoteObservations = normalizeObservationList(proposal.quoteMissingInfo);

  const perLineMax = lineCount <= 1 ? 3 : 2;
  const totalMax = lineCount <= 1 ? 3 : 6;
  let remaining = totalMax;

  const cappedLineItems = filteredLineItems.map((item) => {
    if (remaining <= 0) {
      return { ...item, missingInfo: [] };
    }
    const capped = item.missingInfo.slice(0, Math.min(perLineMax, remaining));
    remaining -= capped.length;
    return { ...item, missingInfo: capped };
  });

  const cappedQuoteObservations =
    remaining > 0 ? quoteObservations.slice(0, remaining) : [];

  return {
    ...proposal,
    commercialLineItems: cappedLineItems,
    quoteMissingInfo: cappedQuoteObservations,
  };
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
    const sanitizedItem: CommercialLineItemSuggestion = {
      ...item,
      description: sanitizeQuickScopeLineTitle(item.description, {
        groundingText: proposal.sourceContextSummary ?? "",
      }),
      customerScopeTitle: item.customerScopeTitle
        ? sanitizeQuickScopeLineTitle(item.customerScopeTitle, {
            groundingText: proposal.sourceContextSummary ?? "",
          })
        : null,
    };

    if (isVagueCommercial(sanitizedItem.description)) {
      deferredVague.push(sanitizedItem);
      continue;
    }

    if (
      isExecutionStepDescription(sanitizedItem.description) &&
      sanitizedItem.lineItemDetails.length === 0
    ) {
      orphanSteps.push(sanitizedItem);
      continue;
    }

    parents.push(sanitizedItem);
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

  const normalizedWarnings = [...new Set(normalizeStringList(warnings))];
  const cappedProposal = capHiddenObservations({
    ...proposal,
    warnings: normalizedWarnings,
    commercialLineItems: dedupedParents,
    optionalAddOns,
  });

  return {
    ...cappedProposal,
    warnings: normalizedWarnings,
    optionalAddOns,
  };
}
