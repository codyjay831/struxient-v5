"use client";

import {
  buildReviewDisplayForPayload,
  type LeadCommercialSurfacePayload,
} from "@/lib/lead-commercial-surface/loader";
import { formatAttachmentFileSize, formatLeadChannel } from "@/lib/lead-display";
import { LeadVisitRequestStatus, QuoteStatus } from "@prisma/client";
import {
  formatMoneyCents,
  formatQuoteStatus,
  quoteStatusBadgeTone,
} from "@/lib/quote-display";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  History,
  MapPin,
  Paperclip,
  Pencil,
  X,
} from "lucide-react";
import {
  resolveOpportunityActionHref,
  type OpportunityAction,
  type OpportunityFlowView,
} from "@/lib/opportunity-flow";
import { opportunityActionOpensQuoteTab } from "@/lib/opportunity-tab-routing";
import { StartQuoteFromLeadButton } from "@/components/leads/start-quote-from-lead-button";
import { workstationTelemetry } from "@/lib/workstation/telemetry";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  closeOrPauseLeadWorkspaceAction,
  resumeOpportunityWorkspaceAction,
} from "@/app/(workspace)/leads/lead-workspace-actions";
import { createRevisionDraftForQuoteChangeRequestAction } from "@/app/(workspace)/quotes/quote-change-request-actions";
import { useRouter } from "next/navigation";
import { LeadReviewQuickActions } from "@/components/leads/lead-review-quick-actions";
import { LeadCustomerActionPanel } from "@/components/leads/lead-customer-action-panel";
import { LeadAddressResolvePanel } from "@/components/leads/lead-address-resolve-panel";
import { CloseOrPauseLeadForm } from "@/components/leads/close-or-pause-lead-form";
import { SiteDetailsRow } from "@/components/site-details/site-details-row";
import { SiteDetailsDrawer } from "@/components/site-details/site-details-drawer";
import { LeadSiteVisitSchedulerDialog } from "@/components/leads/lead-site-visit-scheduler-dialog";
import {
  findVisitForCompletionAction,
  LeadVisitCompletionDialog,
} from "@/components/leads/lead-visit-completion-dialog";
import { LeadVisitAccessDetailsPanel } from "@/components/leads/lead-visit-access-details-panel";
import type { LeadVisitRequestPayload } from "@/lib/lead-display";
import type { SchedulerStaffOption } from "@/lib/lead-commercial-surface/loader";
import {
  formatLeadVisitNextActionLabel,
  formatLeadVisitOutcomeLabel,
  formatLeadVisitStatusLabel,
} from "@/lib/scheduling/lead-visit-presentation";
import { resolveLeadVisitScheduledStart } from "@/lib/scheduling/lead-visit-schedule-service";
import { isAssignedVisitFieldAction } from "@/lib/scheduling/assigned-lead-visit-surface-presentation";
import { toSiteDetailsRowData } from "@/lib/site-details/presentation";
import { Button, ButtonLink, buttonClassName } from "@/components/ui/button";
import type { LeadReviewDisplay } from "@/lib/lead-review-display";

export interface LeadCommercialSurfaceProps {
  payload: LeadCommercialSurfacePayload;
  entryPoint?: "workstation" | "record" | "sales_modal";
  embeddedInOpportunityWorkspace?: boolean;
  onMutationSuccess?: () => void;
  onNavigateToQuoteTab?: (quoteId?: string) => void;
  onClose?: () => void;
}

const sectionLabelClass =
  "text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle";

const panelClass = "rounded-lg border border-border bg-surface";

type FactTile = {
  label: string;
  value: string;
  sub?: string | null;
};

function conditionTone(flow: OpportunityFlowView): StatusBadgeTone {
  if (flow.phase === "WON") return "approved";
  if (flow.phase === "CUSTOMER_REVIEW") return "sent";
  if (flow.phase === "LOST") return "neutral";
  if (flow.phase === "PAUSED") return "warning";
  return "draft";
}

function filterVisibleRequirements(flow: OpportunityFlowView): string[] {
  return flow.requirements.filter((req) => {
    if (req === "Review customer match") return false;
    const primaryAction = flow.primaryAction;
    const normalizedRequirement = req.trim().toLowerCase();
    const normalizedAction = primaryAction?.label.trim().toLowerCase();
    if (normalizedAction && normalizedRequirement === normalizedAction) return false;
    if (
      primaryAction?.kind === "SCHEDULE_SALES_VISIT" &&
      normalizedRequirement.startsWith("schedule ")
    ) {
      return false;
    }
    if (
      primaryAction?.kind === "COMPLETE_SALES_VISIT" &&
      normalizedRequirement.startsWith("complete ")
    ) {
      return false;
    }
    return true;
  });
}

