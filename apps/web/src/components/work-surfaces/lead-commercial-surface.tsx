"use client";

import { LeadCommercialSurfacePayload } from "@/lib/lead-commercial-surface/loader";
import {
  formatAttachmentFileSize,
  formatLeadChannel,
  formatLeadStatus,
} from "@/lib/lead-display";
import { LeadStatus, QuoteStatus } from "@prisma/client";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import { StatusBadge, StatusBadgeTone } from "@/components/ui/status-badge";
import {
  User,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  ExternalLink,
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
import {
  OPPORTUNITY_PHASE_ORDER,
  formatOpportunityPhaseLabel,
} from "@/lib/opportunity-board";
import { StartQuoteFromLeadButton } from "@/components/leads/start-quote-from-lead-button";

import { workstationTelemetry } from "@/lib/workstation/telemetry";
import { useEffect, useRef, useState, useTransition } from "react";
import { closeOrPauseLeadWorkspaceAction, resumeOpportunityWorkspaceAction } from "@/app/(workspace)/leads/lead-workspace-actions";
import { createRevisionDraftForQuoteChangeRequestAction } from "@/app/(workspace)/quotes/quote-change-request-actions";
import { useRouter } from "next/navigation";
import { LeadQuoteReadinessBar } from "@/components/leads/lead-quote-readiness-bar";
import { RequestSiteVisitButton } from "@/components/leads/request-site-visit-button";
import { LeadCustomerActionPanel } from "@/components/leads/lead-customer-action-panel";
import { LeadAddressResolvePanel } from "@/components/leads/lead-address-resolve-panel";
import { CloseOrPauseLeadForm } from "@/components/leads/close-or-pause-lead-form";
import { SiteDetailsRow } from "@/components/site-details/site-details-row";
import { SiteDetailsDrawer } from "@/components/site-details/site-details-drawer";

export interface LeadCommercialSurfaceProps {
  payload: LeadCommercialSurfacePayload;
  entryPoint?: "workstation" | "record";
  /** When set, called after in-place mutations (e.g. customer attach) instead of only `router.refresh()`. */
  onMutationSuccess?: () => void;
  /** When set, renders a close button in the header (e.g. dialog workspace). */
  onClose?: () => void;
}

const sectionTitleClass =
  "text-xs font-bold uppercase tracking-widest text-foreground-subtle";
const phaseOrder = OPPORTUNITY_PHASE_ORDER;

const primaryActionClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const secondaryActionClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

function OpportunityActionControl({
  action,
  leadId,
  variant,
  onReviewCustomerMatch,
  onMutationSuccess,
}: {
  action: OpportunityAction;
  leadId: string;
  variant: "primary" | "secondary";
  onReviewCustomerMatch?: () => void;
  onMutationSuccess?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
              if (!result.ok || !result.revisedQuoteId) {
                setError(result.error ?? "Could not create revision draft.");
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
                setError(result.error ?? "Could not resume this opportunity.");
                return;
              }
              onMutationSuccess?.();
            });
          }}
          title="Clear pause and return this opportunity to the open pipeline."
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
    case "COMPLETE_SALES_VISIT":
      title = "Open schedule to plan or complete a sales visit.";
      break;
    case "RESUME_OPPORTUNITY":
      title = "Resume this opportunity.";
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

