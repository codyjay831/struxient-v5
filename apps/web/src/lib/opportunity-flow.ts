import type {
  JobStatus,
  LeadStatus,
  LeadVisitNextAction,
  LeadVisitOutcome,
  LeadVisitRequestStatus,
  QuoteStatus,
} from "@prisma/client";
import { evaluateLeadReadiness } from "@/lib/lead-readiness-heuristics";
import { resolveLeadVisitScheduledStart } from "@/lib/scheduling/lead-visit-schedule-service";
import { opportunityWorkspaceHref } from "@/lib/opportunity-tab-routing";

export type OpportunityPhase =
  | "INTAKE"
  | "DISCOVERY"
  | "ESTIMATING"
  | "CUSTOMER_REVIEW"
  | "WON"
  | "LOST"
  | "PAUSED";

export type OpportunityConditionCode =
  | "NEEDS_INTAKE_DETAILS"
  | "NEEDS_SALES_VISIT"
  | "SALES_VISIT_SCHEDULED"
  | "READY_TO_QUOTE"
  | "CUSTOMER_MATCH_NEEDS_REVIEW"
  | "QUOTE_DRAFT_IN_PROGRESS"
  | "QUOTE_READY_TO_SEND"
  | "WAITING_ON_CUSTOMER"
  | "CUSTOMER_REQUESTED_CHANGES"
  | "FOLLOW_UP_VISIT_REQUIRED"
  | "REVISION_DRAFT_IN_PROGRESS"
  | "REVISION_READY_TO_SEND"
  | "APPROVED_READY_FOR_JOB"
  | "JOB_ACTIVE"
  | "PAUSED"
  | "LOST";

export type OpportunityActionKind =
  | "EDIT_CONTACT_INFO"
  | "REVIEW_CUSTOMER_MATCH"
  | "START_QUOTE"
  | "OPEN_DRAFT_QUOTE"
  | "OPEN_QUOTE"
  | "SEND_QUOTE"
  | "FOLLOW_UP_CUSTOMER"
  | "CREATE_REVISION_DRAFT"
  | "SCHEDULE_SALES_VISIT"
  | "COMPLETE_SALES_VISIT"
  | "OPEN_EXECUTION_REVIEW"
  | "OPEN_JOB"
  | "RESUME_OPPORTUNITY";

export type OpportunityAction = {
  kind: OpportunityActionKind;
  label: string;
  targetLeadId?: string;
  targetQuoteId?: string;
  targetJobId?: string;
  targetVisitRequestId?: string;
  targetChangeRequestId?: string;
};

export type OpportunityFact = {
  label: string;
  value: string;
};

export type OpportunityEvent = {
  label: string;
  detail?: string;
  at: string | null;
};

export type OpportunityFlowView = {
  phase: OpportunityPhase;
  conditionCode: OpportunityConditionCode;
  conditionLabel: string;
  conditionStartedAt: string | null;
  ageLabel: string | null;
  summary: string;
  requirements: string[];
  satisfiedItems: string[];
  primaryAction: OpportunityAction | null;
  secondaryActions: OpportunityAction[];
  keyFacts: OpportunityFact[];
  recentEvents: OpportunityEvent[];
};

export type OpportunityFlowQuoteInput = {
  id: string;
  title: string;
  status: QuoteStatus;
  lineItemCount: number;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
  revisionOfQuoteId?: string | null;
  revisionNumber?: number | null;
  job: { id: string; status: JobStatus } | null;
  latestSendAt?: Date | null;
  latestApprovalAt?: Date | null;
};

export type OpportunityFlowVisitInput = {
  id: string;
  status: LeadVisitRequestStatus | "COMPLETED" | "NO_SHOW";
  requestedDate?: Date | null;
  requestedWindow?: string | null;
  confirmedDate?: Date | null;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
  assignedUserId?: string | null;
  completedAt?: Date | null;
  outcome?: LeadVisitOutcome | null;
  nextAction?: LeadVisitNextAction | null;
  hasAccessDetails?: boolean;
  createdAt: Date;
};

export type OpportunityFlowChangeRequestInput = {
  id: string;
  quoteId: string;
  message: string;
  createdAt: Date;
  resolvedAt?: Date | null;
  requiresVisit?: boolean;
  resultingQuoteId?: string | null;
};

