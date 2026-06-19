"use client";

import {
  buildReviewDisplayForPayload,
  type LeadCommercialSurfacePayload,
} from "@/lib/lead-commercial-surface/loader";
import {
  formatAttachmentFileSize,
} from "@/lib/lead-display";
import { LeadVisitRequestStatus, QuoteStatus } from "@prisma/client";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import { StatusBadge, StatusBadgeTone } from "@/components/ui/status-badge";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Pencil,
  ChevronDown,
  Clock,
  Paperclip,
  History,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  resolveOpportunityActionHref,
  type OpportunityAction,
} from "@/lib/opportunity-flow";
import { StartQuoteFromLeadButton } from "@/components/leads/start-quote-from-lead-button";

import { workstationTelemetry } from "@/lib/workstation/telemetry";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { closeOrPauseLeadWorkspaceAction, resumeOpportunityWorkspaceAction } from "@/app/(workspace)/leads/lead-workspace-actions";
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

export interface LeadCommercialSurfaceProps {
  payload: LeadCommercialSurfacePayload;
  entryPoint?: "workstation" | "record" | "sales_modal";
  /** When set, called after in-place mutations (e.g. customer attach) instead of only `router.refresh()`. */
  onMutationSuccess?: () => void;
  /** When set, renders a close button in the header (e.g. dialog workspace). */
  onClose?: () => void;
}

const sectionTitleClass =
  "text-xs font-bold uppercase tracking-widest text-foreground-subtle";

const cardActionBaseClass =
  "inline-flex min-h-9 w-full min-w-[8.5rem] items-center justify-center rounded-lg px-3 py-2 text-center text-xs font-medium";

const primaryActionClass = `${cardActionBaseClass} border border-border bg-accent text-accent-contrast transition-opacity hover:opacity-90`;

const secondaryActionClass = `${cardActionBaseClass} border border-border text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground`;

