import "server-only";

import { db, type ExtendedTransactionClient } from "@/lib/db";

export const QUOTE_PLAN_INPUT_SCHEMA_VERSION = 1;

export type QuotePlanCriticalLineContext = {
  id: string;
  sortOrder: number;
  description: string;
  quantity: string;
  unitAmountCents: number;
  executionRelevant: boolean;
  clarifications: Array<{
    questionSetKey: string;
    questionSetVersion: number;
    answersJson: unknown;
  }>;
};

export type QuotePlanCriticalBusinessContext = {
  trades: string[];
  workTypes: string[];
  customerMarkets: string[];
  operatingModel: string | null;
  teamSize: string | null;
};

export type QuotePlanCriticalContext = {
  quoteId: string;
  organizationId: string;
  quoteStatus: "DRAFT" | "SENT" | "APPROVED" | "ARCHIVED";
  lines: QuotePlanCriticalLineContext[];
  serviceLocation: {
    detailsStatus: string | null;
    apn: string | null;
    utilityName: string | null;
    jurisdictionName: string | null;
  } | null;
  businessProfile: QuotePlanCriticalBusinessContext | null;
};

export type QuotePlanAdvisoryContext = {
  quoteTitle: string;
  quoteInternalNotes: string | null;
  lineInternalNotesByLineId: Record<string, string | null>;
  lineCustomerProposalByLineId: Record<
    string,
    {
      customerScopeTitle: string | null;
      customerScopeDescription: string | null;
      customerIncludedNotes: string | null;
      customerExcludedNotes: string | null;
    }
  >;
  leadNotes: string | null;
  organizationDisplayName: string;
};

export type QuotePlanContext = {
  critical: QuotePlanCriticalContext;
  advisory: QuotePlanAdvisoryContext;
};

function normalizeUnknownJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalizeUnknownJson);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const out: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      out[key] = normalizeUnknownJson(child);
    }
    return out;
  }
  return value;
}

export async function loadQuotePlanContext(
  quoteId: string,
  organizationId: string,
  tx: ExtendedTransactionClient | typeof db = db,
): Promise<QuotePlanContext | null> {
  const quote = await tx.quote.findFirst({
    where: { id: quoteId, organizationId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      title: true,
      internalNotes: true,
      lead: { select: { notes: true } },
      organization: { select: { name: true, businessProfile: true } },
      serviceLocation: {
        select: {
          detailsStatus: true,
          apn: true,
          utility: { select: { name: true } },
          jurisdiction: { select: { name: true } },
        },
      },
      lineItems: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          sortOrder: true,
          description: true,
          quantity: true,
          unitAmountCents: true,
          executionRelevant: true,
          internalNotes: true,
          customerScopeTitle: true,
          customerScopeDescription: true,
          customerIncludedNotes: true,
          customerExcludedNotes: true,
          clarifications: {
            orderBy: [{ questionSetKey: "asc" }, { questionSetVersion: "asc" }],
            select: {
              questionSetKey: true,
              questionSetVersion: true,
              answersJson: true,
            },
          },
        },
      },
    },
  });

  if (!quote) return null;
  const profile = quote.organization.businessProfile;
  const lines = quote.lineItems.map((line) => ({
    id: line.id,
    sortOrder: line.sortOrder,
    description: line.description,
    quantity: line.quantity.toString(),
    unitAmountCents: line.unitAmountCents,
    executionRelevant: line.executionRelevant,
    clarifications: line.clarifications.map((entry) => ({
      questionSetKey: entry.questionSetKey,
      questionSetVersion: entry.questionSetVersion,
      answersJson: normalizeUnknownJson(entry.answersJson),
    })),
  }));

  const lineInternalNotesByLineId: QuotePlanAdvisoryContext["lineInternalNotesByLineId"] = {};
  const lineCustomerProposalByLineId: QuotePlanAdvisoryContext["lineCustomerProposalByLineId"] = {};
  for (const line of quote.lineItems) {
    lineInternalNotesByLineId[line.id] = line.internalNotes ?? null;
    lineCustomerProposalByLineId[line.id] = {
      customerScopeTitle: line.customerScopeTitle ?? null,
      customerScopeDescription: line.customerScopeDescription ?? null,
      customerIncludedNotes: line.customerIncludedNotes ?? null,
      customerExcludedNotes: line.customerExcludedNotes ?? null,
    };
  }

  return {
    critical: {
      quoteId: quote.id,
      organizationId: quote.organizationId,
      quoteStatus: quote.status,
      lines,
      serviceLocation: quote.serviceLocation
        ? {
            detailsStatus: quote.serviceLocation.detailsStatus,
            apn: quote.serviceLocation.apn,
            utilityName: quote.serviceLocation.utility?.name ?? null,
            jurisdictionName: quote.serviceLocation.jurisdiction?.name ?? null,
          }
        : null,
      businessProfile: profile
        ? {
            trades: [...profile.trades].sort(),
            workTypes: [...profile.workTypes].sort(),
            customerMarkets: [...profile.customerMarkets].sort(),
            operatingModel: profile.operatingModel ?? null,
            teamSize: profile.teamSize ?? null,
          }
        : null,
    },
    advisory: {
      quoteTitle: quote.title,
      quoteInternalNotes: quote.internalNotes ?? null,
      lineInternalNotesByLineId,
      lineCustomerProposalByLineId,
      leadNotes: quote.lead?.notes ?? null,
      organizationDisplayName: quote.organization.name,
    },
  };
}

export function buildQuotePlanPlanningInput(context: QuotePlanContext): QuotePlanCriticalContext {
  return context.critical;
}

