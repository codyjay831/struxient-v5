import "server-only";

import { QuoteStatus, type LeadVisitNextAction, type LeadVisitOutcome, type LeadVisitRequestStatus } from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { parseIntakeNotes } from "@/lib/lead-display";
import { readContact, readRequest, readSignals } from "@/lib/lead/lead-projection";

type NullableString = string | null;

export type CommercialContextLineItem = {
  id: string;
  description: string;
  internalNotes: NullableString;
  customerIncludedNotes: NullableString;
  customerScopeTitle: NullableString;
  customerScopeDescription: NullableString;
  clarifications: Array<{
    questionSetKey: string;
    questionSetVersion: number;
    answersJson: unknown;
  }>;
};

export type CommercialContext = {
  organizationId: string;
  quoteId: string;
  leadId: string | null;
  customer: {
    id: string | null;
    displayName: NullableString;
    email: NullableString;
    phone: NullableString;
    provenance: "customer_record" | "none";
  };
  contact: {
    name: NullableString;
    companyName: NullableString;
    email: NullableString;
    phone: NullableString;
    provenance: "lead_intake" | "none";
  };
  serviceLocation: {
    id: string | null;
    line: NullableString;
    detailsStatus: NullableString;
    apn: NullableString;
    utilityName: NullableString;
    jurisdictionName: NullableString;
    provenance: "service_location_record" | "none";
  };
  leadRequest: {
    requestType: NullableString;
    scopeSummary: NullableString;
    neededByBucket: NullableString;
    neededByDateIso: NullableString;
    rawRequestJson: unknown;
  } | null;
  leadNotes: {
    customerProvidedLines: string[];
    customerRawNotes: NullableString;
    internalSalesNotes: NullableString;
    isPublicIntake: boolean;
  } | null;
  latestVisit: {
    id: string;
    status: LeadVisitRequestStatus;
    outcome: LeadVisitOutcome | null;
    nextAction: LeadVisitNextAction | null;
    requestedDateIso: NullableString;
    confirmedDateIso: NullableString;
    completedAtIso: NullableString;
    notes: NullableString;
    accessSnapshot: unknown;
    outcomeNotes: NullableString;
    provenance: "lead_visit_request";
  } | null;
  quote: {
    status: QuoteStatus;
    title: string;
    internalNotes: NullableString;
    lineItems: CommercialContextLineItem[];
  };
  businessProfile: {
    trades: string[];
    workTypes: string[];
    customerMarkets: string[];
    operatingModel: NullableString;
    teamSize: NullableString;
  } | null;
};

