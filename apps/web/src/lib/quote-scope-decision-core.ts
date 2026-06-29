import {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionSourceType,
  QuoteScopeDecisionStatus,
  type QuoteScopeDecisionResolutionTiming,
} from "@prisma/client";
import type { QuoteScopeDecisionManualAction } from "@/lib/quote-scope-decision-types";
import {
  classifyQuickScopeMissingInfoGap,
  buildQuickScopeMissingInfoSourceRef,
  QUICK_SCOPE_MISSING_INFO_SOURCE_REF_TYPE,
} from "@/lib/quote/quote-scope-gap-classifier";

type ScopeDecisionStatusFilter =
  | QuoteScopeDecisionStatus
  | { in: readonly QuoteScopeDecisionStatus[] };

type ScopeDecisionWhere = {
  id?: string;
  organizationId: string;
  quoteId: string;
  quoteLineItemId?: string | null;
  sourceType?: QuoteScopeDecisionSourceType;
  status?: ScopeDecisionStatusFilter;
};

type ScopeDecisionDuplicateRow = {
  id: string;
  title: string;
  detail: string | null;
};

type ScopeDecisionCreateData = {
  organizationId: string;
  quoteId: string;
  quoteLineItemId: string | null;
  sourceType: QuoteScopeDecisionSourceType;
  title: string;
  detail: string | null;
  sourceRefType: string | null;
  sourceRefId: string | null;
  createdByUserId: string | null;
  quoteImpact: QuoteScopeDecisionQuoteImpact;
  status: QuoteScopeDecisionStatus;
  resolutionTiming: QuoteScopeDecisionResolutionTiming | null;
};

type ScopeDecisionManualRow = {
  id: string;
  status: QuoteScopeDecisionStatus;
  quoteImpact: QuoteScopeDecisionQuoteImpact;
  quoteLineItemId: string | null;
  title: string;
};

type ScopeDecisionManualWhere = {
  id: string;
  organizationId: string;
  quoteId: string;
};

type ScopeDecisionManualUpdateData = {
  status: QuoteScopeDecisionStatus;
  resolutionTiming: QuoteScopeDecisionResolutionTiming | null;
  resolvedAt?: Date | null;
  resolvedByUserId?: string | null;
};

export type QuoteScopeDecisionCreateTx = {
  quoteScopeDecision: {
    findMany(args: {
      where: ScopeDecisionWhere;
      select: { id: true; title: true; detail: true };
    }): Promise<ScopeDecisionDuplicateRow[]>;
    create(args: {
      data: ScopeDecisionCreateData;
      select: { id: true };
    }): Promise<{ id: string }>;
  };
};

export type QuoteScopeDecisionManualActionTx = {
  quoteScopeDecision: {
    findFirst(args: {
      where: ScopeDecisionManualWhere;
      select: {
        id: true;
        status: true;
        quoteImpact: true;
        quoteLineItemId: true;
        title: true;
      };
    }): Promise<ScopeDecisionManualRow | null>;
    update(args: {
      where: { id: string };
      data: ScopeDecisionManualUpdateData;
    }): Promise<unknown>;
  };
};

export type QuoteScopeDecisionTx =
  & QuoteScopeDecisionCreateTx
  & QuoteScopeDecisionManualActionTx;

export type CreateQuoteScopeDecisionInput = {
  organizationId: string;
  quoteId: string;
  quoteLineItemId?: string | null;
  sourceType: QuoteScopeDecisionSourceType;
  title: string;
  detail?: string | null;
  sourceRefType?: string | null;
  sourceRefId?: string | null;
  createdByUserId?: string | null;
  quoteImpact?: QuoteScopeDecisionQuoteImpact;
  status?: QuoteScopeDecisionStatus;
  resolutionTiming?: QuoteScopeDecisionResolutionTiming | null;
};

/** Normalize decision text for duplicate detection. */
export function normalizeScopeDecisionText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildScopeDecisionDuplicateKey(
  title: string,
  detail: string | null | undefined,
): string {
  const normalizedTitle = normalizeScopeDecisionText(title);
  const normalizedDetail = detail?.trim()
    ? normalizeScopeDecisionText(detail)
    : "";
  return `${normalizedTitle}|${normalizedDetail}`;
}

async function findActiveDuplicateDecision(
  tx: QuoteScopeDecisionCreateTx,
  params: {
    organizationId: string;
    quoteId: string;
    quoteLineItemId: string | null;
    sourceType: QuoteScopeDecisionSourceType;
    duplicateKey: string;
  },
): Promise<{ id: string } | null> {
  const existing = await tx.quoteScopeDecision.findMany({
    where: {
      organizationId: params.organizationId,
      quoteId: params.quoteId,
      quoteLineItemId: params.quoteLineItemId,
      sourceType: params.sourceType,
      status: { in: ["OPEN", "DEFERRED"] },
    },
    select: {
      id: true,
      title: true,
      detail: true,
    },
  });

  for (const row of existing) {
    if (
      buildScopeDecisionDuplicateKey(row.title, row.detail) === params.duplicateKey
    ) {
      return { id: row.id };
    }
  }
  return null;
}

/**
 * Creates a scope decision if no active duplicate exists (normalized title/detail).
 */
