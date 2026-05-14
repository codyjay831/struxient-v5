import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  LeadWorkspacePageClient,
  type SerializedLeadFull,
  type SerializedLinkedQuoteFull,
  type SerializedProgressActionFull,
} from "@/components/leads/lead-workspace-page-client";
import type { LeadFormState } from "@/app/(workspace)/leads/lead-form-actions";
import type { LeadCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import type { LeadCommercialProgress, LeadCommercialProgressAction, LeadWorkSurfaceProgressAction } from "@/lib/lead-commercial-progress";
import { resolveLeadCommercialProgressActionHref, serializeLeadProgressAction } from "@/lib/lead-commercial-progress";
import {
  formatLeadChannel,
  formatLeadStatus,
  leadStatusBadgeTone,
  type LeadDetailPayload,
} from "@/lib/lead-display";
import {
  formatQuoteStatus,
  quoteStatusBadgeTone,
  type QuoteLinkedSummary,
} from "@/lib/quote-display";
import type { LeadWorkSurfaceActiveQuotePayload } from "@/components/work-surfaces/lead-work-surface";
import type { LeadServiceAddressContext } from "@/app/(workspace)/leads/lead-workspace-actions";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

/** QuoteLinkedSummary extended with the line-item count needed for the full-page quota tab. */
export type QuoteLinkedSummaryWithCount = QuoteLinkedSummary & { lineItemCount: number };

export type LeadWorkspaceShellProps = {
  lead: LeadDetailPayload;
  /** Bound `updateLeadStatusAction.bind(null, lead.id)` from the lead detail route. */
  updateStatusAction: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
  /** Org-scoped customers for the link form; omit when the lead is already linked. */
  customersForLink?: { id: string; displayName: string }[];
  /** Bound `linkLeadToCustomerAction.bind(null, lead.id)`; omit when already linked. */
  linkLeadAction?: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
  /** Warn-only customer match hints when the lead is unlinked. */
  matchHints?: LeadCustomerMatchHints;
  /** Bound `createCustomerFromLeadAction.bind(null, lead.id)` — unused on this page
   *  (the workspace client uses the non-redirect workspace variant directly), kept for
   *  forward-compat if callers already pass it. */
  createFromLeadAction?: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
  /** Quotes linked to this lead (with line-item count), newest first. */
  linkedQuotes?: QuoteLinkedSummaryWithCount[];
  /** Derived commercial progress story; computed server-side per request. */
  commercialProgress: LeadCommercialProgress;
  /**
   * Optional return context link — shown as the first header action when the
   * user arrived from Workstation.
   */
  returnHref?: string;
  /** Pre-loaded QuoteWorkSurface payload for the active linked quote. */
  activeQuoteWorkSurface?: LeadWorkSurfaceActiveQuotePayload | null;
  /** Pre-loaded service-address context for the Customer Info block. */
  serviceAddressContext?: LeadServiceAddressContext;
};

export function LeadWorkspaceShell({
  lead,
  updateStatusAction,
  customersForLink,
  linkLeadAction,
  matchHints,
  linkedQuotes = [],
  commercialProgress,
  returnHref,
  activeQuoteWorkSurface,
  serviceAddressContext,
}: LeadWorkspaceShellProps) {
  /* ── Date formatting (server-side for SSR consistency) ─────────────────── */
  const locale = "en-US";
  const dateOpts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const createdAtLabel = lead.createdAt.toLocaleDateString(locale, dateOpts);
  const updatedAtLabel = lead.updatedAt.toLocaleDateString(locale, dateOpts);
  const convertedAtLabel = lead.convertedAt
    ? lead.convertedAt.toLocaleDateString(locale, dateOpts)
    : null;
  const neededByDateLabel = lead.neededByDate
    ? lead.neededByDate.toLocaleDateString(locale, dateOpts)
    : null;

  /* ── Serialize progress actions ────────────────────────────────────────── */
  function serializeAction(
    action: LeadCommercialProgressAction | null,
  ): SerializedProgressActionFull | null {
    if (!action) return null;
    const href = resolveLeadCommercialProgressActionHref(action, { leadId: lead.id });
    const opensQuoteTab =
      action.kind === "OPEN_DRAFT_QUOTE" ||
      action.kind === "OPEN_QUOTE" ||
      action.kind === "START_QUOTE";
    const opensContactTab =
      action.kind === "ATTACH_OR_CREATE_CUSTOMER" ||
      action.kind === "EDIT_CONTACT_INFO";
    return { href, label: action.label, opensQuoteTab, opensContactTab };
  }

  /* ── Serialize lead ────────────────────────────────────────────────────── */
  const serializedLead: SerializedLeadFull = {
    id: lead.id,
    title: lead.title,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
    requestType: lead.requestType,
    neededByBucket: lead.neededByBucket,
    neededByDateLabel,
    scopeSummary: lead.scopeSummary,
    jobsiteAddressLine: lead.jobsiteAddressLine,
    intakeServiceLocationLinkedToCustomer: lead.intakeServiceLocationLinkedToCustomer,
    sourceLabel: formatLeadChannel(lead.source),
    sourceDetail: lead.sourceDetail,
    statusLabel: formatLeadStatus(lead.status),
    statusTone: leadStatusBadgeTone(lead.status),
    statusValue: lead.status,
    customerId: lead.customerId,
    customerDisplayName: lead.customer?.displayName ?? null,
    customerHref: lead.customer ? `/customers/${lead.customer.id}` : null,
    createdAtLabel,
    updatedAtLabel,
    convertedAtLabel,
    showConvertedWithoutCustomerHelper:
      lead.status === "CONVERTED" && lead.customerId == null,
    leadHref: `/leads/${lead.id}`,
    editHref: `/leads/${lead.id}/edit`,
    newQuoteHref: `/quotes/new?leadId=${encodeURIComponent(lead.id)}`,
    progressLabel: commercialProgress.label,
    progressDescription: commercialProgress.description,
    progressTone: commercialProgress.badgeTone,
    progressState: commercialProgress.state,
    progressPrimaryAction: serializeAction(commercialProgress.primaryAction),
    progressSecondaryAction: serializeAction(commercialProgress.secondaryAction),
    progressStepIndex: commercialProgress.stepIndex,
    progressTotalSteps: commercialProgress.totalSteps,
    progressIsTerminal: commercialProgress.isTerminal,
    activeQuoteId: commercialProgress.activeQuote?.id ?? null,
    activeQuoteTitle: commercialProgress.activeQuote?.title ?? null,
    activeQuoteStatusLabel: commercialProgress.activeQuote
      ? formatQuoteStatus(commercialProgress.activeQuote.status)
      : null,
    activeQuoteTone: commercialProgress.activeQuote
      ? quoteStatusBadgeTone(commercialProgress.activeQuote.status)
      : null,
    activeQuoteTotalCents: commercialProgress.activeQuote?.totalCents ?? null,
    activeQuoteLineItemCount: commercialProgress.activeQuote?.lineItemCount ?? null,
    activeJobId: commercialProgress.activeJob?.id ?? null,
    activeJobStatus: commercialProgress.activeJob?.status ?? null,
    showsRevisionDrift: commercialProgress.showsRevisionDrift,
    source: lead.source,
    visitRequests: lead.visitRequests.map((vr) => ({
      id: vr.id,
      requestedDate: vr.requestedDate,
      requestedDateLabel: vr.requestedDate
        ? vr.requestedDate.toLocaleDateString(locale, dateOpts)
        : null,
      requestedWindow: vr.requestedWindow,
      confirmedDate: vr.confirmedDate,
      status: vr.status,
      notes: vr.notes,
      createdAt: vr.createdAt,
    })),
  };

  /* ── Serialize linked quotes ───────────────────────────────────────────── */
  const serializedQuotes: SerializedLinkedQuoteFull[] = linkedQuotes
    .filter((q) => q.status !== "ARCHIVED")
    .map((q) => ({
      id: q.id,
      title: q.title,
      statusLabel: formatQuoteStatus(q.status),
      statusTone: quoteStatusBadgeTone(q.status),
      totalCents: q.totalCents,
      lineItemCount: q.lineItemCount,
      updatedAtLabel: new Date(q.updatedAt).toLocaleDateString(locale, dateOpts),
      href: `/quotes/${q.id}`,
      executionReviewHref: `/quotes/${q.id}/execution-review`,
      isDraft: q.status === "DRAFT",
      isSent: q.status === "SENT",
      isApproved: q.status === "APPROVED",
    }));

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-4xl">
      {/* Breadcrumb */}
      <WorkspaceBreadcrumb
        items={[
          { label: "Leads", href: "/leads" },
          { label: lead.title },
        ]}
      />

      {/* ── Identity header ──────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <StatusBadge
              label={commercialProgress.label}
              tone={commercialProgress.badgeTone}
            />
            <span className="text-xs text-foreground-subtle">
              {formatLeadChannel(lead.source)} · {createdAtLabel}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight leading-tight">
            {lead.title}
          </h1>
          {lead.contactName && (
            <p className="text-sm text-foreground-muted mt-0.5">{lead.contactName}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {returnHref && (
            <Link href={returnHref} className={listLinkClass}>
              ← Workstation
            </Link>
          )}
          <Link href="/leads" className={listLinkClass}>
            ← Leads
          </Link>
          <Link href={`/leads/${lead.id}/edit`} className={listLinkClass}>
            Edit
          </Link>
        </div>
      </div>

      {/* ── Client workspace (next step + tabs) ──────────────────────────── */}
      <LeadWorkspacePageClient
        lead={serializedLead}
        linkedQuotes={serializedQuotes}
        updateStatusAction={updateStatusAction}
        customersForLink={customersForLink}
        linkLeadAction={linkLeadAction}
        matchHints={matchHints}
        activeQuoteWorkSurface={activeQuoteWorkSurface}
        serviceAddressContext={serviceAddressContext}
      />
    </div>
  );
}