export async function loadCommercialContextForQuote(
  input: {
    organizationId: string;
    quoteId: string;
  },
  tx: ExtendedTransactionClient | typeof db = db,
): Promise<CommercialContext | null> {
  const quote = await tx.quote.findFirst({
    where: {
      id: input.quoteId,
      organizationId: input.organizationId,
      status: { in: [QuoteStatus.DRAFT, QuoteStatus.SENT, QuoteStatus.APPROVED] },
    },
    select: {
      id: true,
      organizationId: true,
      status: true,
      title: true,
      internalNotes: true,
      customer: {
        select: {
          id: true,
          displayName: true,
          email: true,
          phone: true,
        },
      },
      serviceLocation: {
        select: {
          id: true,
          formattedAddress: true,
          addressLine1: true,
          detailsStatus: true,
          apn: true,
          utility: { select: { name: true } },
          jurisdiction: { select: { name: true } },
        },
      },
      lead: {
        select: {
          id: true,
          contact: true,
          request: true,
          signals: true,
          notes: true,
          visitRequests: {
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: {
              id: true,
              status: true,
              outcome: true,
              nextAction: true,
              requestedDate: true,
              confirmedDate: true,
              completedAt: true,
              notes: true,
              accessSnapshotJson: true,
              completionNotes: true,
            },
          },
        },
      },
      lineItems: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          description: true,
          internalNotes: true,
          customerIncludedNotes: true,
          customerScopeTitle: true,
          customerScopeDescription: true,
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
      organization: {
        select: {
          businessProfile: {
            select: {
              trades: true,
              workTypes: true,
              customerMarkets: true,
              operatingModel: true,
              teamSize: true,
            },
          },
        },
      },
    },
  });

  if (!quote) return null;

  const leadContact = quote.lead ? readContact(quote.lead.contact) : null;
  const leadRequest = quote.lead ? readRequest(quote.lead.request) : null;
  const leadSignals = quote.lead ? readSignals(quote.lead.signals) : null;
  const parsedLeadNotes = quote.lead ? parseIntakeNotes(quote.lead.notes ?? null) : null;
  const latestVisit = quote.lead?.visitRequests[0] ?? null;

  return {
    organizationId: quote.organizationId,
    quoteId: quote.id,
    leadId: quote.lead?.id ?? null,
    customer: {
      id: quote.customer?.id ?? null,
      displayName: quote.customer?.displayName ?? null,
      email: quote.customer?.email ?? null,
      phone: quote.customer?.phone ?? null,
      provenance: quote.customer ? "customer_record" : "none",
    },
    contact: {
      name: leadContact?.name ?? null,
      companyName: leadContact?.companyName ?? null,
      email: leadContact?.email ?? null,
      phone: leadContact?.phone ?? null,
      provenance: leadContact ? "lead_intake" : "none",
    },
    serviceLocation: {
      id: quote.serviceLocation?.id ?? null,
      line: quote.serviceLocation
        ? (quote.serviceLocation.formattedAddress?.trim() || quote.serviceLocation.addressLine1?.trim() || null)
        : null,
      detailsStatus: quote.serviceLocation?.detailsStatus ?? null,
      apn: quote.serviceLocation?.apn ?? null,
      utilityName: quote.serviceLocation?.utility?.name ?? null,
      jurisdictionName: quote.serviceLocation?.jurisdiction?.name ?? null,
      provenance: quote.serviceLocation ? "service_location_record" : "none",
    },
    leadRequest: leadRequest
      ? {
          requestType: leadRequest.type ?? null,
          scopeSummary: leadRequest.scope ?? null,
          neededByBucket: leadRequest.neededByBucket ?? null,
          neededByDateIso:
            leadRequest.neededByDate instanceof Date
              ? leadRequest.neededByDate.toISOString()
              : typeof leadRequest.neededByDate === "string"
                ? leadRequest.neededByDate
                : null,
          rawRequestJson: quote.lead?.request ?? null,
        }
      : null,
    leadNotes: parsedLeadNotes
      ? {
          customerProvidedLines: parsedLeadNotes.parsedFields.map((field) => `${field.label}: ${field.value}`),
          customerRawNotes: parsedLeadNotes.cleanNotes?.trim() || null,
          internalSalesNotes:
            typeof leadSignals?.notes === "string" && leadSignals.notes.trim().length > 0
              ? leadSignals.notes.trim()
              : parsedLeadNotes.isPublicIntake
                ? null
                : (quote.lead?.notes?.trim() || null),
          isPublicIntake: parsedLeadNotes.isPublicIntake,
        }
      : null,
    latestVisit: latestVisit
      ? {
          id: latestVisit.id,
          status: latestVisit.status,
          outcome: latestVisit.outcome,
          nextAction: latestVisit.nextAction,
          requestedDateIso: latestVisit.requestedDate?.toISOString() ?? null,
          confirmedDateIso: latestVisit.confirmedDate?.toISOString() ?? null,
          completedAtIso: latestVisit.completedAt?.toISOString() ?? null,
          notes: latestVisit.notes?.trim() || null,
          accessSnapshot: latestVisit.accessSnapshotJson,
          outcomeNotes: latestVisit.completionNotes?.trim() || null,
          provenance: "lead_visit_request",
        }
      : null,
    quote: {
      status: quote.status,
      title: quote.title,
      internalNotes: quote.internalNotes ?? null,
      lineItems: quote.lineItems.map((line) => ({
        id: line.id,
        description: line.description,
        internalNotes: line.internalNotes ?? null,
        customerIncludedNotes: line.customerIncludedNotes ?? null,
        customerScopeTitle: line.customerScopeTitle ?? null,
        customerScopeDescription: line.customerScopeDescription ?? null,
        clarifications: line.clarifications.map((clarification) => ({
          questionSetKey: clarification.questionSetKey,
          questionSetVersion: clarification.questionSetVersion,
          answersJson: clarification.answersJson,
        })),
      })),
    },
    businessProfile: quote.organization.businessProfile
      ? {
          trades: [...quote.organization.businessProfile.trades],
          workTypes: [...quote.organization.businessProfile.workTypes],
          customerMarkets: [...quote.organization.businessProfile.customerMarkets],
          operatingModel: quote.organization.businessProfile.operatingModel ?? null,
          teamSize: quote.organization.businessProfile.teamSize ?? null,
        }
      : null,
  };
}

export function buildCommercialContextLineText(
  context: CommercialContext,
  input: {
    lineId: string;
    includeTemplateTags?: string[];
  },
): string {
  const line = context.quote.lineItems.find((item) => item.id === input.lineId);
  if (!line) return "";

  const parts: string[] = [];
  parts.push(`Line scope (quote draft):\n${line.description}`);

  if (line.internalNotes?.trim()) {
    parts.push(`Internal line notes (staff-only, not verified facts):\n${line.internalNotes.trim()}`);
  }
  if (line.customerIncludedNotes?.trim()) {
    parts.push(`Customer-facing included notes (proposal wording):\n${line.customerIncludedNotes.trim()}`);
  }
  if (context.leadRequest?.scopeSummary?.trim()) {
    parts.push(`Lead scope summary (customer-stated):\n${context.leadRequest.scopeSummary.trim()}`);
  }
  if (context.leadNotes?.customerProvidedLines.length) {
    parts.push(
      `Customer-provided intake fields (not yet field-verified):\n${context.leadNotes.customerProvidedLines
        .map((lineText) => `- ${lineText}`)
        .join("\n")}`,
    );
  }
  if (context.latestVisit?.notes) {
    parts.push(`Latest site visit notes (field-recorded):\n${context.latestVisit.notes}`);
  }
  if (input.includeTemplateTags && input.includeTemplateTags.length > 0) {
    parts.push(`Template tags:\n${input.includeTemplateTags.join(", ")}`);
  }

  return parts.join("\n\n");
}
