import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  SalesWorkspacePageClient,
  type SerializedSalesIntakeFull,
  type SerializedLinkedQuoteFull,
  type SerializedProgressActionFull,
} from "@/components/sales/sales-workspace-page-client";
import type { SalesIntakeFormState } from "@/app/(workspace)/sales/sales-form-actions";
import type { SalesIntakeCustomerMatchHints } from "@/lib/sales-intake-customer-match-hints";
import type { SalesIntakeCommercialProgress, SalesIntakeCommercialProgressAction } from "@/lib/sales-commercial-progress";
import { resolveSalesIntakeCommercialProgressActionHref } from "@/lib/sales-commercial-progress";
import {
  formatSalesIntakeSource,
  formatSalesIntakeStatus,
  salesIntakeStatusBadgeTone,
  type SalesIntakeDetailPayload,
} from "@/lib/sales-intake-display";
import {
  formatQuoteStatus,
  quoteStatusBadgeTone,
  type QuoteLinkedSummary,
} from "@/lib/quote-display";
import type { SalesIntakeWorkSurfaceActiveQuotePayload } from "@/components/work-surfaces/sales-intake-work-surface";
import type { SalesIntakeServiceAddressContext } from "@/app/(workspace)/sales/sales-workspace-actions";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

/** QuoteLinkedSummary extended with the line-item count needed for the full-page quota tab. */
export type QuoteLinkedSummaryWithCount = QuoteLinkedSummary & { lineItemCount: number };

export type SalesIntakeWorkspaceShellProps = {
  salesIntake: SalesIntakeDetailPayload;
  /** Bound `updateSalesIntakeStatusAction.bind(null, salesIntake.id)` from the sales intake detail route. */
  updateStatusAction: (
    prevState: SalesIntakeFormState,
    formData: FormData,
  ) => Promise<SalesIntakeFormState>;
  /** Org-scoped customers for the link form; omit when the sales intake is already linked. */
  customersForLink?: { id: string; displayName: string }[];
  /** Bound `linkSalesIntakeToCustomerAction.bind(null, salesIntake.id)`; omit when already linked. */
  linkSalesIntakeAction?: (
    prevState: SalesIntakeFormState,
    formData: FormData,
  ) => Promise<SalesIntakeFormState>;
  /** Warn-only customer match hints when the sales intake is unlinked. */
  matchHints?: SalesIntakeCustomerMatchHints;
  /** Bound `createCustomerFromSalesIntakeAction.bind(null, salesIntake.id)` — unused on this page
   *  (the workspace client uses the non-redirect workspace variant directly), kept for
   *  forward-compat if callers already pass it. */
  createFromSalesIntakeAction?: (
    prevState: SalesIntakeFormState,
    formData: FormData,
  ) => Promise<SalesIntakeFormState>;
  /** Quotes linked to this sales intake (with line-item count), newest first. */
  linkedQuotes?: QuoteLinkedSummaryWithCount[];
  /** Derived commercial progress story; computed server-side per request. */
  commercialProgress: SalesIntakeCommercialProgress;
  /**
   * Optional return context link — shown as the first header action when the
   * user arrived from Workstation.
   */
  returnHref?: string;
  /** Pre-loaded QuoteWorkSurface payload for the active linked quote. */
  activeQuoteWorkSurface?: SalesIntakeWorkSurfaceActiveQuotePayload | null;
  /** Pre-loaded service-address context for the Customer Info block. */
  serviceAddressContext?: SalesIntakeServiceAddressContext;
};