export type OpportunityFlowInput = {
  lead: {
    id: string;
    status: LeadStatus;
    followUpAt?: Date | null;
    customerId: string | null;
    contactName: string | null;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    jobsiteAddressLine: string | null;
    isAddressVerified?: boolean;
  };
  quotes: OpportunityFlowQuoteInput[];
  visits: OpportunityFlowVisitInput[];
  changeRequests: OpportunityFlowChangeRequestInput[];
  /** When true and lead is unlinked, blocks START_QUOTE until customer match is reviewed. */
  hasExistingCustomerMatch?: boolean;
  now?: Date;
};

function iso(d?: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function formatAge(fromIso: string | null, now: Date): string | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  const ms = now.getTime() - from.getTime();
  if (ms < 0) return "scheduled";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} here`;
  return `${Math.max(hours, 0)}h here`;
}

function latestByDate<T>(rows: T[], getDate: (row: T) => Date | null | undefined): T | null {
  let best: T | null = null;
  for (const row of rows) {
    const d = getDate(row);
    if (!d) continue;
    if (!best) {
      best = row;
      continue;
    }
    const bestDate = getDate(best);
    if (!bestDate || d.getTime() > bestDate.getTime()) best = row;
  }
  return best;
}

function byMostRecent<T extends { updatedAt: Date }>(rows: T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!best || row.updatedAt.getTime() > best.updatedAt.getTime()) best = row;
  }
  return best;
}

function isVisitScheduled(status: OpportunityFlowVisitInput["status"]): boolean {
  return status === "CONFIRMED";
}

function isVisitCompleted(status: OpportunityFlowVisitInput["status"]): boolean {
  return status === "COMPLETED";
}

function isVisitNoShow(status: OpportunityFlowVisitInput["status"]): boolean {
  return status === "NO_SHOW";
}

function visitScheduledAt(visit: OpportunityFlowVisitInput): Date | null {
  return resolveLeadVisitScheduledStart(visit);
}

function completedVisitSupportsQuoteReady(visit: OpportunityFlowVisitInput | null): boolean {
  if (!visit || !isVisitCompleted(visit.status)) return false;
  return visit.outcome === "QUOTE_READY";
}

function completedVisitNeedsFollowUp(visit: OpportunityFlowVisitInput | null): boolean {
  if (!visit) return false;
  if (isVisitNoShow(visit.status)) return true;
  if (!isVisitCompleted(visit.status)) return false;
  if (!visit.outcome || !visit.nextAction) return true;
  return (
    visit.outcome === "MISSING_INFORMATION" ||
    visit.outcome === "FOLLOW_UP_NEEDED" ||
    visit.outcome === "RESCHEDULE_NEEDED" ||
    visit.outcome === "QUOTE_NEEDS_REVISION" ||
    visit.nextAction === "FOLLOW_UP_CUSTOMER" ||
    visit.nextAction === "COLLECT_MISSING_INFO" ||
    visit.nextAction === "SCHEDULE_ANOTHER_VISIT"
  );
}

function isOpenChangeRequest(change: OpportunityFlowChangeRequestInput): boolean {
  return !change.resolvedAt;
}

function inferChangeRequestNeedsVisit(change: OpportunityFlowChangeRequestInput): boolean {
  if (typeof change.requiresVisit === "boolean") return change.requiresVisit;
  return /\b(site|visit|measure|inspect|onsite)\b/i.test(change.message);
}

/** Most recently updated non-archived quote — used when reusing an existing quote. */
export function pickMostRecentNonArchivedQuote(
  quotes: OpportunityFlowQuoteInput[],
): OpportunityFlowQuoteInput | null {
  let best: OpportunityFlowQuoteInput | null = null;
  for (const quote of quotes) {
    if (quote.status === "ARCHIVED") continue;
    if (!best || quote.updatedAt.getTime() > best.updatedAt.getTime()) {
      best = quote;
    }
  }
  return best;
}

/** Working draft for lead promotion — DRAFT quotes only, newest first. */
export function pickMostRecentDraftQuote(
  quotes: OpportunityFlowQuoteInput[],
): OpportunityFlowQuoteInput | null {
  return byMostRecent(quotes.filter((q) => q.status === "DRAFT"));
}

export function hasIssuedQuoteWithoutDraft(quotes: OpportunityFlowQuoteInput[]): boolean {
  if (quotes.some((q) => q.status === "DRAFT")) return false;
  return quotes.some(
    (q) => q.status !== "ARCHIVED" && (q.status === "SENT" || q.status === "APPROVED"),
  );
}

function buildDiscoverySecondaryActions(
  quotes: OpportunityFlowQuoteInput[],
  leadId: string,
): OpportunityAction[] {
  const draft = byMostRecent(quotes.filter((q) => q.status === "DRAFT"));
  if (draft) {
    return [
      {
        kind: "OPEN_DRAFT_QUOTE",
        label: "Build scope",
        targetQuoteId: draft.id,
      },
    ];
  }
  const working = pickMostRecentNonArchivedQuote(quotes);
  if (working) {
    return [
      {
        kind: "OPEN_QUOTE",
        label: "Open quote",
        targetQuoteId: working.id,
      },
    ];
  }
  return [{ kind: "START_QUOTE", label: "Start quote", targetLeadId: leadId }];
}

function classifyDraftCondition(
  quote: OpportunityFlowQuoteInput,
): {
  code: OpportunityConditionCode;
  label: string;
  summary: string;
  requirements: string[];
  actionLabel: string;
} {
  if (quote.lineItemCount <= 0) {
    return {
      code: "QUOTE_DRAFT_IN_PROGRESS",
      label: "Quote draft in progress",
      summary: "Draft exists but still needs scope lines before send.",
      requirements: ["Add scope line items", "Review pricing before send"],
      actionLabel: "Continue quote",
    };
  }
  return {
    code: "QUOTE_READY_TO_SEND",
    label: "Quote ready to send",
    summary: "Draft includes priced lines and can be sent to the customer.",
    requirements: ["Send quote to customer"],
    actionLabel: "Send quote",
  };
}

export function getOpportunityFlow(input: OpportunityFlowInput): OpportunityFlowView {
  const now = input.now ?? new Date();
  const { lead } = input;
  const report = evaluateLeadReadiness({
    contactName: lead.contactName,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    address: lead.jobsiteAddressLine,
    isAddressVerified: lead.isAddressVerified,
  });

  const satisfiedItems: string[] = [];
  if (report.hasIdentity) satisfiedItems.push("Identity");
  if (report.hasEmail) satisfiedItems.push("Email");
  if (report.hasPhone) satisfiedItems.push("Phone");
  if (report.hasAddress) satisfiedItems.push("Location");

  const activeJobQuote = input.quotes.find((q) => q.job?.status === "ACTIVE") ?? null;
  const approvedQuote = byMostRecent(
    input.quotes.filter((q) => q.status === "APPROVED"),
  );
  const sentQuote = byMostRecent(input.quotes.filter((q) => q.status === "SENT"));
  const draftQuotes = input.quotes.filter((q) => q.status === "DRAFT");
  const newestDraft = byMostRecent(draftQuotes);
  const newestIssued = byMostRecent(
    input.quotes.filter((q) => q.status === "SENT" || q.status === "APPROVED"),
  );
  const newestRevisionDraft = byMostRecent(draftQuotes.filter((q) => q.revisionOfQuoteId != null));

  const visits = input.visits;
  const pendingVisit = latestByDate(
    visits.filter((v) => v.status === "PENDING"),
    (v) => v.createdAt,
  );
  const scheduledVisit = latestByDate(
    visits.filter((v) => isVisitScheduled(v.status)),
    (v) => visitScheduledAt(v) ?? v.createdAt,
  );
  const completedVisit = latestByDate(
    visits.filter((v) => isVisitCompleted(v.status)),
    (v) => v.completedAt ?? visitScheduledAt(v) ?? v.createdAt,
  );
  const noShowVisit = latestByDate(
    visits.filter((v) => isVisitNoShow(v.status)),
    (v) => v.completedAt ?? visitScheduledAt(v) ?? v.createdAt,
  );

  const openChangeRequests = input.changeRequests.filter(isOpenChangeRequest);
  const latestOpenChangeRequest = latestByDate(openChangeRequests, (c) => c.createdAt);
  const openChangeNeedsVisit = openChangeRequests.some(inferChangeRequestNeedsVisit);

  const keyFacts: OpportunityFact[] = [];
  if (completedVisit) {
    keyFacts.push({
      label: "Sales visit",
      value: `Completed ${new Date(
        completedVisit.completedAt ?? visitScheduledAt(completedVisit) ?? completedVisit.createdAt,
      ).toLocaleDateString()}${completedVisit.outcome ? ` · ${completedVisit.outcome.replaceAll("_", " ").toLowerCase()}` : ""}`,
    });
  } else if (noShowVisit) {
    keyFacts.push({
      label: "Sales visit",
      value: `No-show ${new Date(
        noShowVisit.completedAt ?? visitScheduledAt(noShowVisit) ?? noShowVisit.createdAt,
      ).toLocaleDateString()}`,
    });
  } else if (scheduledVisit) {
    keyFacts.push({
      label: "Sales visit",
      value: `Scheduled ${new Date(
        visitScheduledAt(scheduledVisit) ?? scheduledVisit.createdAt,
      ).toLocaleString()}${scheduledVisit.hasAccessDetails === false ? " · missing access" : ""}`,
    });
  } else if (pendingVisit) {
    keyFacts.push({ label: "Sales visit", value: "Requested, not scheduled" });
  }

  if (newestIssued) {
    keyFacts.push({
      label: "Latest issued quote",
      value: `${newestIssued.status} · ${newestIssued.title}`,
    });
  }
  if (newestDraft) {
    keyFacts.push({
      label: "Working quote",
      value: `Draft · ${newestDraft.lineItemCount} lines`,
    });
  }
  if (latestOpenChangeRequest) {
    keyFacts.push({
      label: "Customer request",
      value: "Open change request",
    });
  }

  const recentEvents: OpportunityEvent[] = [];
  if (latestOpenChangeRequest) {
    recentEvents.push({
      label: "Customer requested changes",
      detail: latestOpenChangeRequest.message.slice(0, 160),
      at: latestOpenChangeRequest.createdAt.toISOString(),
    });
  }
  if (sentQuote) {
    recentEvents.push({
      label: "Quote sent",
      at: iso(sentQuote.latestSendAt ?? sentQuote.updatedAt),
    });
  }
  if (completedVisit) {
    recentEvents.push({
      label: "Sales visit completed",
      at: iso(completedVisit.completedAt ?? visitScheduledAt(completedVisit) ?? completedVisit.createdAt),
    });
  }
  if (noShowVisit) {
    recentEvents.push({
      label: "Sales visit no-show",
      at: iso(noShowVisit.completedAt ?? visitScheduledAt(noShowVisit) ?? noShowVisit.createdAt),
    });
  }
  if (scheduledVisit) {
    recentEvents.push({
      label: "Sales visit scheduled",
      at: iso(visitScheduledAt(scheduledVisit) ?? scheduledVisit.createdAt),
    });
  }

  const resultBase = {
    satisfiedItems,
    keyFacts,
    recentEvents,
  };

  if (lead.status === "LOST" || lead.status === "ARCHIVED") {
    const conditionStartedAt = iso(lead.followUpAt ?? null);
    return {
      phase: "LOST",
      conditionCode: "LOST",
      conditionLabel: "Lost",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: "Lead is marked lost.",
      requirements: [],
      secondaryActions: [],
      primaryAction: null,
      ...resultBase,
    };
  }

  if (lead.status === "ON_HOLD") {
    const conditionStartedAt = iso(lead.followUpAt ?? null);
    return {
      phase: "PAUSED",
      conditionCode: "PAUSED",
      conditionLabel: "Paused",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: lead.followUpAt
        ? `Follow up on ${lead.followUpAt.toLocaleDateString()} to resume.`
        : "Lead is paused until follow-up.",
      requirements: [],
      secondaryActions: [],
      primaryAction: { kind: "RESUME_OPPORTUNITY", label: "Resume lead", targetLeadId: lead.id },
      ...resultBase,
    };
  }

  if (activeJobQuote?.job) {
    const conditionStartedAt = iso(activeJobQuote.updatedAt);
    return {
      phase: "WON",
      conditionCode: "JOB_ACTIVE",
      conditionLabel: "Job active",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: "Sold work is active on the job board.",
      requirements: [],
      secondaryActions: [],
      primaryAction: {
        kind: "OPEN_JOB",
        label: "Open job",
        targetJobId: activeJobQuote.job.id,
      },
      ...resultBase,
    };
  }

  if (approvedQuote) {
    const conditionStartedAt = iso(approvedQuote.latestApprovalAt ?? approvedQuote.updatedAt);
    return {
      phase: "WON",
      conditionCode: "APPROVED_READY_FOR_JOB",
      conditionLabel: "Approved, ready for job",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: "Quote is approved — build the execution plan, then activate the job.",
      requirements: ["Build execution plan", "Activate job"],
      secondaryActions: [],
      primaryAction: {
        kind: "OPEN_EXECUTION_REVIEW",
        label: "Build execution plan",
        targetQuoteId: approvedQuote.id,
      },
      ...resultBase,
    };
  }

  if (latestOpenChangeRequest) {
    if (openChangeNeedsVisit && !scheduledVisit && !completedVisit) {
      const conditionStartedAt = iso(latestOpenChangeRequest.createdAt);
      return {
        phase: "ESTIMATING",
        conditionCode: "FOLLOW_UP_VISIT_REQUIRED",
        conditionLabel: "Follow-up visit needed",
        conditionStartedAt,
        ageLabel: formatAge(conditionStartedAt, now),
        summary: "Customer changes require another visit.",
        requirements: ["Schedule follow-up visit"],
        secondaryActions: [],
        primaryAction: {
          kind: "SCHEDULE_SALES_VISIT",
          label: "Schedule site visit",
          targetLeadId: lead.id,
        },
        ...resultBase,
      };
    }

    if (newestRevisionDraft) {
      const draft = classifyDraftCondition(newestRevisionDraft);
      const conditionStartedAt = iso(newestRevisionDraft.createdAt);
      return {
        phase: "ESTIMATING",
        conditionCode:
          draft.code === "QUOTE_READY_TO_SEND"
            ? "REVISION_READY_TO_SEND"
            : "REVISION_DRAFT_IN_PROGRESS",
        conditionLabel:
          draft.code === "QUOTE_READY_TO_SEND"
            ? "Revision ready to send"
            : "Revision draft in progress",
        conditionStartedAt,
        ageLabel: formatAge(conditionStartedAt, now),
        summary:
          draft.code === "QUOTE_READY_TO_SEND"
            ? "Revision draft is ready to send back to the customer."
            : "Revision draft is in progress after customer change request.",
        requirements: draft.requirements,
        secondaryActions: [],
        primaryAction: {
          kind: draft.code === "QUOTE_READY_TO_SEND" ? "SEND_QUOTE" : "OPEN_DRAFT_QUOTE",
          label: draft.actionLabel,
          targetQuoteId: newestRevisionDraft.id,
        },
        ...resultBase,
      };
    }

    const conditionStartedAt = iso(latestOpenChangeRequest.createdAt);
    return {
      phase: "ESTIMATING",
      conditionCode: "CUSTOMER_REQUESTED_CHANGES",
      conditionLabel: "Customer requested changes",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: "Customer asked for changes; create a revision draft to continue.",
      requirements: ["Create revision draft"],
      secondaryActions: [],
      primaryAction: {
        kind: "CREATE_REVISION_DRAFT",
        label: "Create revision draft",
        targetQuoteId: latestOpenChangeRequest.quoteId,
        targetChangeRequestId: latestOpenChangeRequest.id,
      },
      ...resultBase,
    };
  }

  if (newestRevisionDraft && newestIssued) {
    const draft = classifyDraftCondition(newestRevisionDraft);
    const conditionStartedAt = iso(newestRevisionDraft.createdAt);
    return {
      phase: "ESTIMATING",
      conditionCode:
        draft.code === "QUOTE_READY_TO_SEND"
          ? "REVISION_READY_TO_SEND"
          : "REVISION_DRAFT_IN_PROGRESS",
      conditionLabel:
        draft.code === "QUOTE_READY_TO_SEND"
          ? "Revision ready to send"
          : "Revision draft in progress",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary:
        draft.code === "QUOTE_READY_TO_SEND"
          ? "A revision draft is ready to send to the customer."
          : "A revision draft is in progress after a previously issued quote.",
      requirements: draft.requirements,
      secondaryActions: [],
      primaryAction: {
        kind: draft.code === "QUOTE_READY_TO_SEND" ? "SEND_QUOTE" : "OPEN_DRAFT_QUOTE",
        label: draft.actionLabel,
        targetQuoteId: newestRevisionDraft.id,
      },
      ...resultBase,
    };
  }

  if (sentQuote) {
    const conditionStartedAt = iso(sentQuote.latestSendAt ?? sentQuote.updatedAt);
    return {
      phase: "CUSTOMER_REVIEW",
      conditionCode: "WAITING_ON_CUSTOMER",
      conditionLabel: "Waiting on customer",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: "Quote has been sent and is awaiting customer response.",
      requirements: [],
      primaryAction: {
        kind: "FOLLOW_UP_CUSTOMER",
        label: "Follow up",
        targetQuoteId: sentQuote.id,
      },
      secondaryActions: [
        { kind: "OPEN_QUOTE", label: "Open quote", targetQuoteId: sentQuote.id },
      ],
      ...resultBase,
    };
  }

  if (scheduledVisit) {
    const conditionStartedAt = iso(visitScheduledAt(scheduledVisit) ?? scheduledVisit.createdAt);
    return {
      phase: "DISCOVERY",
      conditionCode: "SALES_VISIT_SCHEDULED",
      conditionLabel: "Sales visit scheduled",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: scheduledVisit.hasAccessDetails === false
        ? "Visit is scheduled but access details are still missing."
        : "Visit is on the calendar.",
      requirements: [
        ...(scheduledVisit.hasAccessDetails === false ? ["Add access details"] : []),
        "Complete site visit",
      ],
      secondaryActions: buildDiscoverySecondaryActions(input.quotes, lead.id),
      primaryAction: {
        kind: "COMPLETE_SALES_VISIT",
        label: "Complete site visit",
        targetVisitRequestId: scheduledVisit.id,
        targetLeadId: lead.id,
      },
      ...resultBase,
    };
  }

  if (noShowVisit && completedVisitNeedsFollowUp(noShowVisit)) {
    const conditionStartedAt = iso(noShowVisit.completedAt ?? visitScheduledAt(noShowVisit) ?? noShowVisit.createdAt);
    return {
      phase: "DISCOVERY",
      conditionCode: "NEEDS_SALES_VISIT",
      conditionLabel: "No-show recovery",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: "Previous visit was a no-show and needs follow-up.",
      requirements: ["Reschedule visit or follow up with customer"],
      secondaryActions: buildDiscoverySecondaryActions(input.quotes, lead.id),
      primaryAction: {
        kind: "SCHEDULE_SALES_VISIT",
        label: "Schedule another visit",
        targetLeadId: lead.id,
      },
      ...resultBase,
    };
  }

  if (completedVisit && completedVisitNeedsFollowUp(completedVisit)) {
    const conditionStartedAt = iso(completedVisit.completedAt ?? visitScheduledAt(completedVisit) ?? completedVisit.createdAt);
    if (completedVisit.outcome === "RESCHEDULE_NEEDED" || completedVisit.nextAction === "SCHEDULE_ANOTHER_VISIT") {
      return {
        phase: "DISCOVERY",
        conditionCode: "NEEDS_SALES_VISIT",
        conditionLabel: "Reschedule visit",
        conditionStartedAt,
        ageLabel: formatAge(conditionStartedAt, now),
        summary: "Completed visit outcome requires another site visit.",
        requirements: ["Schedule follow-up visit"],
        secondaryActions: buildDiscoverySecondaryActions(input.quotes, lead.id),
        primaryAction: {
          kind: "SCHEDULE_SALES_VISIT",
          label: "Schedule site visit",
          targetLeadId: lead.id,
        },
        ...resultBase,
      };
    }
    if (completedVisit.outcome === "MISSING_INFORMATION" || completedVisit.nextAction === "COLLECT_MISSING_INFO") {
      return {
        phase: "DISCOVERY",
        conditionCode: "NEEDS_INTAKE_DETAILS",
        conditionLabel: "Missing visit information",
        conditionStartedAt,
        ageLabel: formatAge(conditionStartedAt, now),
        summary: "Site visit completed but more information is needed before quoting.",
        requirements: ["Collect missing information"],
        secondaryActions: buildDiscoverySecondaryActions(input.quotes, lead.id),
        primaryAction: {
          kind: "EDIT_CONTACT_INFO",
          label: "Add details",
          targetLeadId: lead.id,
        },
        ...resultBase,
      };
    }
    if (completedVisit.outcome === "FOLLOW_UP_NEEDED" || completedVisit.nextAction === "FOLLOW_UP_CUSTOMER") {
      return {
        phase: "DISCOVERY",
        conditionCode: "NEEDS_SALES_VISIT",
        conditionLabel: "Follow-up needed",
        conditionStartedAt,
        ageLabel: formatAge(conditionStartedAt, now),
        summary: "Site visit completed and customer follow-up is required.",
        requirements: ["Follow up with customer"],
        secondaryActions: buildDiscoverySecondaryActions(input.quotes, lead.id),
        primaryAction: {
          kind: "FOLLOW_UP_CUSTOMER",
          label: "Follow up",
          targetLeadId: lead.id,
        },
        ...resultBase,
      };
    }
    if (completedVisit.outcome === "QUOTE_NEEDS_REVISION" || completedVisit.nextAction === "OPEN_OR_REVISE_QUOTE") {
      const working = pickMostRecentNonArchivedQuote(input.quotes);
      return {
        phase: "ESTIMATING",
        conditionCode: "QUOTE_DRAFT_IN_PROGRESS",
        conditionLabel: "Revise quote after visit",
        conditionStartedAt,
        ageLabel: formatAge(conditionStartedAt, now),
        summary: "Site visit outcome requires quote revision.",
        requirements: ["Open or revise quote"],
        secondaryActions: [],
        primaryAction: working
          ? { kind: "OPEN_QUOTE", label: "Open quote", targetQuoteId: working.id }
          : { kind: "START_QUOTE", label: "Start quote", targetLeadId: lead.id },
        ...resultBase,
      };
    }
    if (completedVisit.outcome === "DISQUALIFIED") {
      return {
        phase: "LOST",
        conditionCode: "LOST",
        conditionLabel: "Disqualified after visit",
        conditionStartedAt,
        ageLabel: formatAge(conditionStartedAt, now),
        summary: "Site visit outcome marked this lead as disqualified.",
        requirements: ["Close or disqualify lead"],
        secondaryActions: [],
        primaryAction: {
          kind: "EDIT_CONTACT_INFO",
          label: "Review lead",
          targetLeadId: lead.id,
        },
        ...resultBase,
      };
    }
  }

  if (completedVisit && !completedVisit.outcome) {
    const conditionStartedAt = iso(completedVisit.completedAt ?? visitScheduledAt(completedVisit) ?? completedVisit.createdAt);
    return {
      phase: "DISCOVERY",
      conditionCode: "SALES_VISIT_SCHEDULED",
      conditionLabel: "Visit completed — outcome needed",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: "Site visit is completed but outcome and next action are missing.",
      requirements: ["Record visit outcome"],
      secondaryActions: buildDiscoverySecondaryActions(input.quotes, lead.id),
      primaryAction: {
        kind: "COMPLETE_SALES_VISIT",
        label: "Record visit outcome",
        targetVisitRequestId: completedVisit.id,
        targetLeadId: lead.id,
      },
      ...resultBase,
    };
  }

  if (pendingVisit) {
    const conditionStartedAt = iso(pendingVisit.createdAt);
    return {
      phase: "DISCOVERY",
      conditionCode: "NEEDS_SALES_VISIT",
      conditionLabel: "Site visit needed",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: "Customer requested a site visit.",
      requirements: ["Schedule site visit"],
      secondaryActions: buildDiscoverySecondaryActions(input.quotes, lead.id),
      primaryAction: {
        kind: "SCHEDULE_SALES_VISIT",
        label: "Schedule site visit",
        targetVisitRequestId: pendingVisit.id,
      },
      ...resultBase,
    };
  }

  if (newestDraft) {
    const draft = classifyDraftCondition(newestDraft);
    const conditionStartedAt = iso(newestDraft.createdAt);
    return {
      phase: "ESTIMATING",
      conditionCode: draft.code,
      conditionLabel:
        draft.code === "QUOTE_READY_TO_SEND"
          ? "Quote ready to send"
          : "Quote draft in progress",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: draft.summary,
      requirements: draft.requirements,
      secondaryActions: [],
      primaryAction: {
        kind: draft.code === "QUOTE_READY_TO_SEND" ? "SEND_QUOTE" : "OPEN_DRAFT_QUOTE",
        label: draft.actionLabel,
        targetQuoteId: newestDraft.id,
      },
      ...resultBase,
    };
  }

  if (!report.isReady) {
    const conditionStartedAt = iso(now);
    return {
      phase: "INTAKE",
      conditionCode: "NEEDS_INTAKE_DETAILS",
      conditionLabel: "Intake details needed",
      conditionStartedAt,
      ageLabel: null,
      summary: "Missing contact or address info.",
      requirements: ["Identity", "Email", "Phone", "Location"].filter(
        (item) => !satisfiedItems.includes(item),
      ),
      secondaryActions: [],
      primaryAction: {
        kind: "EDIT_CONTACT_INFO",
        label: "Add details",
        targetLeadId: lead.id,
      },
      ...resultBase,
    };
  }

  const conditionStartedAt = iso(completedVisit?.completedAt ?? completedVisit?.createdAt ?? now);

  if (completedVisit && completedVisitSupportsQuoteReady(completedVisit)) {
    return {
      phase: "ESTIMATING",
      conditionCode: "READY_TO_QUOTE",
      conditionLabel: "Ready to quote",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: "Site visit completed and quote can start.",
      requirements: [],
      secondaryActions: [],
      primaryAction: { kind: "START_QUOTE", label: "Build quote", targetLeadId: lead.id },
      ...resultBase,
    };
  }

  if (!lead.customerId && input.hasExistingCustomerMatch) {
    return {
      phase: "INTAKE",
      conditionCode: "CUSTOMER_MATCH_NEEDS_REVIEW",
      conditionLabel: "Customer match needs review",
      conditionStartedAt,
      ageLabel: formatAge(conditionStartedAt, now),
      summary: "Existing customer found. Review before quoting.",
      requirements: ["Review customer match"],
      secondaryActions: [],
      primaryAction: {
        kind: "REVIEW_CUSTOMER_MATCH",
        label: "Review match",
        targetLeadId: lead.id,
      },
      ...resultBase,
    };
  }

  return {
    phase: "ESTIMATING",
    conditionCode: "READY_TO_QUOTE",
    conditionLabel: "Ready to quote",
    conditionStartedAt,
    ageLabel: formatAge(conditionStartedAt, now),
    summary: "Lead has enough detail to start quoting.",
    requirements: [],
    secondaryActions: [],
    primaryAction: { kind: "START_QUOTE", label: "Build quote", targetLeadId: lead.id },
    ...resultBase,
  };
}

export function resolveOpportunityActionHref(
  action: OpportunityAction,
  ctx: { leadId: string },
): string {
  switch (action.kind) {
    case "EDIT_CONTACT_INFO":
      return `/leads/${ctx.leadId}/edit`;
    case "REVIEW_CUSTOMER_MATCH":
      return `/leads/${ctx.leadId}#customer-link`;
    case "START_QUOTE":
      return opportunityWorkspaceHref(ctx.leadId, "quote");
    case "OPEN_DRAFT_QUOTE":
    case "OPEN_QUOTE":
    case "FOLLOW_UP_CUSTOMER":
    case "CREATE_REVISION_DRAFT":
      return opportunityWorkspaceHref(ctx.leadId, "quote");
    case "SEND_QUOTE":
      return opportunityWorkspaceHref(ctx.leadId, "quote", "commercial-send-acceptance");
    case "SCHEDULE_SALES_VISIT":
      return opportunityWorkspaceHref(
        action.targetLeadId ?? ctx.leadId,
        "review",
      );
    case "COMPLETE_SALES_VISIT":
      return opportunityWorkspaceHref(
        action.targetLeadId ?? ctx.leadId,
        "review",
      );
    case "OPEN_EXECUTION_REVIEW":
      return action.targetQuoteId
        ? `/quotes/${action.targetQuoteId}/execution-review`
        : `/leads/${ctx.leadId}`;
    case "OPEN_JOB":
      return action.targetJobId ? `/jobs/${action.targetJobId}` : "/jobs";
    case "RESUME_OPPORTUNITY":
      return opportunityWorkspaceHref(ctx.leadId, "review");
  }
}