function buildCuratedFacts(
  payload: LeadCommercialSurfacePayload,
  reviewDisplay: LeadReviewDisplay,
): FactTile[] {
  const { lead, customer, linkedQuotes, reviewViewModel } = payload;
  const facts: FactTile[] = [];

  const contactParts = [lead.email?.trim(), lead.phone?.trim()].filter(Boolean);
  facts.push({
    label: "Customer",
    value: customer?.displayName || lead.contactName?.trim() || "Not linked",
    sub:
      customer && contactParts.length > 0
        ? contactParts.join(" · ")
        : contactParts.length > 0
          ? contactParts.join(" · ")
          : customer
            ? "Linked customer record"
            : "Link or create a customer",
  });

  const requestType =
    lead.requestType?.trim() ||
    reviewDisplay.requestDetailFields.find((f) => f.label === "Request type")?.value ||
    null;
  if (requestType) {
    facts.push({
      label: "Request type",
      value: requestType,
      sub: formatLeadChannel(lead.channel),
    });
  }

  const scope =
    lead.scopeSummary?.trim() ||
    reviewViewModel.scopeText?.trim() ||
    reviewDisplay.requestDetailFields.find((f) => f.label === "What they need")?.value ||
    null;
  if (scope) {
    facts.push({ label: "Work requested", value: scope });
  }

  const timing = reviewDisplay.requestDetailFields.find((f) => f.label === "Timing")?.value;
  const urgency = reviewDisplay.requestDetailFields.find((f) => f.label === "Urgency")?.value;
  if (timing || urgency) {
    facts.push({
      label: "Timing",
      value: timing || urgency || "Not specified",
      sub: timing && urgency ? urgency : null,
    });
  }

  facts.push({
    label: "Jobsite",
    value: reviewDisplay.jobsiteSection.jobsiteLine || "No address yet",
    sub:
      reviewDisplay.jobsiteSection.verificationLabel === "verified"
        ? "Address verified"
        : reviewDisplay.jobsiteSection.verificationLabel === "needs_review"
          ? "Needs review"
          : null,
  });

  const activeQuote = linkedQuotes.find((q) => q.status !== "ARCHIVED") ?? null;
  facts.push({
    label: "Quote",
    value: activeQuote
      ? formatQuoteStatus(activeQuote.status as QuoteStatus)
      : "No quote yet",
    sub: activeQuote
      ? `${activeQuote._count.lineItems} line${activeQuote._count.lineItems === 1 ? "" : "s"} · ${formatMoneyCents(activeQuote.totalCents)}`
      : null,
  });

  facts.push({
    label: "Files",
    value:
      reviewViewModel.attachments.length > 0
        ? `${reviewViewModel.attachments.length} attached`
        : "None attached",
    sub:
      reviewViewModel.attachments.length === 0 ? "Ask customer for photos if needed" : null,
  });

  return facts.slice(0, 8);
}

function actionButtonClass(variant: "primary" | "secondary", fullWidth = false) {
  return buttonClassName({
    variant: variant === "primary" ? "primary" : "secondary",
    size: "sm",
    className: fullWidth ? "w-full justify-center" : "",
  });
}

