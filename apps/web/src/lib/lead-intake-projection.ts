/**
 * AI-ready intake projection — single derived DTO for future prompts.
 *
 * Built from stored Lead JSONB + deterministic helpers only. No AI output, no
 * persistence. Safe for logging: no raw event payloads, no full legacy notes blob.
 *
 * @see docs/canon/lead-intake-canon.md (Slice 5)
 */

import type { LeadChannel, LeadStatus } from "@prisma/client";
import {
  evaluateLeadReadiness,
  type LeadReadinessReport,
} from "@/lib/lead-readiness-heuristics";
import {
  getOpportunityFlow,
  pickMostRecentNonArchivedQuote,
  type OpportunityFlowChangeRequestInput,
  type OpportunityFlowQuoteInput,
  type OpportunityFlowVisitInput,
} from "@/lib/opportunity-flow";
import {
  projectLead,
  readAddress,
  readContact,
  readRequest,
  readSignals,
  type LeadAddressJson,
  type ProjectableLeadRow,
} from "@/lib/lead/lead-projection";
import { summarizeLeadEvent } from "@/lib/lead-review-view-model";
import { formatLeadChannel, formatLeadUrgencyHint, formatNeededByTiming } from "@/lib/lead-display";

export type LeadIntakeProjectionContact = {
  name: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
};

export type LeadIntakeProjectionRequest = {
  type: string | null;
  scope: string | null;
  neededByLabel: string | null;
  suggestedTemplateIds: string[];
};

export type LeadIntakeProjectionLocation = {
  jobsiteLine: string | null;
  isAddressVerified: boolean;
  structured: LeadAddressJson | null;
};

export type LeadIntakeProjectionReadiness = {
  report: LeadReadinessReport;
  missingRequirementLabels: string[];
  isReadyForPromotion: boolean;
};

export type LeadIntakeProjectionCommercial = {
  phase: string;
  conditionCode: string;
  label: string;
  description: string;
  primaryActionKind: string | null;
  activeQuoteId: string | null;
};

export type LeadIntakeProjectionActivityLine = {
  type: string;
  label: string;
  detail?: string;
  at: string;
};

/** Derived snapshot for AI assist / prompts — not stored truth. */
export type LeadIntakeProjection = {
  leadId: string;
  organizationId: string;
  channel: LeadChannel;
  status: LeadStatus;
  title: string;
  customerId: string | null;
  contact: LeadIntakeProjectionContact;
  request: LeadIntakeProjectionRequest;
  location: LeadIntakeProjectionLocation;
  urgencyHint: string | null;
  sourceDetail: string | null;
  readiness: LeadIntakeProjectionReadiness;
  commercial: LeadIntakeProjectionCommercial;
  attachmentCount: number;
  hasExistingCustomerMatch: boolean;
  recentActivity: LeadIntakeProjectionActivityLine[];
  /** Explicit guard for prompt authors. */
  meta: {
    schemaVersion: 1;
    derivedOnly: true;
    legacyNotesExcluded: boolean;
  };
};

export type BuildLeadIntakeProjectionInput = {
  organizationId: string;
  lead: ProjectableLeadRow;
  jobsiteAddressLine: string | null;
  isAddressVerified: boolean;
  quotes?: OpportunityFlowQuoteInput[];
  visits?: OpportunityFlowVisitInput[];
  changeRequests?: OpportunityFlowChangeRequestInput[];
  hasExistingCustomerMatch?: boolean;
  attachmentCount?: number;
  events?: Array<{ type: string; payload: unknown; createdAt: Date }>;
};

const REQUIREMENT_LABELS: Record<keyof Pick<LeadReadinessReport, "hasIdentity" | "hasEmail" | "hasPhone" | "hasAddress">, string> = {
  hasIdentity: "Identity",
  hasEmail: "Email",
  hasPhone: "Phone",
  hasAddress: "Location",
};

