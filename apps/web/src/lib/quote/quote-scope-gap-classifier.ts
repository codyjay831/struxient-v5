import {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionResolutionTiming,
  QuoteScopeDecisionStatus,
} from "@prisma/client";
import { normalizeScopeDecisionText } from "@/lib/quote-scope-decision-core";

export const QUICK_SCOPE_MISSING_INFO_SOURCE_REF_TYPE = "quick_scope_missing_info";

export type QuickScopeGapClassification = {
  quoteImpact: QuoteScopeDecisionQuoteImpact;
  status: QuoteScopeDecisionStatus;
  resolutionTiming: QuoteScopeDecisionResolutionTiming | null;
};

const EXECUTION_OR_SCHEDULING_PATTERNS: readonly RegExp[] = [
  /\bschedul(e|ing)\b/,
  /\btimeline\b/,
  /\bpreferred (start|week|date|time)\b/,
  /\bavailability\b/,
  /\bavailable after\b/,
  /\bweekday\b/,
  /\bweekend\b/,
  /\btime preference\b/,
  /\baccess time\b/,
  /\bcustomer available\b/,
  /\bwhen (can|should) (we|work)\b/,
  /\bproject timeline\b/,
  /\bcrew sequence\b/,
  /\bsequencing\b/,
  /\binternal prep\b/,
  /\bphoto checklist\b/,
  /\bjob setup\b/,
  /\bfield photos?\b/,
  /\bbefore install prep\b/,
  /\bcoordinate crew\b/,
  /\bexecution planning\b/,
  /\boffice prep\b/,
  /\binstall day logistics\b/,
];

const COMMERCIAL_REQUIRED_PATTERNS: readonly RegExp[] = [
  /\bsquare feet?\b/,
  /\bsq\.?\s*ft\b/,
  /\bsf\b/,
  /\blinear feet?\b/,
  /\blf\b/,
  /\bquantity\b/,
  /\bmeasure(ment|ments)?\b/,
  /\bcount\b/,
  /\bdimension(s)?\b/,
  /\bamperage\b/,
  /\b\d+\s*a(mp|mps)\b/,
  /\bservice size\b/,
  /\bpanel size\b/,
  /\bexisting service\b/,
  /\bproposed amperage\b/,
  /\bmaterial\b/,
  /\bproduct\b/,
  /\bmodel\b/,
  /\bbrand\b/,
  /\bcolor\b/,
  /\bselection\b/,
  /\bchoose\b/,
  /\bwhich (option|type|product)\b/,
  /\binclude(d|s)?\b/,
  /\bexclude(d|s)?\b/,
  /\bwarranty\b/,
  /\bcustomer (provide|responsible|supply)\b/,
  /\bprice\b/,
  /\bcost\b/,
  /\broof pitch\b/,
  /\bhoa\b/,
  /\bpermit required\b/,
  /\bscope (confirm|verification)\b/,
];

function matchesAnyPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Heuristic v1 classifier for Quick Scope missingInfo → gap record metadata.
 * Uses existing enum/status fields only — no schema migration.
 */
export function classifyQuickScopeMissingInfoGap(text: string): QuickScopeGapClassification {
  const normalized = normalizeScopeDecisionText(text);
  if (!normalized) {
    return {
      quoteImpact: QuoteScopeDecisionQuoteImpact.POSSIBLE,
      status: QuoteScopeDecisionStatus.OPEN,
      resolutionTiming: null,
    };
  }

  if (matchesAnyPattern(normalized, EXECUTION_OR_SCHEDULING_PATTERNS)) {
    return {
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
      status: QuoteScopeDecisionStatus.DEFERRED,
      resolutionTiming: QuoteScopeDecisionResolutionTiming.EXECUTION,
    };
  }

  if (matchesAnyPattern(normalized, COMMERCIAL_REQUIRED_PATTERNS)) {
    return {
      quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
      status: QuoteScopeDecisionStatus.OPEN,
      resolutionTiming: null,
    };
  }

  return {
    quoteImpact: QuoteScopeDecisionQuoteImpact.POSSIBLE,
    status: QuoteScopeDecisionStatus.OPEN,
    resolutionTiming: null,
  };
}

export function buildQuickScopeMissingInfoSourceRef(input: {
  parentRefId: string;
  missingInfoText: string;
}): string {
  const normalized = normalizeScopeDecisionText(input.missingInfoText)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  const suffix = normalized || "missing";
  return `${input.parentRefId}:${suffix}`;
}