export async function createQuoteScopeDecisionIfAbsent(
  tx: QuoteScopeDecisionCreateTx,
  input: CreateQuoteScopeDecisionInput,
): Promise<{ created: boolean; id: string }> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Scope decision title is required.");
  }

  const detail = input.detail?.trim() || null;
  const quoteLineItemId = input.quoteLineItemId ?? null;
  const duplicateKey = buildScopeDecisionDuplicateKey(title, detail);

  const duplicate = await findActiveDuplicateDecision(tx, {
    organizationId: input.organizationId,
    quoteId: input.quoteId,
    quoteLineItemId,
    sourceType: input.sourceType,
    duplicateKey,
  });
  if (duplicate) {
    return { created: false, id: duplicate.id };
  }

  const created = await tx.quoteScopeDecision.create({
    data: {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      quoteLineItemId,
      sourceType: input.sourceType,
      title,
      detail,
      sourceRefType: input.sourceRefType ?? null,
      sourceRefId: input.sourceRefId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      quoteImpact: input.quoteImpact ?? QuoteScopeDecisionQuoteImpact.NONE,
      status: input.status ?? QuoteScopeDecisionStatus.OPEN,
      resolutionTiming: input.resolutionTiming ?? null,
    },
    select: { id: true },
  });
  return { created: true, id: created.id };
}

export async function createQuoteScopeDecisionsFromMissingInfoStrings(
  tx: QuoteScopeDecisionCreateTx,
  params: {
    organizationId: string;
    quoteId: string;
    quoteLineItemId?: string | null;
    missingInfo: readonly string[];
    sourceType?: QuoteScopeDecisionSourceType;
    /** Parent ref for stable per-gap sourceRefId (line tempId or quote id). */
    parentSourceRefId?: string | null;
    createdByUserId?: string | null;
  },
): Promise<{ createdCount: number; skippedDuplicateCount: number }> {
  let createdCount = 0;
  let skippedDuplicateCount = 0;

  const parentRefId = params.parentSourceRefId?.trim() || params.quoteId;

  for (const raw of params.missingInfo) {
    const text = raw.trim();
    if (!text) continue;

    const classification = classifyQuickScopeMissingInfoGap(text);
    const sourceRefId = buildQuickScopeMissingInfoSourceRef({
      parentRefId,
      missingInfoText: text,
    });

    const result = await createQuoteScopeDecisionIfAbsent(tx, {
      organizationId: params.organizationId,
      quoteId: params.quoteId,
      quoteLineItemId: params.quoteLineItemId ?? null,
      sourceType: params.sourceType ?? QuoteScopeDecisionSourceType.QUICK_SCOPE,
      title: text,
      detail: null,
      sourceRefType: QUICK_SCOPE_MISSING_INFO_SOURCE_REF_TYPE,
      sourceRefId,
      createdByUserId: params.createdByUserId ?? null,
      quoteImpact: classification.quoteImpact,
      status: classification.status,
      resolutionTiming: classification.resolutionTiming,
    });
    if (result.created) {
      createdCount += 1;
    } else {
      skippedDuplicateCount += 1;
    }
  }

  return { createdCount, skippedDuplicateCount };
}

type ManualActionUpdate = {
  status: QuoteScopeDecisionStatus;
  resolutionTiming: QuoteScopeDecisionResolutionTiming | null;
  clearResolvedAt?: boolean;
};

const UNSUPPORTED_GAP_ACTION_ERROR =
  "This gap action is no longer supported. Use Clarify Scope, Not needed, or Defer to execution.";

export function manualActionToUpdate(
  action: QuoteScopeDecisionManualAction,
): ManualActionUpdate {
  switch (action) {
    case "defer_to_execution":
      return { status: "DEFERRED", resolutionTiming: "EXECUTION", clearResolvedAt: true };
    case "dismiss":
      return { status: "DISMISSED", resolutionTiming: "NOT_NEEDED" };
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown manual action: ${_exhaustive}`);
    }
  }
}

export async function applyQuoteScopeDecisionManualAction(
  tx: QuoteScopeDecisionManualActionTx,
  params: {
    organizationId: string;
    quoteId: string;
    decisionId: string;
    action: QuoteScopeDecisionManualAction;
    resolvedByUserId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await tx.quoteScopeDecision.findFirst({
    where: {
      id: params.decisionId,
      organizationId: params.organizationId,
      quoteId: params.quoteId,
    },
    select: { id: true, status: true, quoteImpact: true, quoteLineItemId: true, title: true },
  });

  if (!existing) {
    return { ok: false, error: "Scope decision not found." };
  }

  if (existing.status !== "OPEN" && existing.status !== "DEFERRED") {
    return { ok: false, error: "This scope decision is already closed." };
  }

  if (params.action !== "dismiss" && params.action !== "defer_to_execution") {
    return {
      ok: false,
      error: UNSUPPORTED_GAP_ACTION_ERROR,
    };
  }

  const update = manualActionToUpdate(params.action);
  const now = new Date();
  const isTerminal =
    update.status === "RESOLVED" || update.status === "DISMISSED";

  await tx.quoteScopeDecision.update({
    where: { id: existing.id },
    data: {
      status: update.status,
      resolutionTiming: update.resolutionTiming,
      resolvedAt: isTerminal ? now : update.clearResolvedAt ? null : undefined,
      resolvedByUserId: isTerminal ? (params.resolvedByUserId ?? null) : null,
    },
  });

  return { ok: true };
}