function OpportunityActionControl({
  action,
  leadId,
  visitRequests,
  schedulerStaffOptions,
  variant,
  isAssignedVisitMode = false,
  onReviewCustomerMatch,
  onMutationSuccess,
}: {
  action: OpportunityAction;
  leadId: string;
  visitRequests: LeadVisitRequestPayload[];
  schedulerStaffOptions: SchedulerStaffOption[];
  variant: "primary" | "secondary";
  isAssignedVisitMode?: boolean;
  onReviewCustomerMatch?: () => void;
  onMutationSuccess?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);

  if (isAssignedVisitMode && !isAssignedVisitFieldAction(action.kind)) {
    return null;
  }

  if (action.kind === "START_QUOTE") {
    return (
      <StartQuoteFromLeadButton leadId={leadId} label={action.label} variant={variant} />
    );
  }

  if (action.kind === "REVIEW_CUSTOMER_MATCH") {
    return (
      <button
        type="button"
        onClick={() => onReviewCustomerMatch?.()}
        title="Review suggested customer matches before building a quote."
        className={variant === "primary" ? primaryActionClass : secondaryActionClass}
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
              router.push(`/quotes/${result.revisedQuoteId}`);
              onMutationSuccess?.();
            });
          }}
          title="Create a revision draft from the customer's change request."
          className={variant === "primary" ? primaryActionClass : secondaryActionClass}
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
          title="Clear pause and return this lead to the open pipeline."
          className={variant === "primary" ? primaryActionClass : secondaryActionClass}
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
    const visit = visitRequests.find((request) => request.id === action.targetVisitRequestId) ?? null;

    return (
      <>
        <button
          type="button"
          onClick={() => setSchedulerOpen(true)}
          title="Pick a time and schedule this site visit."
          className={variant === "primary" ? primaryActionClass : secondaryActionClass}
        >
          {variant === "primary" ? "Schedule" : action.label}
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
    const visit = findVisitForCompletionAction(
      visitRequests,
      action.targetVisitRequestId,
    );

    return (
      <>
        <button
          type="button"
          onClick={() => setCompletionOpen((open) => !open)}
          title="Record what happened on the site visit and choose the next sales action."
          className={variant === "primary" ? primaryActionClass : secondaryActionClass}
        >
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

  let title = action.label;
  switch (action.kind) {
    case "EDIT_CONTACT_INFO":
      title = "Fix contact and jobsite details so this request can be quoted.";
      break;
    case "OPEN_DRAFT_QUOTE":
      title = "Open the current draft quote.";
      break;
    case "OPEN_QUOTE":
      title = "Open the sent quote.";
      break;
    case "SEND_QUOTE":
      title = "Open send and accept to deliver the proposal.";
      break;
    case "FOLLOW_UP_CUSTOMER":
      title = "Open the quote and follow up with the customer.";
      break;
    case "CREATE_REVISION_DRAFT":
      title = "Create a revision draft from the customer's change request.";
      break;
    case "OPEN_EXECUTION_REVIEW":
      title = "Review the execution plan for this quote.";
      break;
    case "OPEN_JOB":
      title = "Open the active job.";
      break;
    case "SCHEDULE_SALES_VISIT":
      title = "Schedule a site visit for this lead.";
      break;
    case "COMPLETE_SALES_VISIT":
      title = "Record visit outcome and next sales action.";
      break;
  }

  return (
    <Link
      href={href}
      title={title}
      className={variant === "primary" ? primaryActionClass : secondaryActionClass}
    >
      {action.label}
    </Link>
  );
}

export function LeadCommercialSurface({
  payload,
  entryPoint = "record",
  onMutationSuccess,
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
  } =
    payload;
  const isAssignedVisitMode = surfaceMode === "assigned_visit";
  const router = useRouter();
  const notifyMutationSuccess = onMutationSuccess ?? (() => router.refresh());
  const [showLegacyNotes, setShowLegacyNotes] = useState(false);
  const [showSecondaryDetails, setShowSecondaryDetails] = useState(false);
  const [closePanelOpen, setClosePanelOpen] = useState(false);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [siteDrawerOpen, setSiteDrawerOpen] = useState(false);
  const customerSectionRef = useRef<HTMLDivElement>(null);
  const addressVerifyRef = useRef<HTMLDivElement>(null);
  const siteData = toSiteDetailsRowData({
    line: lead.jobsiteAddressLine || null,
    serviceLocationId: lead.serviceLocationId,
    siteDetails: lead.siteDetails,
  });

  const editHref = `/leads/${lead.id}/edit`;

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
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#customer-link`);
    }
  };
  const isTerminalPhase =
    opportunityFlow.phase === "PAUSED" || opportunityFlow.phase === "LOST";

  const isModalContext = Boolean(onClose);

  const reviewDisplay = useMemo(
    () => buildReviewDisplayForPayload(payload, entryPoint),
    [payload, entryPoint],
  );

  const visibleRequirements = opportunityFlow.requirements.filter(
    (req) => {
      if (req === "Review customer match") return false;

      const primaryAction = opportunityFlow.primaryAction;
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
    },
  );

  const showFooter = !isModalContext;
  const showSecondarySections = isModalContext ? showSecondaryDetails : true;

  return (
    <div className="@container flex min-h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className={`flex flex-col gap-6 ${isModalContext ? "p-4" : "p-4 sm:p-6"}`}>
          <header className="space-y-3">
            {reviewDisplay.showSurfaceHeader && reviewDisplay.compactHeader ? (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground truncate">
                    {reviewDisplay.compactHeader.title}
                  </h2>
                  {reviewDisplay.compactHeader.subtitle ? (
                    <p className="text-sm text-foreground-muted">
                      {reviewDisplay.compactHeader.subtitle}
                    </p>
                  ) : null}
                  {reviewDisplay.compactHeader.metaLine ? (
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-foreground-subtle">
                      <span>{reviewDisplay.compactHeader.metaLine}</span>
                    </div>
                  ) : null}
                </div>
                {onClose || entryPoint === "sales_modal" ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {entryPoint === "sales_modal" ? (
                      <Link
                        href={`/leads/${lead.id}`}
                        className="rounded-md px-2 py-1.5 text-xs font-medium text-foreground-subtle hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                      >
                        Full record
                      </Link>
                    ) : null}
                    {onClose ? (
                      <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded-md p-2 text-foreground-subtle hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                      >
                        <X className="w-5 h-5" strokeWidth={1.5} />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : onClose || entryPoint === "sales_modal" ? (
              <div className="flex justify-end">
                <div className="flex shrink-0 items-center gap-1">
                  {entryPoint === "sales_modal" ? (
                    <Link
                      href={`/leads/${lead.id}`}
                      className="rounded-md px-2 py-1.5 text-xs font-medium text-foreground-subtle hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                    >
                      Full record
                    </Link>
                  ) : null}
                  {onClose ? (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close"
                      className="rounded-md p-2 text-foreground-subtle hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                    >
                      <X className="w-5 h-5" strokeWidth={1.5} />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <LeadReviewQuickActions
              phone={lead.phone}
              email={lead.email}
              leadId={lead.id}
              visits={visitRequests}
              siteVisitDisabled={isTerminalPhase || isAssignedVisitMode}
              onSuccess={notifyMutationSuccess}
            />
          </header>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    label={opportunityFlow.conditionLabel}
                    tone={
                      opportunityFlow.phase === "WON"
                        ? "approved"
                        : opportunityFlow.phase === "CUSTOMER_REVIEW"
                          ? "sent"
                          : opportunityFlow.phase === "LOST"
                            ? "neutral"
                            : opportunityFlow.phase === "PAUSED"
                              ? "warning"
                              : "draft"
                    }
                  />
                  {opportunityFlow.ageLabel ? (
                    <span className="text-xs text-foreground-muted">{opportunityFlow.ageLabel}</span>
                  ) : null}
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
                  {opportunityFlow.summary}
                </p>
              </div>

              {opportunityFlow.primaryAction ||
              opportunityFlow.secondaryActions.length > 0 ||
              (isAssignedVisitMode && assignedFieldStatusLine) ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[8.5rem] [&_a]:w-full [&_button]:w-full">
                  {isAssignedVisitMode && assignedFieldStatusLine ? (
                    <div
                      className={`${secondaryActionClass} cursor-default text-center`}
                      title="Office staff will handle the next commercial step."
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
                    />
                  ) : null}
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
                    />
                  ))}
                </div>
              ) : null}
            </div>

            {visibleRequirements.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {visibleRequirements.map((req) => (
                  <span
                    key={req}
                    className="rounded-full border border-border px-2 py-0.5 text-[0.7rem] text-foreground-muted"
                  >
                    {req}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

            {reviewDisplay.addressResolve.show && !isAssignedVisitMode ? (
              <div ref={addressVerifyRef}>
                <LeadAddressResolvePanel
                  leadId={lead.id}
                  leadEditHref={editHref}
                  jobsiteAddressLine={lead.jobsiteAddressLine}
                  serviceAddressContext={serviceAddressContext}
                  onResolved={notifyMutationSuccess}
                />
              </div>
            ) : null}

            {!isAssignedVisitMode ? (
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
              hasBlockingCustomerMatch={hasBlockingCustomerMatch}
              suggestedMatches={matches}
              onSuccess={notifyMutationSuccess}
              onError={(message) => setSurfaceError(message)}
              compact={isModalContext}
            />
            ) : null}

            {surfaceError ? (
              <p className="rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2 text-sm text-danger">
                {surfaceError}
              </p>
            ) : null}

          {isModalContext ? (
            <button
              type="button"
              onClick={() => setShowSecondaryDetails((open) => !open)}
              className="flex w-full items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:bg-foreground/[0.02] hover:text-foreground"
            >
              <ChevronDown
                className={`size-3.5 transition-transform ${showSecondaryDetails ? "rotate-180" : ""}`}
              />
              {showSecondaryDetails ? "Hide details" : "Show request & contact details"}
            </button>
          ) : null}

          {showSecondarySections ? (
          <div className="space-y-8">
            {/* Request summary */}
            <section className="space-y-3" aria-labelledby="lead-review-request">
              <h3 id="lead-review-request" className={sectionTitleClass}>
                What they need
              </h3>
              <div className="rounded-xl border border-border bg-surface p-4 shadow-sm space-y-4">
                {reviewDisplay.requestDetailFields.length > 0 ? (
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {reviewDisplay.requestDetailFields.map((field) => (
                      <div key={field.label} className="space-y-1">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                          {field.label}
                        </dt>
                        <dd className="text-sm font-medium leading-snug text-foreground">
                          {field.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-foreground-muted">No request details captured yet.</p>
                )}

                {reviewDisplay.showScopeFallback ? (
                  <p className="text-sm leading-relaxed text-foreground border-t border-border pt-3">
                    {reviewViewModel.scopeText}
                  </p>
                ) : null}

                {visitRequests.length > 0 ? (
                  <div className="border-t border-border pt-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle flex items-center gap-1">
                      <Clock className="size-3" /> Site visit
                    </p>
                    {visitRequests.map((visit) => {
                      const scheduledStart = resolveLeadVisitScheduledStart(visit);
                      return (
                        <div key={visit.id} className="rounded-md border border-border px-3 py-2 text-sm">
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
                            <p className="text-xs text-foreground-muted mt-1">
                              Assigned: {visit.assignedUserLabel}
                            </p>
                          ) : null}
                          {visit.arrivalWindowLabel ? (
                            <p className="text-xs text-foreground-muted">
                              Arrival window: {visit.arrivalWindowLabel}
                            </p>
                          ) : null}
                          {!visit.hasAccessDetails &&
                          visit.status === LeadVisitRequestStatus.CONFIRMED ? (
                            <p className="text-xs text-warning mt-1">Access details missing</p>
                          ) : null}
                          {visit.outcome ? (
                            <p className="text-xs text-foreground-muted mt-1">
                              Outcome: {formatLeadVisitOutcomeLabel(visit.outcome)}
                            </p>
                          ) : null}
                          {visit.nextAction ? (
                            <p className="text-xs text-foreground-muted">
                              Next: {formatLeadVisitNextActionLabel(visit.nextAction)}
                            </p>
                          ) : null}
                          <LeadVisitAccessDetailsPanel
                            visit={visit}
                            onSaved={notifyMutationSuccess}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {reviewViewModel.visits.length > 0 ? (
                  <div className="border-t border-border pt-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle flex items-center gap-1">
                      <Clock className="size-3" /> Site visit
                    </p>
                    {reviewViewModel.visits.map((v) => (
                      <div key={v.id} className="text-sm text-foreground-muted">
                        <span className="font-medium text-foreground">{v.summary}</span>
                        {v.notes ? (
                          <span className="block text-xs mt-0.5">{v.notes}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {reviewViewModel.showLegacyNotes ? (
                  <div className="border-t border-border pt-2">
                    <button
                      type="button"
                      onClick={() => setShowLegacyNotes(!showLegacyNotes)}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle hover:text-foreground transition-colors"
                    >
                      <ChevronDown
                        className={`size-3 transition-transform ${showLegacyNotes ? "rotate-180" : ""}`}
                      />
                      {showLegacyNotes ? "Hide raw intake" : "View raw intake"}
                    </button>
                    {showLegacyNotes && reviewViewModel.legacyNotesPreview ? (
                      <p className="mt-2 text-xs text-foreground-muted leading-relaxed italic">
                        {reviewViewModel.legacyNotesPreview}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            {/* Contact — unlinked leads only */}
            {reviewDisplay.contactSection.show ? (
              <section className="space-y-3" aria-labelledby="lead-review-contact">
                <h3 id="lead-review-contact" className={sectionTitleClass}>
                  Contact
                </h3>
                <div className="rounded-xl border border-border bg-surface p-4 space-y-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-foreground/5 p-2">
                      <User className="size-4 text-foreground-subtle" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold">{reviewDisplay.contactSection.name}</h4>
                      {reviewDisplay.contactSection.companyName ? (
                        <p className="text-sm text-foreground-muted">
                          {reviewDisplay.contactSection.companyName}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="size-4 text-foreground-subtle shrink-0" />
                      <span className="truncate">
                        {reviewDisplay.contactSection.email || "No email"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="size-4 text-foreground-subtle shrink-0" />
                      <span>{reviewDisplay.contactSection.phone || "No phone"}</span>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {/* Jobsite — where work happens */}
            <section className="space-y-3" aria-labelledby="lead-review-jobsite">
              <div className="flex items-center justify-between">
                <h3 id="lead-review-jobsite" className={sectionTitleClass}>
                  Jobsite
                </h3>
                {!isAssignedVisitMode ? (
                <Link
                  href={editHref}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle hover:text-foreground"
                >
                  <Pencil className="size-2.5" /> Edit
                </Link>
                ) : null}
              </div>

              <div className="rounded-xl border border-border bg-surface p-4 space-y-4 shadow-sm">
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="size-4 shrink-0 mt-0.5 text-foreground-subtle" />
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      {reviewDisplay.jobsiteSection.jobsiteLine || "No address provided"}
                    </p>
                    {reviewDisplay.jobsiteSection.verificationLabel === "verified" ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-success">
                        Verified
                      </span>
                    ) : reviewDisplay.jobsiteSection.verificationLabel === "needs_review" ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-warning">
                        Address needs review
                      </span>
                    ) : null}
                    {reviewDisplay.jobsiteSection.differsFromCustomerPrimary ? (
                      <p className="text-xs text-foreground-muted">
                        Different from customer&apos;s primary jobsite
                        {reviewDisplay.jobsiteSection.primaryJobsiteLine
                          ? `: ${reviewDisplay.jobsiteSection.primaryJobsiteLine}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                </div>

                {reviewDisplay.siteDetails.showPlaceholder ? (
                  <p className="text-sm text-foreground-muted border-t border-border pt-4">
                    Property details unlock after the jobsite address is verified and linked.
                  </p>
                ) : null}

                {reviewDisplay.siteDetails.showRow ? (
                  <>
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
                  </>
                ) : null}
              </div>
            </section>

            {/* Files */}
            <section className="space-y-3" aria-labelledby="lead-review-files">
              <h3 id="lead-review-files" className={sectionTitleClass}>
                Photos &amp; files
              </h3>
              {reviewViewModel.attachments.length > 0 ? (
                <ul className="rounded-xl border border-border bg-surface divide-y divide-border shadow-sm">
                  {reviewViewModel.attachments.map((att) => (
                    <li key={att.id}>
                      <a
                        href={att.downloadHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-foreground/[0.02] transition-colors"
                      >
                        <Paperclip className="size-4 text-foreground-subtle shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                          {att.fileName}
                        </span>
                        <span className="text-xs text-foreground-muted shrink-0">
                          {formatAttachmentFileSize(att.fileSize)}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground-muted rounded-xl border border-dashed border-border px-4 py-6 text-center">
                  No files attached to this request.
                </p>
              )}
            </section>

            {/* Activity */}
            <section className="space-y-3" aria-labelledby="lead-review-activity">
              <h3 id="lead-review-activity" className={sectionTitleClass}>
                Activity
              </h3>
              {reviewViewModel.activity.length > 0 ? (
                <ol className="rounded-xl border border-border bg-surface p-4 shadow-sm space-y-4">
                  {reviewViewModel.activity.map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <History className="size-4 text-foreground-subtle shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        {item.detail ? (
                          <p className="text-xs text-foreground-muted mt-0.5">{item.detail}</p>
                        ) : null}
                        <p className="text-[10px] text-foreground-subtle mt-1">
                          {item.createdAt.toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-foreground-muted">No activity recorded yet.</p>
              )}
            </section>

            {linkedQuotes.length > 0 && !isAssignedVisitMode ? (
              <section className="space-y-3">
                <h3 className={sectionTitleClass}>Quotes ({linkedQuotes.length})</h3>
                <div className="space-y-2">
                  {linkedQuotes.map((quote) => (
                    <Link
                      key={quote.id}
                      href={`/quotes/${quote.id}`}
                      className="block rounded-xl border border-border bg-surface p-3 hover:border-border-strong transition-colors shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="text-xs font-bold truncate text-foreground">
                          {quote.title}
                        </span>
                        <StatusBadge
                          label={formatQuoteStatus(quote.status as QuoteStatus)}
                          tone={quoteStatusBadgeTone(quote.status as QuoteStatus) as StatusBadgeTone}
                          className="text-[10px] px-1.5 py-0 shrink-0"
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-foreground-muted">
                        <span>{quote._count.lineItems} items</span>
                        <span className="font-mono">
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                          }).format(quote.totalCents / 100)}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] font-medium text-accent">
                        {quote.status === "DRAFT"
                          ? "Continue building this draft quote"
                          : quote.status === "SENT"
                            ? "Follow up on this sent quote"
                            : quote.status === "APPROVED"
                              ? "Review job plan for this approved quote"
                              : "Open quote"}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
          ) : null}
        </div>
      </div>

      {showFooter && !isAssignedVisitMode ? (
      <footer className="shrink-0 border-t border-border bg-surface px-4 py-3 sm:px-6">
        <div className="space-y-3">
          {closePanelOpen ? (
            <div className="rounded-lg border border-border bg-background p-3">
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
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {entryPoint !== "record" ? (
              <Link
                href={`/leads/${lead.id}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground-subtle transition-colors hover:bg-foreground/[0.02] hover:text-foreground sm:w-auto"
              >
                Open full record
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setClosePanelOpen((open) => !open)}
              className="flex w-full items-center justify-center rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground-muted transition-colors hover:bg-foreground/[0.02] hover:text-foreground sm:w-auto"
            >
              {closePanelOpen ? "Hide close options" : "Close or pause"}
            </button>
          </div>
        </div>
      </footer>
      ) : null}
    </div>
  );
}