function phaseLabel(phase: string): string {
  return formatOpportunityPhaseLabel(phase);
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
  } =
    payload;
  const router = useRouter();
  const notifyMutationSuccess = onMutationSuccess ?? (() => router.refresh());
  const [showLegacyNotes, setShowLegacyNotes] = useState(false);
  const [closePanelOpen, setClosePanelOpen] = useState(false);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [siteDrawerOpen, setSiteDrawerOpen] = useState(false);
  const customerSectionRef = useRef<HTMLDivElement>(null);
  const addressVerifyRef = useRef<HTMLDivElement>(null);
  const siteData = {
    serviceLocationId: lead.serviceLocationId,
    line: lead.jobsiteAddressLine || null,
    apn: lead.siteDetails?.apn ?? null,
    apnSourceTitle: lead.siteDetails?.apnSourceTitle ?? null,
    apnSourceUrl: lead.siteDetails?.apnSourceUrl ?? null,
    apnVerificationUrl: lead.siteDetails?.apnVerificationUrl ?? null,
    apnConflict: lead.siteDetails?.apnConflict ?? null,
    utilityName: lead.siteDetails?.utilityName ?? null,
    utilityOfficialWebsite: lead.siteDetails?.utilityOfficialWebsite ?? null,
    utilityServiceUpgradeUrl: lead.siteDetails?.utilityServiceUpgradeUrl ?? null,
    utilityCoverageSourceTitle: lead.siteDetails?.utilityCoverageSourceTitle ?? null,
    utilityCoverageSourceUrl: lead.siteDetails?.utilityCoverageSourceUrl ?? null,
    jurisdictionName: lead.siteDetails?.jurisdictionName ?? null,
    jurisdictionBuildingDepartmentName:
      lead.siteDetails?.jurisdictionBuildingDepartmentName ?? null,
    jurisdictionOfficialWebsite: lead.siteDetails?.jurisdictionOfficialWebsite ?? null,
    jurisdictionBuildingDepartmentUrl:
      lead.siteDetails?.jurisdictionBuildingDepartmentUrl ?? null,
    jurisdictionPermitPortalUrl: lead.siteDetails?.jurisdictionPermitPortalUrl ?? null,
    jurisdictionFormsUrl: lead.siteDetails?.jurisdictionFormsUrl ?? null,
    jurisdictionInspectionsUrl: lead.siteDetails?.jurisdictionInspectionsUrl ?? null,
    assessorCounty: lead.siteDetails?.assessorCounty ?? null,
    assessorState: lead.siteDetails?.assessorState ?? null,
    assessorSearchUrl: lead.siteDetails?.assessorSearchUrl ?? null,
    assessorParcelGisUrl: lead.siteDetails?.assessorParcelGisUrl ?? null,
    detailsStatus: lead.siteDetails?.detailsStatus ?? "UNVERIFIED",
    missingScopes: lead.siteDetails?.missingScopes ?? ["APN", "UTILITY", "JURISDICTION"],
  } as const;

  const editHref = `/leads/${lead.id}/edit`;
  const callablePhone = lead.phone.trim();
  const emailableAddress = lead.email.trim();

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
  const showAddressResolvePanel =
    !customer &&
    !lead.isAddressQuoteReady &&
    lead.jobsiteAddressLine.trim().length > 0 &&
    serviceAddressContext?.customer == null;

  return (
    <div className="@container flex min-h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6 p-4 sm:p-6">
          {/* Decision header */}
          <header className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                  Request review
                </p>
                <h2 className="text-xl font-semibold tracking-tight text-foreground truncate">
                  {lead.title}
                </h2>
                <p className="text-sm text-foreground-muted">{formatLeadChannel(lead.channel)} · Received {lead.createdAt.toLocaleDateString()}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {callablePhone ? (
                    <a
                      href={`tel:${callablePhone}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
                    >
                      <Phone className="size-3" />
                      Call
                    </a>
                  ) : null}
                  {emailableAddress ? (
                    <a
                      href={`mailto:${emailableAddress}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
                    >
                      <Mail className="size-3" />
                      Email
                    </a>
                  ) : null}
                  <Link
                    href={editHref}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
                  >
                    <Pencil className="size-3" />
                    Edit request details
                  </Link>
                  {!isTerminalPhase ? (
                    <RequestSiteVisitButton
                      leadId={lead.id}
                      visits={visitRequests}
                      onSuccess={notifyMutationSuccess}
                    />
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Phase
                </span>
                <StatusBadge
                  label={phaseLabel(opportunityFlow.phase)}
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
                <span className="text-[0.65rem] uppercase tracking-wide text-foreground-subtle">
                  Record: {formatLeadStatus(lead.status as LeadStatus)}
                </span>
                {onClose ? (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close workspace"
                    className="rounded-lg border border-border bg-surface p-2 text-foreground-subtle hover:text-foreground hover:bg-background transition-colors"
                  >
                    <X className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                {isTerminalPhase ? (
                  <span className="rounded-full border border-border-strong bg-foreground/[0.04] px-2 py-0.5 text-foreground">
                    {phaseLabel(opportunityFlow.phase)}
                  </span>
                ) : (
                  phaseOrder.map((phase) => (
                    <span
                      key={phase}
                      className={
                        phase === opportunityFlow.phase
                          ? "rounded-full border border-border-strong bg-foreground/[0.04] px-2 py-0.5 text-foreground"
                          : "rounded-full border border-border px-2 py-0.5"
                      }
                    >
                      {phaseLabel(phase)}
                    </span>
                  ))
                )}
              </div>
              <div className="mt-3 rounded-lg border border-border bg-surface p-4">
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
                <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
                  {opportunityFlow.summary}
                </p>
                {opportunityFlow.primaryAction || opportunityFlow.secondaryActions.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {opportunityFlow.primaryAction ? (
                      <OpportunityActionControl
                        action={opportunityFlow.primaryAction}
                        leadId={lead.id}
                        variant="primary"
                        onReviewCustomerMatch={scrollToCustomerMatch}
                        onMutationSuccess={notifyMutationSuccess}
                      />
                    ) : null}
                    {opportunityFlow.secondaryActions.map((action) => (
                      <OpportunityActionControl
                        key={`${action.kind}:${action.label}`}
                        action={action}
                        leadId={lead.id}
                        variant="secondary"
                        onReviewCustomerMatch={scrollToCustomerMatch}
                        onMutationSuccess={notifyMutationSuccess}
                      />
                    ))}
                  </div>
                ) : null}
                {opportunityFlow.requirements.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {opportunityFlow.requirements.map((req) => (
                      <span key={req} className="rounded-full border border-border px-2 py-0.5 text-[0.7rem] text-foreground-muted">
                        {req}
                      </span>
                    ))}
                  </div>
                ) : null}
                {opportunityFlow.keyFacts.length > 0 ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                      Key facts
                    </p>
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {opportunityFlow.keyFacts.map((fact) => (
                        <p key={`${fact.label}:${fact.value}`} className="text-xs text-foreground-muted">
                          <span className="font-medium text-foreground">{fact.label}:</span> {fact.value}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
                {opportunityFlow.recentEvents.length > 0 ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                      Recent history
                    </p>
                    <ol className="mt-2 space-y-1.5">
                      {opportunityFlow.recentEvents.slice(0, 4).map((evt) => (
                        <li key={`${evt.label}:${evt.at ?? "none"}`} className="text-xs text-foreground-muted">
                          <span className="font-medium text-foreground">{evt.label}</span>
                          {evt.at ? ` · ${new Date(evt.at).toLocaleString()}` : ""}
                          {evt.detail ? ` · ${evt.detail}` : ""}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            </div>

            <LeadQuoteReadinessBar
              requirements={reviewViewModel.requirements}
              allRequirementsMet={reviewViewModel.allRequirementsMet}
              editHref={editHref}
            />

            {showAddressResolvePanel ? (
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

            {!customer ? (
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
                editLeadHref={editHref}
                hasBlockingCustomerMatch={hasBlockingCustomerMatch}
                suggestedMatches={matches}
                onSuccess={notifyMutationSuccess}
                onError={(message) => setSurfaceError(message)}
              />
            ) : null}

            {surfaceError ? (
              <p className="rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2 text-sm text-danger">
                {surfaceError}
              </p>
            ) : null}
          </header>

          <div className="space-y-8">
            {/* Request summary */}
            <section className="space-y-3" aria-labelledby="lead-review-request">
              <h3 id="lead-review-request" className={sectionTitleClass}>
                What they need
              </h3>
              <div className="rounded-xl border border-border bg-surface p-4 shadow-sm space-y-4">
                {reviewViewModel.requestFields.length > 0 ? (
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {reviewViewModel.requestFields.map((field) => (
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

                {reviewViewModel.scopeText &&
                !reviewViewModel.requestFields.some((f) => f.label === "What they need") ? (
                  <p className="text-sm leading-relaxed text-foreground border-t border-border pt-3">
                    {reviewViewModel.scopeText}
                  </p>
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

            {/* Contact + location */}
            <section className="space-y-3" aria-labelledby="lead-review-contact">
              <div className="flex items-center justify-between">
                <h3 id="lead-review-contact" className={sectionTitleClass}>
                  Who &amp; where
                </h3>
                <Link
                  href={editHref}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle hover:text-foreground"
                >
                  <Pencil className="size-2.5" /> Edit
                </Link>
              </div>

              <div className="rounded-xl border border-border bg-surface p-4 space-y-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1 rounded-full bg-foreground/5 p-2">
                    <User className="size-4 text-foreground-subtle" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold">{lead.contactName || "Unknown contact"}</h4>
                    {lead.companyName ? (
                      <p className="text-sm text-foreground-muted">{lead.companyName}</p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="size-4 text-foreground-subtle shrink-0" />
                    <span className="truncate">{lead.email || "No email"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="size-4 text-foreground-subtle shrink-0" />
                    <span>{lead.phone || "No phone"}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2 border-t border-border pt-4 text-sm">
                  <MapPin className="size-4 shrink-0 mt-0.5 text-foreground-subtle" />
                  <div>
                    <p className="font-medium">{lead.jobsiteAddressLine || "No address provided"}</p>
                    {lead.isAddressVerified ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-success">
                        Verified
                      </span>
                    ) : lead.jobsiteAddressLine.trim() ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-warning">
                        Address needs review
                      </span>
                    ) : null}
                  </div>
                </div>
                <SiteDetailsRow data={siteData} onOpen={() => setSiteDrawerOpen(true)} />

                {customer ? (
                  <div className="flex items-center gap-2 rounded-lg bg-foreground/[0.02] p-2 text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
                    <CheckCircle2 className="size-3 text-success" />
                    Linked: {customer.displayName}
                    <Link
                      href={customer.href}
                      className="ml-auto flex items-center gap-1 hover:text-foreground"
                    >
                      View <ExternalLink className="size-2.5" />
                    </Link>
                  </div>
                ) : null}
              </div>
              <SiteDetailsDrawer
                open={siteDrawerOpen}
                onClose={() => setSiteDrawerOpen(false)}
                data={siteData}
              />
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

            {linkedQuotes.length > 0 ? (
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
        </div>
      </div>

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
    </div>
  );
}