function OpportunityActionControl({
  action,
  leadId,
  visitRequests,
  schedulerStaffOptions,
  variant,
  isAssignedVisitMode = false,
  onReviewCustomerMatch,
  onMutationSuccess,
  onNavigateToQuoteTab,
  fullWidth = false,
}: {
  action: OpportunityAction;
  leadId: string;
  visitRequests: LeadVisitRequestPayload[];
  schedulerStaffOptions: SchedulerStaffOption[];
  variant: "primary" | "secondary";
  isAssignedVisitMode?: boolean;
  onReviewCustomerMatch?: () => void;
  onMutationSuccess?: () => void;
  onNavigateToQuoteTab?: (quoteId?: string) => void;
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const btnClass = actionButtonClass(variant, fullWidth);

  if (isAssignedVisitMode && !isAssignedVisitFieldAction(action.kind)) {
    return null;
  }

  if (action.kind === "START_QUOTE") {
    return (
      <div className={fullWidth ? "w-full [&_button]:w-full" : undefined}>
        <StartQuoteFromLeadButton
          leadId={leadId}
          label={action.label}
          variant={variant}
          skipRouterRefresh={Boolean(onNavigateToQuoteTab)}
          onQuoteStarted={
            onNavigateToQuoteTab
              ? (quoteId) => onNavigateToQuoteTab(quoteId)
              : undefined
          }
        />
      </div>
    );
  }

  if (action.kind === "REVIEW_CUSTOMER_MATCH") {
    return (
      <button
        type="button"
        onClick={() => onReviewCustomerMatch?.()}
        title="Review suggested customer matches before building a quote."
        className={btnClass}
      >
        {action.label}
      </button>
    );
  }

  if (action.kind === "CREATE_REVISION_DRAFT" && action.targetChangeRequestId) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await createRevisionDraftForQuoteChangeRequestAction(
                action.targetChangeRequestId!,
              );
              if (!result.ok) {
                setError(result.error);
                return;
              }
              if (!result.revisedQuoteId) {
                setError("Could not create revision draft.");
                return;
              }
              if (onNavigateToQuoteTab) {
                onNavigateToQuoteTab(result.revisedQuoteId);
              } else {
                router.push(`/leads/${leadId}?tab=quote`);
              }
              onMutationSuccess?.();
            });
          }}
          className={btnClass}
        >
          {isPending ? "Creating revision..." : action.label}
        </button>
        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (action.kind === "RESUME_OPPORTUNITY") {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await resumeOpportunityWorkspaceAction(leadId);
              if (!result.success) {
                setError(result.error ?? "Could not resume this lead.");
                return;
              }
              onMutationSuccess?.();
            });
          }}
          className={btnClass}
        >
          {isPending ? "Resuming..." : action.label}
        </button>
        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (action.kind === "SCHEDULE_SALES_VISIT" && action.targetVisitRequestId) {
    const visit =
      visitRequests.find((request) => request.id === action.targetVisitRequestId) ?? null;

    return (
      <>
        <button type="button" onClick={() => setSchedulerOpen(true)} className={btnClass}>
          {variant === "primary" ? "Schedule visit" : action.label}
        </button>
        <LeadSiteVisitSchedulerDialog
          open={schedulerOpen}
          onOpenChange={setSchedulerOpen}
          requestId={action.targetVisitRequestId}
          mode="confirm"
          initialDate={visit?.requestedDate ?? visit?.scheduledStartAt ?? null}
          requestedWindow={visit?.requestedWindow ?? null}
          assigneeOptions={schedulerStaffOptions}
          initialAssigneeId={visit?.assignedUserId ?? null}
          initialDurationMinutes={visit?.estimatedDurationMinutes ?? null}
          initialArrivalWindowLabel={visit?.arrivalWindowLabel ?? null}
          initialAccessSnapshot={visit?.accessSnapshot ?? null}
          initialSiteContactSnapshot={visit?.siteContactSnapshot ?? null}
          expectedUpdatedAt={visit?.updatedAt}
          onScheduled={onMutationSuccess}
        />
      </>
    );
  }

  if (action.kind === "COMPLETE_SALES_VISIT") {
    const visit = findVisitForCompletionAction(visitRequests, action.targetVisitRequestId);

    return (
      <>
        <button type="button" onClick={() => setCompletionOpen((open) => !open)} className={btnClass}>
          {action.label}
        </button>
        {visit ? (
          <div className={completionOpen ? "mt-3" : "hidden"}>
            <LeadVisitCompletionDialog
              requestId={visit.id}
              visitStatus={visit.status}
              expectedUpdatedAt={visit.updatedAt}
              onCompleted={() => {
                setCompletionOpen(false);
                onMutationSuccess?.();
              }}
            />
          </div>
        ) : null}
      </>
    );
  }

  const href = resolveOpportunityActionHref(action, { leadId });

  if (onNavigateToQuoteTab && opportunityActionOpensQuoteTab(action.kind)) {
    return (
      <button
        type="button"
        onClick={() => onNavigateToQuoteTab(action.targetQuoteId)}
        className={btnClass}
      >
        {action.label}
      </button>
    );
  }

  return (
    <ButtonLink href={href} variant={variant === "primary" ? "primary" : "secondary"} size="sm" className={fullWidth ? "w-full justify-center" : ""}>
      {action.label}
    </ButtonLink>
  );
}