export function SalesIntakeWorkspaceShell({
  salesIntake,
  updateStatusAction,
  customersForLink,
  linkSalesIntakeAction,
  matchHints,
  linkedQuotes = [],
  commercialProgress,
  returnHref,
  activeQuoteWorkSurface,
  serviceAddressContext,
}: SalesIntakeWorkspaceShellProps) {
  /* ── Date formatting (server-side for SSR consistency) ─────────────────── */
  const locale = "en-US";
  const dateOpts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const createdAtLabel = salesIntake.createdAt.toLocaleDateString(locale, dateOpts);
  const updatedAtLabel = salesIntake.updatedAt.toLocaleDateString(locale, dateOpts);
  const convertedAtLabel = salesIntake.convertedAt
    ? salesIntake.convertedAt.toLocaleDateString(locale, dateOpts)
    : null;
  const neededByDateLabel = salesIntake.neededByDate
    ? salesIntake.neededByDate.toLocaleDateString(locale, dateOpts)
    : null;

  /* ── Serialize progress actions ────────────────────────────────────────── */
  function serializeAction(
    action: SalesIntakeCommercialProgressAction | null,
  ): SerializedProgressActionFull | null {
    if (!action) return null;
    const href = resolveSalesIntakeCommercialProgressActionHref(action, { salesIntakeId: salesIntake.id });
    const opensQuoteTab =
      action.kind === "OPEN_DRAFT_QUOTE" ||
      action.kind === "OPEN_QUOTE" ||
      action.kind === "START_QUOTE";
    const opensContactTab =
      action.kind === "ATTACH_OR_CREATE_CUSTOMER" ||
      action.kind === "EDIT_CONTACT_INFO";
    return { href, label: action.label, opensQuoteTab, opensContactTab };
  }

  /* ── Serialize sales intake ────────────────────────────────────────────────────── */
  const serializedSalesIntake: SerializedSalesIntakeFull = {
    id: salesIntake.id,
    title: salesIntake.title,
    contactName: salesIntake.contactName,
    email: salesIntake.email,
    phone: salesIntake.phone,
    notes: salesIntake.notes,
    requestType: salesIntake.requestType,
    neededByBucket: salesIntake.neededByBucket,
    neededByDateLabel,
    scopeSummary: salesIntake.scopeSummary,
    jobsiteAddressLine: salesIntake.jobsiteAddressLine,
    intakeServiceLocationLinkedToCustomer: salesIntake.intakeServiceLocationLinkedToCustomer,
    sourceLabel: formatSalesIntakeSource(salesIntake.source),
    sourceDetail: salesIntake.sourceDetail,
    statusLabel: formatSalesIntakeStatus(salesIntake.status),
    statusTone: salesIntakeStatusBadgeTone(salesIntake.status),
    statusValue: salesIntake.status,
    customerId: salesIntake.customerId,
    customerDisplayName: salesIntake.customer?.displayName ?? null,
    customerHref: salesIntake.customer ? `/customers/${salesIntake.customer.id}` : null,
    createdAtLabel,
    updatedAtLabel,
    convertedAtLabel,
    showConvertedWithoutCustomerHelper:
      salesIntake.status === "CONVERTED" && salesIntake.customerId == null,
    salesIntakeHref: `/sales/${salesIntake.id}`,
    editHref: `/sales/${salesIntake.id}/edit`,
    newQuoteHref: `/quotes/new?salesIntakeId=${encodeURIComponent(salesIntake.id)}`,
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
    source: salesIntake.source,
    visitRequests: salesIntake.visitRequests.map((vr) => ({
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
          { label: "Sales" },
          { label: "Sales", href: "/sales" },
          { label: salesIntake.title },
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
              {formatSalesIntakeSource(salesIntake.source)} · {createdAtLabel}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight leading-tight">
            {salesIntake.title}
          </h1>
          {salesIntake.contactName && (
            <p className="text-sm text-foreground-muted mt-0.5">{salesIntake.contactName}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {returnHref && (
            <Link href={returnHref} className={listLinkClass}>
              ← Workstation
            </Link>
          )}
          <Link href="/sales" className={listLinkClass}>
            ← Sales Intakes
          </Link>
          <Link href={`/sales/${salesIntake.id}/edit`} className={listLinkClass}>
            Edit
          </Link>
        </div>
      </div>

      {/* ── Client workspace (next step + tabs) ──────────────────────────── */}
      <SalesWorkspacePageClient
        salesIntake={serializedSalesIntake}
        linkedQuotes={serializedQuotes}
        updateStatusAction={updateStatusAction}
        customersForLink={customersForLink}
        linkSalesIntakeAction={linkSalesIntakeAction}
        matchHints={matchHints}
        activeQuoteWorkSurface={activeQuoteWorkSurface}
        serviceAddressContext={serviceAddressContext}
      />
    </div>
  );
}