function missingRequirementLabels(report: LeadReadinessReport): string[] {
  const missing: string[] = [];
  if (!report.hasIdentity) missing.push(REQUIREMENT_LABELS.hasIdentity);
  if (!report.hasEmail) missing.push(REQUIREMENT_LABELS.hasEmail);
  if (!report.hasPhone) missing.push(REQUIREMENT_LABELS.hasPhone);
  if (!report.hasAddress) missing.push(REQUIREMENT_LABELS.hasAddress);
  return missing;
}

/**
 * Build the canonical intake projection for a lead. Pure over inputs except Date formatting.
 */
export function buildLeadIntakeProjection(
  input: BuildLeadIntakeProjectionInput,
): LeadIntakeProjection {
  const projected = projectLead(input.lead);
  const contact = readContact(input.lead.contact);
  const request = readRequest(input.lead.request);
  const signals = readSignals(input.lead.signals);
  const address = readAddress(input.lead.address);

  const readinessReport = evaluateLeadReadiness({
    contactName: contact.name,
    companyName: contact.companyName,
    email: contact.email,
    phone: contact.phone,
    address: input.jobsiteAddressLine,
    isAddressVerified: input.isAddressVerified,
  });

  const opportunityFlow = getOpportunityFlow({
    lead: {
      id: projected.id,
      status: projected.status,
      followUpAt: null,
      customerId: projected.customerId,
      contactName: contact.name,
      companyName: contact.companyName,
      email: contact.email,
      phone: contact.phone,
      jobsiteAddressLine: input.jobsiteAddressLine,
      isAddressVerified: input.isAddressVerified,
    },
    quotes: input.quotes ?? [],
    visits: input.visits ?? [],
    changeRequests: input.changeRequests ?? [],
    hasExistingCustomerMatch: input.hasExistingCustomerMatch,
  });

  const activeQuote = pickMostRecentNonArchivedQuote(input.quotes ?? []);

  const recentActivity = (input.events ?? []).slice(0, 10).map((e) => {
    const summary = summarizeLeadEvent(e.type, e.payload);
    return {
      type: e.type,
      label: summary.label,
      detail: summary.detail,
      at: e.createdAt.toISOString(),
    };
  });

  const suggestedTemplateIds = [
    ...(request.suggestedTemplateIds ?? []),
    ...(signals.suggestedTemplateIds ?? []),
  ].filter((id, i, arr) => id && arr.indexOf(id) === i);

  return {
    leadId: projected.id,
    organizationId: input.organizationId,
    channel: projected.channel,
    status: projected.status,
    title: projected.title,
    customerId: projected.customerId,
    contact: {
      name: contact.name,
      companyName: contact.companyName,
      email: contact.email,
      phone: contact.phone,
    },
    request: {
      type: request.type,
      scope: request.scope,
      neededByLabel: formatNeededByTiming(request.neededByBucket, request.neededByDate),
      suggestedTemplateIds,
    },
    location: {
      jobsiteLine: input.jobsiteAddressLine,
      isAddressVerified: input.isAddressVerified,
      structured: address,
    },
    urgencyHint: formatLeadUrgencyHint(signals.urgencyHint) ?? null,
    sourceDetail:
      typeof signals.sourceDetail === "string" && signals.sourceDetail.trim()
        ? signals.sourceDetail.trim()
        : formatLeadChannel(projected.channel),
    readiness: {
      report: readinessReport,
      missingRequirementLabels: missingRequirementLabels(readinessReport),
      isReadyForPromotion: readinessReport.isReady,
    },
    commercial: {
      phase: opportunityFlow.phase,
      conditionCode: opportunityFlow.conditionCode,
      label: opportunityFlow.conditionLabel,
      description: opportunityFlow.summary,
      primaryActionKind: opportunityFlow.primaryAction?.kind ?? null,
      activeQuoteId:
        opportunityFlow.primaryAction?.targetQuoteId ??
        opportunityFlow.secondaryActions.find((action) => action.targetQuoteId)?.targetQuoteId ??
        activeQuote?.id ??
        null,
    },
    attachmentCount: input.attachmentCount ?? 0,
    hasExistingCustomerMatch: Boolean(input.hasExistingCustomerMatch),
    recentActivity,
    meta: {
      schemaVersion: 1,
      derivedOnly: true,
      legacyNotesExcluded: true,
    },
  };
}