function FactGrid({ facts }: { facts: FactTile[] }) {
  return (
    <div className={`${panelClass} grid grid-cols-2 divide-x divide-y divide-border overflow-hidden lg:grid-cols-4`}>
      {facts.map((fact) => (
        <div key={fact.label} className="min-h-[4.5rem] p-3.5">
          <p className={sectionLabelClass}>{fact.label}</p>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">{fact.value}</p>
          {fact.sub ? (
            <p className="mt-0.5 text-xs text-foreground-muted">{fact.sub}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function VisitList({
  visitRequests,
  onSaved,
}: {
  visitRequests: LeadVisitRequestPayload[];
  onSaved: () => void;
}) {
  if (visitRequests.length === 0) return null;

  return (
    <div className="space-y-2">
      {visitRequests.map((visit) => {
        const scheduledStart = resolveLeadVisitScheduledStart(visit);
        return (
          <div key={visit.id} className="rounded-md border border-border px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">
                {formatLeadVisitStatusLabel(visit.status)}
              </span>
              {scheduledStart ? (
                <span className="text-xs text-foreground-muted">
                  {scheduledStart.toLocaleString()}
                </span>
              ) : null}
            </div>
            {visit.assignedUserLabel ? (
              <p className="mt-1 text-xs text-foreground-muted">
                Assigned: {visit.assignedUserLabel}
              </p>
            ) : null}
            {visit.arrivalWindowLabel ? (
              <p className="text-xs text-foreground-muted">
                Arrival: {visit.arrivalWindowLabel}
              </p>
            ) : null}
            {!visit.hasAccessDetails && visit.status === LeadVisitRequestStatus.CONFIRMED ? (
              <p className="mt-1 text-xs text-warning">Access details missing</p>
            ) : null}
            {visit.outcome ? (
              <p className="mt-1 text-xs text-foreground-muted">
                Outcome: {formatLeadVisitOutcomeLabel(visit.outcome)}
              </p>
            ) : null}
            {visit.nextAction ? (
              <p className="text-xs text-foreground-muted">
                Next: {formatLeadVisitNextActionLabel(visit.nextAction)}
              </p>
            ) : null}
            <LeadVisitAccessDetailsPanel visit={visit} onSaved={onSaved} />
          </div>
        );
      })}
    </div>
  );
}

export function LeadCommercialSurface({
  payload,
  entryPoint = "record",
  embeddedInOpportunityWorkspace = false,
  onMutationSuccess,
  onNavigateToQuoteTab,
  onClose,
}: LeadCommercialSurfaceProps) {
  const {
    lead,
    customer,
    linkedQuotes,
    hasBlockingCustomerMatch,
    opportunityFlow,
    matchHints,
    reviewViewModel,
    serviceAddressContext,
    visitRequests,
    surfaceMode,
    schedulerStaffOptions,
    assignedFieldStatusLine,
  } = payload;

  const isAssignedVisitMode = surfaceMode === "assigned_visit";
  const router = useRouter();
  const notifyMutationSuccess = useCallback(() => {
    if (onMutationSuccess) {
      onMutationSuccess();
    } else {
      router.refresh();
    }
  }, [onMutationSuccess, router]);

  const [showLegacyNotes, setShowLegacyNotes] = useState(false);
  const [showSecondaryDetails, setShowSecondaryDetails] = useState(false);
  const [closePanelOpen, setClosePanelOpen] = useState(false);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [siteDrawerOpen, setSiteDrawerOpen] = useState(false);
  const [activityTab, setActivityTab] = useState<"activity" | "files">("activity");
  const customerSectionRef = useRef<HTMLDivElement>(null);
  const addressVerifyRef = useRef<HTMLDivElement>(null);

  const siteData = toSiteDetailsRowData({
    line: lead.jobsiteAddressLine || null,
    serviceLocationId: lead.serviceLocationId,
    siteDetails: lead.siteDetails,
  });

  const editHref = `/leads/${lead.id}/edit`;
  const isModalContext = Boolean(onClose);
  const isFullRecord =
    entryPoint === "record" && !isModalContext && !isAssignedVisitMode && !embeddedInOpportunityWorkspace;
  const isCompact = !isFullRecord;

  const reviewDisplay = useMemo(
    () => buildReviewDisplayForPayload(payload, entryPoint),
    [payload, entryPoint],
  );

  const curatedFacts = useMemo(
    () => buildCuratedFacts(payload, reviewDisplay),
    [payload, reviewDisplay],
  );

  const visibleRequirements = useMemo(
    () => filterVisibleRequirements(opportunityFlow).slice(0, 3),
    [opportunityFlow],
  );

  const activeQuote = useMemo(
    () => linkedQuotes.find((q) => q.status !== "ARCHIVED") ?? null,
    [linkedQuotes],
  );

  const readinessItems = useMemo(() => {
    const missing = visibleRequirements.map((label) => ({ label, ok: false }));
    const done = opportunityFlow.satisfiedItems.slice(0, 4).map((label) => ({
      label,
      ok: true,
    }));
    return [...missing, ...done].slice(0, 6);
  }, [visibleRequirements, opportunityFlow.satisfiedItems]);

  useEffect(() => {
    workstationTelemetry.trackSurfaceOpen("lead", lead.id, entryPoint);
  }, [lead.id, entryPoint]);

  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === "#customer-link") {
        customerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        customerSectionRef.current?.focus();
      }
      if (window.location.hash === "#address-verify") {
        addressVerifyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const matches = matchHints?.kind === "checked" ? matchHints.matches : [];
  const closeOrPauseAction = closeOrPauseLeadWorkspaceAction.bind(null, lead.id);
  const scrollToCustomerMatch = () => {
    customerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    customerSectionRef.current?.focus();
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#customer-link`,
      );
    }
  };

  const isTerminalPhase =
    opportunityFlow.phase === "PAUSED" || opportunityFlow.phase === "LOST";
  const showSecondarySections = isCompact ? showSecondaryDetails : true;
  const showFooter = !isModalContext && !isFullRecord;

  const modalChrome = (reviewDisplay.showSurfaceHeader && reviewDisplay.compactHeader) ||
    onClose ||
    entryPoint === "sales_modal";

  const heroDescription = reviewDisplay.contextLine;

  const nextActionPanel = (
    <section className={`${panelClass} p-4`} aria-label="Next step">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className={sectionLabelClass}>Next step</p>
          <p className="mt-1.5 text-base font-semibold tracking-tight text-foreground">
            {opportunityFlow.primaryAction?.label ?? opportunityFlow.conditionLabel}
          </p>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-foreground-muted">
            {opportunityFlow.summary}
          </p>
          {visibleRequirements.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {visibleRequirements.map((req) => (
                <span
                  key={req}
                  className="rounded-md border border-border bg-foreground/[0.02] px-2 py-0.5 text-xs text-foreground-muted"
                >
                  {req}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-auto lg:min-w-[10rem]">
          {isAssignedVisitMode && assignedFieldStatusLine ? (
            <div
              className={buttonClassName({
                variant: "muted",
                size: "sm",
                className: "w-full cursor-default text-center",
              })}
            >
              {assignedFieldStatusLine}
            </div>
          ) : null}
          {opportunityFlow.primaryAction ? (
            <OpportunityActionControl
              action={opportunityFlow.primaryAction}
              leadId={lead.id}
              visitRequests={visitRequests}
              schedulerStaffOptions={schedulerStaffOptions}
              variant="primary"
              isAssignedVisitMode={isAssignedVisitMode}
              onReviewCustomerMatch={scrollToCustomerMatch}
              onMutationSuccess={notifyMutationSuccess}
              onNavigateToQuoteTab={onNavigateToQuoteTab}
              fullWidth
            />
          ) : null}
        </div>
      </div>
    </section>
  );

  const scopeQuoteWorkbench = (
    <section className={`${panelClass} overflow-hidden`} aria-label="Scope and quote">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Scope & quote</h3>
          <p className="text-xs text-foreground-muted">Request details and quote progress</p>
        </div>
        {activeQuote ? (
          <ButtonLink href={`/quotes/${activeQuote.id}`} variant="secondary" size="sm">
            Open quote
          </ButtonLink>
        ) : null}
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.6fr)]">
        <div className="space-y-3 border-b border-border p-4 lg:border-b-0 lg:border-r">
          {reviewDisplay.requestDetailFields.length > 0 ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {reviewDisplay.requestDetailFields.map((field) => (
                <div key={field.label}>
                  <dt className={sectionLabelClass}>{field.label}</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : reviewDisplay.showScopeFallback && reviewViewModel.scopeText ? (
            <p className="text-sm leading-relaxed text-foreground">{reviewViewModel.scopeText}</p>
          ) : (
            <p className="text-sm text-foreground-muted">No scope details captured yet.</p>
          )}
          {reviewViewModel.showLegacyNotes ? (
            <div className="border-t border-border pt-2">
              <button
                type="button"
                onClick={() => setShowLegacyNotes(!showLegacyNotes)}
                className="flex items-center gap-1 text-xs font-medium text-foreground-subtle hover:text-foreground"
              >
                <ChevronDown
                  className={`size-3 transition-transform ${showLegacyNotes ? "rotate-180" : ""}`}
                />
                {showLegacyNotes ? "Hide raw intake" : "View raw intake"}
              </button>
              {showLegacyNotes && reviewViewModel.legacyNotesPreview ? (
                <p className="mt-2 text-xs italic leading-relaxed text-foreground-muted">
                  {reviewViewModel.legacyNotesPreview}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <aside className="bg-foreground/[0.015] p-4">
          {activeQuote ? (
            <>
              <StatusBadge
                label={formatQuoteStatus(activeQuote.status as QuoteStatus)}
                tone={quoteStatusBadgeTone(activeQuote.status as QuoteStatus) as StatusBadgeTone}
              />
              <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                {formatMoneyCents(activeQuote.totalCents)}
              </p>
              <p className="text-xs text-foreground-muted">
                {activeQuote._count.lineItems} line item
                {activeQuote._count.lineItems === 1 ? "" : "s"}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <ButtonLink href={`/quotes/${activeQuote.id}`} variant="primary" size="sm" className="w-full justify-center">
                  {activeQuote.status === "DRAFT" ? "Continue quote" : "Open quote"}
                </ButtonLink>
              </div>
            </>
          ) : (
            <>
              <p className={sectionLabelClass}>Quote</p>
              <p className="mt-1 text-sm font-medium text-foreground">No quote started</p>
              <p className="mt-1 text-xs text-foreground-muted">
                Finish request details, then build the quote from the next step above.
              </p>
            </>
          )}
        </aside>
      </div>
    </section>
  );

  const jobsitePanel = (
    <section className={`${panelClass} p-4`} aria-label="Jobsite">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Jobsite & visit</h3>
          <p className="text-xs text-foreground-muted">Where the work happens</p>
        </div>
        {!isAssignedVisitMode ? (
          <ButtonLink href={editHref} variant="ghost" size="sm">
            <Pencil className="size-3" />
            Edit
          </ButtonLink>
        ) : null}
      </div>
      <div className="mt-3 flex items-start gap-2 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0 text-foreground-subtle" />
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {reviewDisplay.jobsiteSection.jobsiteLine || "No address provided"}
          </p>
          {reviewDisplay.jobsiteSection.verificationLabel === "verified" ? (
            <p className="mt-0.5 text-xs text-success">Verified</p>
          ) : reviewDisplay.jobsiteSection.verificationLabel === "needs_review" ? (
            <p className="mt-0.5 text-xs text-warning">Address needs review</p>
          ) : null}
          {reviewDisplay.jobsiteSection.differsFromCustomerPrimary ? (
            <p className="mt-1 text-xs text-foreground-muted">
              Different from customer primary
              {reviewDisplay.jobsiteSection.primaryJobsiteLine
                ? `: ${reviewDisplay.jobsiteSection.primaryJobsiteLine}`
                : ""}
            </p>
          ) : null}
          {reviewDisplay.needsJobsiteLinkConfirmation ? (
            <p className="mt-1 text-xs text-warning">
              Jobsite not confirmed for this linked customer yet.
            </p>
          ) : null}
        </div>
      </div>
      {reviewDisplay.siteDetails.showPlaceholder ? (
        <p className="mt-3 border-t border-border pt-3 text-sm text-foreground-muted">
          Property details unlock after the jobsite address is verified and linked.
        </p>
      ) : null}
      {reviewDisplay.siteDetails.showRow ? (
        <div className="mt-3 border-t border-border pt-3">
          <SiteDetailsRow
            data={siteData}
            onOpen={() => setSiteDrawerOpen(true)}
            showAddressLine={reviewDisplay.siteDetails.showAddressLine}
          />
          <SiteDetailsDrawer
            open={siteDrawerOpen}
            onClose={() => setSiteDrawerOpen(false)}
            data={siteData}
          />
        </div>
      ) : null}
      {visitRequests.length > 0 ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className={`${sectionLabelClass} mb-2 flex items-center gap-1`}>
            <Clock className="size-3" />
            Site visit
          </p>
          <VisitList visitRequests={visitRequests} onSaved={notifyMutationSuccess} />
        </div>
      ) : null}
    </section>
  );

  const activityFilesPanel = (
    <section className={`${panelClass} overflow-hidden`} aria-label="Activity and files">
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActivityTab("activity")}
          className={`px-4 py-2.5 text-xs font-semibold ${
            activityTab === "activity"
              ? "border-b-2 border-accent text-accent"
              : "text-foreground-muted"
          }`}
        >
          Activity
        </button>
        <button
          type="button"
          onClick={() => setActivityTab("files")}
          className={`px-4 py-2.5 text-xs font-semibold ${
            activityTab === "files"
              ? "border-b-2 border-accent text-accent"
              : "text-foreground-muted"
          }`}
        >
          Files ({reviewViewModel.attachments.length})
        </button>
      </div>
      <div className="p-4">
        {activityTab === "activity" ? (
          reviewViewModel.activity.length > 0 ? (
            <ol className="space-y-3">
              {reviewViewModel.activity.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <History className="mt-0.5 size-4 shrink-0 text-foreground-subtle" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    {item.detail ? (
                      <p className="mt-0.5 text-xs text-foreground-muted">{item.detail}</p>
                    ) : null}
                    <p className="mt-1 text-[10px] text-foreground-subtle">
                      {item.createdAt.toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-foreground-muted">No activity recorded yet.</p>
          )
        ) : reviewViewModel.attachments.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {reviewViewModel.attachments.map((att) => (
              <li key={att.id}>
                <a
                  href={att.downloadHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-foreground/[0.02]"
                >
                  <Paperclip className="size-4 shrink-0 text-foreground-subtle" />
                  <span className="min-w-0 flex-1 truncate font-medium">{att.fileName}</span>
                  <span className="shrink-0 text-xs text-foreground-muted">
                    {formatAttachmentFileSize(att.fileSize)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-foreground-muted">
            No files attached. Ask the customer for photos if pricing depends on site conditions.
          </p>
        )}
      </div>
    </section>
  );

  const customerRail = !isAssignedVisitMode ? (
    <LeadCustomerActionPanel
      panelRef={customerSectionRef}
      lead={{
        id: lead.id,
        title: lead.title,
        contactName: lead.contactName,
        companyName: lead.companyName,
        email: lead.email,
        phone: lead.phone,
        notes: lead.notes,
        source: lead.channel,
        jobsiteAddressLine: lead.jobsiteAddressLine,
      }}
      linkedCustomer={customer}
      customerReachabilityLine={reviewDisplay.customerReachabilityLine}
      needsJobsiteLinkConfirmation={reviewDisplay.needsJobsiteLinkConfirmation}
      hasBlockingCustomerMatch={hasBlockingCustomerMatch}
      suggestedMatches={matches}
      onSuccess={notifyMutationSuccess}
      onError={(message) => setSurfaceError(message)}
      compact={isCompact}
    />
  ) : null;

  const readinessRail = (
    <section className={`${panelClass} p-4`} aria-label="Readiness">
      <h3 className="text-sm font-semibold text-foreground">Readiness</h3>
      <div className="mt-3 space-y-2">
        {readinessItems.length > 0 ? (
          readinessItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-2 text-sm">
              <span className={item.ok ? "text-foreground-muted" : "text-foreground"}>
                {item.label}
              </span>
              <StatusBadge
                label={item.ok ? "OK" : "Needed"}
                tone={item.ok ? "approved" : "warning"}
                className="text-[10px]"
              />
            </div>
          ))
        ) : (
          <p className="text-sm text-foreground-muted">Ready to move forward.</p>
        )}
      </div>
    </section>
  );

  const secondaryActionsRail =
    opportunityFlow.secondaryActions.length > 0 ? (
      <section className={`${panelClass} p-4`} aria-label="More actions">
        <h3 className="text-sm font-semibold text-foreground">More actions</h3>
        <div className="mt-3 flex flex-col gap-2">
          {opportunityFlow.secondaryActions.map((action) => (
            <OpportunityActionControl
              key={`${action.kind}:${action.label}`}
              action={action}
              leadId={lead.id}
              visitRequests={visitRequests}
              schedulerStaffOptions={schedulerStaffOptions}
              variant="secondary"
              isAssignedVisitMode={isAssignedVisitMode}
              onReviewCustomerMatch={scrollToCustomerMatch}
              onMutationSuccess={notifyMutationSuccess}
              onNavigateToQuoteTab={onNavigateToQuoteTab}
              fullWidth
            />
          ))}
        </div>
      </section>
    ) : null;

  const closePauseRail = !isAssignedVisitMode ? (
    <section className={`${panelClass} p-4`}>
      {closePanelOpen ? (
        <CloseOrPauseLeadForm
          currentStatus={lead.status}
          currentCloseReason={lead.closeReason}
          currentFollowUpAt={lead.followUpAt}
          formAction={closeOrPauseAction}
          onCancel={() => setClosePanelOpen(false)}
          onSuccess={() => {
            setClosePanelOpen(false);
            setSurfaceError(null);
            notifyMutationSuccess();
          }}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between"
          onClick={() => setClosePanelOpen(true)}
        >
          Close or pause lead
          <ChevronRight className="size-3.5" />
        </Button>
      )}
    </section>
  ) : null;

  const reviewBody = (
    <div
      className={`flex flex-col gap-4 ${isModalContext ? "p-4" : isFullRecord ? "" : "p-4 sm:p-6"}`}
    >
          {modalChrome ? (
            <header className="flex flex-wrap items-start justify-between gap-3">
              {reviewDisplay.showSurfaceHeader && reviewDisplay.compactHeader ? (
                <div className="min-w-0 space-y-1">
                  <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
                    {reviewDisplay.compactHeader.title}
                  </h2>
                  {reviewDisplay.compactHeader.subtitle ? (
                    <p className="text-sm text-foreground-muted">
                      {reviewDisplay.compactHeader.subtitle}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div />
              )}
              <div className="flex shrink-0 items-center gap-1">
                {entryPoint === "sales_modal" ? (
                  <ButtonLink href={`/leads/${lead.id}`} variant="ghost" size="sm">
                    Full record
                  </ButtonLink>
                ) : null}
                {onClose ? (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded-md p-2 text-foreground-subtle transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    <X className="size-5" strokeWidth={1.5} />
                  </button>
                ) : null}
              </div>
            </header>
          ) : null}

          {isFullRecord ? (
            <section className={`${panelClass} overflow-hidden`} aria-label="Lead summary">
              <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={opportunityFlow.conditionLabel}
                      tone={conditionTone(opportunityFlow)}
                    />
                    {opportunityFlow.ageLabel ? (
                      <span className="text-xs text-foreground-muted">
                        {opportunityFlow.ageLabel}
                      </span>
                    ) : null}
                  </div>
                  <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {reviewDisplay.primaryName}
                  </h1>
                  {heroDescription ? (
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground-muted">
                      {heroDescription}
                    </p>
                  ) : null}
                </div>
                <LeadReviewQuickActions
                  phone={lead.phone}
                  email={lead.email}
                  leadId={lead.id}
                  visits={visitRequests}
                  siteVisitDisabled={isTerminalPhase}
                  onSuccess={notifyMutationSuccess}
                />
              </div>
            </section>
          ) : (
            <header className="space-y-3">
              <LeadReviewQuickActions
                phone={lead.phone}
                email={lead.email}
                leadId={lead.id}
                visits={visitRequests}
                siteVisitDisabled={isTerminalPhase || isAssignedVisitMode}
                onSuccess={notifyMutationSuccess}
              />
            </header>
          )}

          {nextActionPanel}

          {reviewDisplay.addressResolve.show && !isAssignedVisitMode ? (
            <div ref={addressVerifyRef} id="address-verify">
              <LeadAddressResolvePanel
                leadId={lead.id}
                leadEditHref={editHref}
                jobsiteAddressLine={lead.jobsiteAddressLine}
                serviceAddressContext={serviceAddressContext}
                onResolved={notifyMutationSuccess}
              />
            </div>
          ) : null}

          {surfaceError ? (
            <p className="rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2 text-sm text-danger">
              {surfaceError}
            </p>
          ) : null}

          {isCompact ? (
            <>
              {!isAssignedVisitMode ? customerRail : null}
              <button
                type="button"
                onClick={() => setShowSecondaryDetails((open) => !open)}
                className="flex w-full items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:bg-foreground/[0.02] hover:text-foreground"
              >
                <ChevronDown
                  className={`size-3.5 transition-transform ${showSecondaryDetails ? "rotate-180" : ""}`}
                />
                {showSecondaryDetails ? "Hide details" : "Show request & site details"}
              </button>
            </>
          ) : null}

          {showSecondarySections ? (
            isFullRecord ? (
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="flex min-w-0 flex-col gap-4">
                  <section aria-label="Lead facts">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Lead facts</h3>
                      <ButtonLink href={editHref} variant="ghost" size="sm">
                        Edit details
                      </ButtonLink>
                    </div>
                    <FactGrid facts={curatedFacts} />
                  </section>
                  {scopeQuoteWorkbench}
                  {jobsitePanel}
                  {activityFilesPanel}
                </div>
                <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
                  {customerRail}
                  {readinessRail}
                  {secondaryActionsRail}
                  {closePauseRail}
                </aside>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <FactGrid facts={curatedFacts} />
                {scopeQuoteWorkbench}
                {jobsitePanel}
                {readinessRail}
                {secondaryActionsRail}
                {activityFilesPanel}
              </div>
            )
          ) : null}
    </div>
  );

  return (
    <div className="@container flex min-h-full flex-col">
      {embeddedInOpportunityWorkspace ? (
        reviewBody
      ) : (
        <div className="flex-1 overflow-y-auto">{reviewBody}</div>
      )}

      {showFooter && !isAssignedVisitMode ? (
        <footer className="shrink-0 border-t border-border bg-surface px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {entryPoint !== "record" ? (
              <ButtonLink href={`/leads/${lead.id}`} variant="muted" size="sm">
                Open full record
              </ButtonLink>
            ) : null}
            <Button
              type="button"
              variant="muted"
              size="sm"
              onClick={() => setClosePanelOpen((open) => !open)}
            >
              {closePanelOpen ? "Hide close options" : "Close or pause"}
            </Button>
          </div>
          {closePanelOpen ? (
            <div className="mt-3 rounded-lg border border-border bg-background p-3">
              <CloseOrPauseLeadForm
                currentStatus={lead.status}
                currentCloseReason={lead.closeReason}
                currentFollowUpAt={lead.followUpAt}
                formAction={closeOrPauseAction}
                onCancel={() => setClosePanelOpen(false)}
                onSuccess={() => {
                  setClosePanelOpen(false);
                  setSurfaceError(null);
                  notifyMutationSuccess();
                }}
              />
            </div>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}
