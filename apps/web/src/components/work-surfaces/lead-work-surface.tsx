"use client";

/**
 * LeadWorkSurface — the canonical Lead work UX, regardless of container.
 *
 * Same lead, same work surface. Different container, same behavior.
 *
 * Modes change spacing/layout only. They never remove core actions.
 *
 *   compact   — Workstation drawer (narrow, tight padding)
 *   standard  — Leads page popup (the visual reference)
 *   full      — Lead full page (wider, with optional record-detail summary)
 *
 * The popup at `LeadsListClient` is the visual reference; this component is a
 * faithful extraction of that UX so all three containers share it.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Pencil,
  UserRound,
} from "lucide-react";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import {
  createQuoteFromLeadWorkspaceAction,
  loadLeadActiveQuoteWorkSurfaceAction,
  updateLeadContactWorkspaceAction,
  type LeadServiceAddressContext,
  type LoadLeadServiceAddressContextResult,
  type WorkspaceFormState,
} from "@/app/(workspace)/leads/lead-workspace-actions";
import {
  LeadServiceAddressBlock,
  type LeadServiceAddressBlockHandle,
} from "@/components/leads/lead-service-address-block";
import { LeadCustomerAttachCard } from "@/components/leads/lead-customer-attach-card";
import { LeadStatusForm } from "@/components/leads/lead-status-form";
import type { LeadFormState } from "@/app/(workspace)/leads/lead-form-actions";
import type { LeadCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import {
  resolveLeadCommercialProgressActionHref,
  serializeLeadProgressAction,
  type LeadCommercialProgressAction,
  type LeadWorkSurfaceProgressAction,
} from "@/lib/lead-commercial-progress";
import type { LeadStatus, LeadChannel, LeadVisitRequestStatus } from "@prisma/client";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";
import type { QuoteReadiness } from "@/lib/quote-readiness";
import type { QuoteWorkspaceTabData } from "@/lib/quote-workspace-payload";

/** Serializable lead visit request for the work surface. */
export type LeadWorkSurfaceVisitRequest = {
  id: string;
  requestedDate: Date | null;
  requestedDateLabel: string | null;
  requestedWindow: string | null;
  confirmedDate: Date | null;
  status: LeadVisitRequestStatus;
  notes: string | null;
  createdAt: Date;
};

/**
 * Pre-loaded QuoteWorkSurface payload for the active linked quote. When
 * provided, the Quote tab renders `<QuoteWorkSurface mode="standard" />` for
 * the active quote; falls back to today's simpler quote cards when absent.
 *
 * Mirrors `QuoteWorkSurfaceLoaderResult` so the lazy loader path can pipe
 * straight through.
 */
export type LeadWorkSurfaceActiveQuotePayload = {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  workspaceTabs: QuoteWorkspaceTabData;
};

/**
 * Result shape for the lazy active-quote loader (used by the Leads list popup,
 * which doesn't preload readiness per row). Containers that already have the
 * payload server-side pass `activeQuoteWorkSurface` directly and skip this.
 */
export type LeadWorkSurfaceActiveQuoteLoadResult =
  | { ok: true; payload: LeadWorkSurfaceActiveQuotePayload | null }
  | { ok: false; error: string };

/** Internal lazy-load state machine for the active-quote payload. */
type ActiveQuoteLazyState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; payload: LeadWorkSurfaceActiveQuotePayload | null }
  | { kind: "error"; message: string };

/* ─── Public types ──────────────────────────────────────────────────────── */

export type LeadWorkSurfaceMode = "compact" | "standard" | "full";

export type LeadWorkSurfaceQuote = {
  id: string;
  title: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  totalCents: number;
  lineItemCount: number;
  href: string;
  /** Optional richer fields used in full mode (per-quote action buttons). */
  updatedAtLabel?: string;
  executionReviewHref?: string;
  isDraft?: boolean;
  isSent?: boolean;
  isApproved?: boolean;
};

export type LeadWorkSurfaceData = {
  id: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  /** New intake fields from Phase C. */
  requestType?: string | null;
  neededByBucket?: string | null;
  neededByDateLabel?: string | null;
  scopeSummary?: string | null;
  /** Jobsite / project address line when known (from lead intake or customer profile). */
  jobsiteAddressLine?: string | null;
  intakeServiceLocationLinkedToCustomer?: boolean;
  sourceLabel: string;
  /** Canonical enum — optional on lightweight shells (list popup, workstation). */
  source?: LeadChannel;
  /** Optional, full mode only. */
  sourceDetail?: string | null;
  /** Manual LeadStatus enum label (not the derived progress label). */
  statusLabel: string;
  statusTone: StatusBadgeTone;
  /** Manual LeadStatus enum value — required when `updateStatusAction` is set. */
  statusValue?: LeadStatus;
  customerId: string | null;
  customerDisplayName: string | null;
  customerHref: string | null;
  createdAtLabel: string;
  /** Optional, full mode only. */
  updatedAtLabel?: string;
  /** Optional, full mode only. */
  convertedAtLabel?: string | null;
  /** Optional, full mode only. */
  showConvertedWithoutCustomerHelper?: boolean;
  leadHref: string;
  editHref: string;
  newQuoteHref: string;
  /* Derived commercial progress (driver of CTA card + tab switching). */
  progressLabel: string;
  progressDescription: string;
  progressTone: StatusBadgeTone;
  progressState: string;
  progressPrimaryAction: LeadWorkSurfaceProgressAction | null;
  progressSecondaryAction: LeadWorkSurfaceProgressAction | null;
  /* Active record context (used by full-mode summary cards + compact-mode hint). */
  activeQuoteId: string | null;
  activeQuoteTitle?: string | null;
  activeQuoteStatusLabel?: string | null;
  activeQuoteTone?: StatusBadgeTone | null;
  activeQuoteTotalCents?: number | null;
  activeQuoteLineItemCount?: number | null;
  activeJobId: string | null;
  activeJobStatus?: string | null;
  /** Active quote edited since last commercial proof. */
  showsRevisionDrift?: boolean;
  /** Site visit requests (Phase C). */
  visitRequests?: LeadWorkSurfaceVisitRequest[];
};

export type LeadWorkSurfaceTab = "overview" | "contact" | "activity" | "quote";

export type LeadWorkSurfaceProps = {
  mode: LeadWorkSurfaceMode;
  lead: LeadWorkSurfaceData;
  linkedQuotes: LeadWorkSurfaceQuote[];
  /** Org-scoped customers used by the link-existing form (full mode redirect form, or compact/standard workspace form). */
  customersForLink?: { id: string; displayName: string }[];
  /** Customer match hints — only meaningful when no customer is linked yet. Full mode renders them. */
  matchHints?: LeadCustomerMatchHints;
  /** Bound `updateLeadStatusAction.bind(null, leadId)` — full-mode status form (redirects on success). */
  updateStatusAction?: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
  /** Bound `linkLeadToCustomerAction.bind(null, leadId)` — full-mode redirecting link form. */
  linkLeadAction?: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
  /** Initial tab (defaults to "overview"). */
  initialTab?: LeadWorkSurfaceTab;
  /**
   * Pre-loaded active-quote QuoteWorkSurface payload for the active linked quote. When
   * provided, the Quote tab renders `<QuoteWorkSurface mode="standard" />` for
   * the active quote; falls back to today's simpler quote cards when absent.
   *
   * Workstation lead drawer + Lead full page pass this. The Leads list popup
   * leaves it `undefined` and supplies a lazy loader instead.
   */
  activeQuoteWorkSurface?: LeadWorkSurfaceActiveQuotePayload | null;
  /**
   * Lazy loader for the active-quote payload — invoked once the first time
   * the user opens the Quote tab, only when `activeQuoteWorkSurface` is
   * `undefined` and the lead has at least one linked quote. The result is
   * cached at this surface's lifetime, so tab switches don't refetch.
   *
   * Used by the Leads list popup so the leads-list query doesn't have to
   * preload quote readiness for every row.
   */
  loadActiveQuoteWorkSurface?: () => Promise<LeadWorkSurfaceActiveQuoteLoadResult>;
  /**
   * Pre-loaded service-address context for the Lead workspace Customer Info
   * area — render `<LeadServiceAddressBlock>` inline. Lead full page and
   * Workstation lead drawer pass this directly.
   */
  serviceAddressContext?: LeadServiceAddressContext;
  /**
   * Lazy loader for the service-address context — used by the Leads list
   * popup so the list query doesn't have to fetch every customer's service
   * locations up front. Skipped when `serviceAddressContext` is provided.
   */
  loadServiceAddressContext?: () => Promise<LoadLeadServiceAddressContextResult>;
  /** Popup host can patch its open row snapshot when a quote is created in-place. */
  onQuoteStarted?: (args: {
    quoteId: string;
    activeQuotePayload: LeadWorkSurfaceActiveQuotePayload | null;
  }) => void;
};

/* ─── Helpers exported for container serialization ─────────────────────── */

/* ─── Shared classnames ─────────────────────────────────────────────────── */

const TABS: { id: LeadWorkSurfaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contact", label: "Contact" },
  { id: "quote", label: "Quote" },
  { id: "activity", label: "Activity" },
];

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none";

const primaryBtnClass =
  "rounded-lg bg-accent text-accent-contrast text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5";

const secondaryBtnClass =
  "rounded-lg border border-border bg-surface text-foreground-muted text-xs px-3 py-2 hover:text-foreground hover:border-border-strong transition-colors";

const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/* ─── Inline contact edit form (faithfully copied from popup) ──────────── */

function EditContactForm({
  lead,
  onSuccess,
  onCancel,
  fieldIdPrefix,
}: {
  lead: LeadWorkSurfaceData;
  onSuccess: () => void;
  onCancel: () => void;
  fieldIdPrefix: string;
}) {
  const boundAction = updateLeadContactWorkspaceAction.bind(null, lead.id);
  const [state, dispatch, isPending] = useActionState<WorkspaceFormState, FormData>(
    boundAction,
    {},
  );

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={dispatch} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor={`${fieldIdPrefix}-contactName`}
            className={`mb-1 block ${sectionLabelClass}`}
          >
            Contact name
          </label>
          <input
            id={`${fieldIdPrefix}-contactName`}
            name="contactName"
            type="text"
            defaultValue={lead.contactName ?? ""}
            className={inputClass}
            placeholder="Name"
          />
        </div>
        <div>
          <label
            htmlFor={`${fieldIdPrefix}-email`}
            className={`mb-1 block ${sectionLabelClass}`}
          >
            Email
          </label>
          <input
            id={`${fieldIdPrefix}-email`}
            name="email"
            type="email"
            defaultValue={lead.email ?? ""}
            className={inputClass}
            placeholder="email@example.com"
          />
        </div>
        <div>
          <label
            htmlFor={`${fieldIdPrefix}-phone`}
            className={`mb-1 block ${sectionLabelClass}`}
          >
            Phone
          </label>
          <input
            id={`${fieldIdPrefix}-phone`}
            name="phone"
            type="tel"
            defaultValue={lead.phone ?? ""}
            className={inputClass}
            placeholder="(555) 000-0000"
          />
        </div>
      </div>

      {state.error && (
        <p
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className={primaryBtnClass}
        >
          {isPending ? "Saving…" : "Save contact info"}
        </button>
        <button type="button" onClick={onCancel} className={secondaryBtnClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─── Next step card (popup style — single eyebrow, no required/optional clutter) ── */

function NextStepCard({
  lead,
  onSwitchToSection,
}: {
  lead: LeadWorkSurfaceData;
  onSwitchToSection: (section: "quote" | "contact") => void;
}) {
  const { progressPrimaryAction: primary, progressSecondaryAction: secondary } = lead;

  function renderAction(
    action: LeadWorkSurfaceProgressAction,
    variant: "primary" | "secondary",
  ) {
    const cls = variant === "primary" ? primaryBtnClass : secondaryBtnClass;

    if (action.opensQuoteTab) {
      return (
        <button type="button" onClick={() => onSwitchToSection("quote")} className={cls}>
          {action.label}
          {variant === "primary" && (
            <ArrowRight className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
          )}
        </button>
      );
    }
    if (action.opensContactTab) {
      return (
        <button type="button" onClick={() => onSwitchToSection("contact")} className={cls}>
          {action.label}
          {variant === "primary" && (
            <ArrowRight className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
          )}
        </button>
      );
    }
    return (
      <Link href={action.href} className={cls}>
        {action.label}
        {variant === "primary" && (
          <ArrowUpRight className="w-3.5 h-3.5 opacity-70" strokeWidth={1.5} />
        )}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={`size-1.5 rounded-full bg-accent animate-pulse`} />
        <p className={sectionLabelClass}>Next action</p>
      </div>
      <h3 className="text-lg font-semibold text-foreground leading-snug">
        {lead.progressLabel}
      </h3>
      <p className="mt-1 text-sm text-foreground-muted leading-relaxed">
        {lead.progressDescription}
      </p>

      {lead.activeJobId && (
        <div className="mt-4 rounded-lg border border-border bg-surface px-3 py-2.5 flex items-center justify-between gap-3">
          <div>
            <p className={sectionLabelClass}>Active job</p>
            <p className="mt-0.5 text-sm font-medium text-foreground capitalize">
              {lead.activeJobStatus
                ? lead.activeJobStatus.charAt(0).toUpperCase() +
                  lead.activeJobStatus.slice(1).toLowerCase()
                : "Active"}
            </p>
          </div>
          <p className="text-xs text-foreground-subtle">
            Job in execution
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {primary && renderAction(primary, "primary")}
        {secondary && renderAction(secondary, "secondary")}
      </div>
    </div>
  );
}

/* ─── Overview tab ─────────────────────────────────────────────────────── */

function OverviewTab({
  mode,
  lead,
  linkedQuotes,
  updateStatusAction,
  onSwitchToSection,
}: {
  mode: LeadWorkSurfaceMode;
  lead: LeadWorkSurfaceData;
  linkedQuotes: LeadWorkSurfaceQuote[];
  updateStatusAction?: LeadWorkSurfaceProps["updateStatusAction"];
  onSwitchToSection: (section: "quote" | "contact") => void;
}) {
  const isFull = mode === "full";
  const quoteLabel =
    linkedQuotes.length > 0 ? linkedQuotes[0].statusLabel : "Not started";

  /* Full mode shows a "Received" tile (matches today's full page); other modes
     show the manual lead status badge (matches the popup). */
  return (
    <div className="space-y-4">
      {mode !== "full" && (
        <NextStepCard
          lead={lead}
          onSwitchToSection={onSwitchToSection}
        />
      )}

      {/* 4-field summary — same shape in all modes. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onSwitchToSection("contact")}
          className="rounded-lg border border-border bg-surface p-3 text-left hover:bg-background transition-colors"
        >
          <p className={`${sectionLabelClass} mb-0.5`}>Customer</p>
          <p className="text-sm font-medium text-foreground truncate">
            {lead.customerDisplayName ?? "Not linked"}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onSwitchToSection("quote")}
          className="rounded-lg border border-border bg-surface p-3 text-left hover:bg-background transition-colors group"
        >
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className={sectionLabelClass}>Quote</p>
            {linkedQuotes.length > 0 && (
              <ArrowUpRight className="size-3 text-foreground-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <p className="text-sm font-medium text-foreground">{quoteLabel}</p>
        </button>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Source</p>
          <p className="text-sm font-medium text-foreground">{lead.sourceLabel}</p>
        </div>
        {isFull ? (
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className={`${sectionLabelClass} mb-0.5`}>Received</p>
            <p className="text-sm font-medium text-foreground">{lead.createdAtLabel}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className={`${sectionLabelClass} mb-0.5`}>Status</p>
            <StatusBadge label={lead.statusLabel} tone={lead.statusTone} />
          </div>
        )}
      </div>

      {/* Site Visit Request (Phase C) */}
      {lead.visitRequests && lead.visitRequests.some(vr => vr.status === "PENDING") && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-accent" />
            <p className="text-xs font-bold uppercase tracking-widest text-accent">
              Site Visit Requested
            </p>
          </div>
          
          {lead.visitRequests.filter(vr => vr.status === "PENDING").map(vr => (
            <div key={vr.id} className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={sectionLabelClass}>Preferred date</p>
                  <p className="text-sm font-medium text-foreground">
                    {vr.requestedDateLabel ?? "Not specified"}
                  </p>
                </div>
                <div>
                  <p className={sectionLabelClass}>Preferred window</p>
                  <p className="text-sm font-medium text-foreground capitalize">
                    {vr.requestedWindow?.toLowerCase() ?? "Anytime"}
                  </p>
                </div>
              </div>
              {vr.notes && (
                <div>
                  <p className={sectionLabelClass}>Visit notes</p>
                  <p className="text-sm text-foreground-muted leading-relaxed">
                    {vr.notes}
                  </p>
                </div>
              )}
              <div className="pt-2">
                <button
                  type="button"
                  className={primaryBtnClass}
                  onClick={() => {
                    /* Placeholder for confirm action */
                    alert("Confirming visit requests will be wired to the scheduling engine in a future update.");
                  }}
                >
                  Confirm visit
                  <Check className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Request Details Section (Phase C fields) */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className={sectionLabelClass}>Request details</p>
          <Link
            href={lead.editHref}
            className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground transition-colors"
          >
            <Pencil className="w-3 h-3" strokeWidth={1.5} />
            Edit
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={`${sectionLabelClass} mb-0.5`}>Request type</p>
            <p className="text-sm font-medium text-foreground">
              {lead.requestType ?? "Not specified"}
            </p>
          </div>
          <div>
            <p className={`${sectionLabelClass} mb-0.5`}>Needed by</p>
            <p className="text-sm font-medium text-foreground">
              {lead.neededByBucket === "SPECIFIC_DATE" && lead.neededByDateLabel
                ? lead.neededByDateLabel
                : lead.neededByBucket ?? "Not specified"}
            </p>
          </div>
        </div>

        {lead.scopeSummary && (
          <div>
            <p className={`${sectionLabelClass} mb-1`}>Scope summary</p>
            <p className="text-sm leading-relaxed text-foreground-muted whitespace-pre-wrap">
              {lead.scopeSummary}
            </p>
          </div>
        )}

        {lead.notes && (
          <div>
            <p className={`${sectionLabelClass} mb-1`}>Internal notes</p>
            <p className="text-sm leading-relaxed text-foreground-muted whitespace-pre-wrap">
              {lead.notes}
            </p>
          </div>
        )}
      </div>

      {/* Record details — full mode only (manual status form, timestamps, id). */}
      {isFull && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
                aria-hidden
              />
              <span className={sectionLabelClass}>Record details</span>
              <StatusBadge label={lead.statusLabel} tone={lead.statusTone} />
              <span className="ml-auto text-[0.65rem] text-foreground-subtle">
                {lead.createdAtLabel}
              </span>
            </summary>

            <div className="mt-4 space-y-5 border-t border-border pt-4">
              {/* Manual status */}
              {lead.statusValue && updateStatusAction && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                    Manual status
                  </p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    Used for your own pipeline tracking. The next step above is derived
                    automatically.
                  </p>
                  {lead.showConvertedWithoutCustomerHelper && (
                    <p className="mt-2 rounded-lg border border-border border-l-[3px] border-l-accent bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
                      <span className="font-medium text-foreground">
                        Converted without a linked customer.
                      </span>{" "}
                      Linking or creating a customer is a separate explicit step.
                    </p>
                  )}
                  <LeadStatusForm
                    currentStatus={lead.statusValue}
                    formAction={updateStatusAction}
                  />
                </div>
              )}

              {/* Timestamps */}
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className={sectionLabelClass}>Created</dt>
                  <dd className="mt-0.5 text-foreground-muted">{lead.createdAtLabel}</dd>
                </div>
                {lead.updatedAtLabel && (
                  <div>
                    <dt className={sectionLabelClass}>Updated</dt>
                    <dd className="mt-0.5 text-foreground-muted">{lead.updatedAtLabel}</dd>
                  </div>
                )}
                {lead.convertedAtLabel && (
                  <div className="sm:col-span-2">
                    <dt className={sectionLabelClass}>Converted</dt>
                    <dd className="mt-0.5 text-foreground-muted">
                      {lead.convertedAtLabel}
                    </dd>
                  </div>
                )}
              </dl>

              {/* Record ID */}
              <div>
                <p className={sectionLabelClass}>Record ID</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground-muted">
                  {lead.id}
                </p>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Footer link — popup/compact link out to full page; full mode links to edit. */}
      <div className="pt-1">
        <Link
          href={isFull ? lead.editHref : lead.leadHref}
          className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
        >
          {isFull ? "Edit full lead record" : "Open full lead record"}
          <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}

/* ─── Contact tab ──────────────────────────────────────────────────────── */

const ContactTab = forwardRef<
  LeadServiceAddressBlockHandle,
  {
    mode: LeadWorkSurfaceMode;
    lead: LeadWorkSurfaceData;
    customersForLink?: { id: string; displayName: string }[];
    matchHints?: LeadCustomerMatchHints;
    linkLeadAction?: LeadWorkSurfaceProps["linkLeadAction"];
    onRefresh: () => void;
    serviceAddressContext?: LeadServiceAddressContext;
    loadServiceAddressContext?: () => Promise<LoadLeadServiceAddressContextResult>;
  }
>(function ContactTab(
  {
    mode,
    lead,
    matchHints,
    onRefresh,
    serviceAddressContext,
    loadServiceAddressContext,
  },
  serviceAddressBlockRef,
) {
  const isFull = mode === "full";
  const hasContactInfo = Boolean(lead.email) || Boolean(lead.phone);
  /* Auto-expand the edit form when the lead has no contact info. Lazy initial
     state so it's set once per surface mount. */
  const [isEditingContact, setIsEditingContact] = useState(
    () => lead.progressState === "ADD_CONTACT_INFO" && !hasContactInfo,
  );

  function handleContactSaved() {
    setIsEditingContact(false);
    onRefresh();
  }

  const hasMatchHints =
    isFull && matchHints?.kind === "checked" && matchHints.matches.length > 0;

  return (
    <div className="space-y-4">
      {/* ── Contact info ─────────────────────────────────────────────────── */}
      <div className={`rounded-xl border border-border bg-surface p-4 ${!isEditingContact && hasContactInfo ? 'opacity-70' : ''}`}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className={sectionLabelClass}>Contact info</p>
          {!isEditingContact && (
            <button
              type="button"
              onClick={() => setIsEditingContact(true)}
              className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground transition-colors"
            >
              <Pencil className="w-3 h-3" strokeWidth={1.5} />
              Edit
            </button>
          )}
        </div>

        {isEditingContact ? (
          <EditContactForm
            lead={lead}
            onSuccess={handleContactSaved}
            onCancel={() => setIsEditingContact(false)}
            fieldIdPrefix={`lead-${mode}`}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className={`${sectionLabelClass} mb-0.5`}>Name</p>
              <p className="text-sm font-medium text-foreground">
                {lead.contactName ?? "Not provided"}
              </p>
            </div>
            <div>
              <p className={`${sectionLabelClass} mb-0.5`}>Email</p>
              {lead.email ? (
                <a
                  href={`mailto:${lead.email}`}
                  className="text-sm text-foreground hover:text-accent transition-colors break-all"
                >
                  {lead.email}
                </a>
              ) : (
                <p className="text-sm text-foreground-muted">Not provided</p>
              )}
            </div>
            <div>
              <p className={`${sectionLabelClass} mb-0.5`}>Phone</p>
              {lead.phone ? (
                <a
                  href={`tel:${lead.phone}`}
                  className="text-sm text-foreground hover:text-accent transition-colors"
                >
                  {lead.phone}
                </a>
              ) : (
                <p className="text-sm text-foreground-muted">Not provided</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Customer ─────────────────────────────────────────────────────── */}
      {lead.customerId ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-foreground/[0.03] text-foreground-subtle">
                <UserRound className="size-5" />
              </div>
              <div>
                <p className={sectionLabelClass}>Linked customer</p>
                <p className="text-sm font-semibold text-foreground">
                  {lead.customerDisplayName}
                </p>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-success-strong">
                  <Check className="size-3" />
                  <span>Linked</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {lead.customerHref && (
                <Link href={lead.customerHref} className={mutedLinkClass}>
                  View record
                  <ArrowUpRight className="w-3 h-3 ml-1" strokeWidth={1.5} />
                </Link>
              )}
              {isFull && (
                <Link href={lead.editHref} className={mutedLinkClass}>
                  Change link
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Customer match hints (full mode only — relies on server-passed hints). */}
          {hasMatchHints && matchHints?.kind === "checked" && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className={`${sectionLabelClass} mb-3`}>Likely customer matches</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {matchHints.matches.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/customers/${m.id}`}
                        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {m.displayName}
                      </Link>
                      {m.companyName ? (
                        <p className="text-xs text-foreground-muted">{m.companyName}</p>
                      ) : null}
                    </div>
                    <StatusBadge
                      label={
                        m.matchOn === "both"
                          ? "Email & phone"
                          : m.matchOn === "email"
                            ? "Email"
                            : "Phone"
                      }
                      tone="neutral"
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[0.65rem] text-foreground-subtle">
                Suggestions are hints only — no auto-linking.
              </p>
            </div>
          )}

          <LeadCustomerAttachCard
            lead={{
              id: lead.id,
              title: lead.title,
              contactName: lead.contactName,
              email: lead.email,
              phone: lead.phone,
              notes: lead.notes,
              source: lead.source,
              jobsiteAddressLine: lead.jobsiteAddressLine ?? null,
            }}
            editLeadHref={lead.editHref}
            onSuccess={onRefresh}
          />
        </div>
      )}

      {/* ── Service address ──────────────────────────────────────────────── */}
      <LeadServiceAddressBlock
        ref={serviceAddressBlockRef}
        leadId={lead.id}
        leadEditHref={lead.editHref}
        context={serviceAddressContext}
        loadContext={loadServiceAddressContext}
        fallbackAddressLine={lead.jobsiteAddressLine ?? null}
        hasLinkedCustomer={lead.customerId != null}
        onMutated={onRefresh}
      />
    </div>
  );
});

/* ─── Activity tab ─────────────────────────────────────────────────────── */

function ActivityTab({
  mode,
  lead,
  linkedQuotes,
}: {
  mode: LeadWorkSurfaceMode;
  lead: LeadWorkSurfaceData;
  linkedQuotes: LeadWorkSurfaceQuote[];
}) {
  const isFull = mode === "full";
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className={`${sectionLabelClass} mb-3`}>{isFull ? "Timeline" : "Activity"}</p>
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-2 h-2 rounded-full bg-border-strong mt-1.5 shrink-0" />
            <div>
              <span className="text-sm text-foreground-subtle">Lead created</span>
              <span className="text-xs text-foreground-subtle ml-1.5">
                · {lead.createdAtLabel}
              </span>
            </div>
          </div>

          {isFull && lead.convertedAtLabel && lead.customerDisplayName && (
            <div className="flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-border-strong mt-1.5 shrink-0" />
              <div>
                <span className="text-sm text-foreground-subtle">
                  Customer linked · {lead.customerDisplayName}
                </span>
                <span className="text-xs text-foreground-subtle ml-1.5">
                  · {lead.convertedAtLabel}
                </span>
              </div>
            </div>
          )}
          {!isFull && lead.customerDisplayName && (
            <div className="flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-border-strong mt-1.5 shrink-0" />
              <span className="text-sm text-foreground-subtle">
                Customer linked · {lead.customerDisplayName}
              </span>
            </div>
          )}

          {linkedQuotes.map((q) => (
            <div key={q.id} className="flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-foreground mt-1.5 shrink-0" />
              <div>
                <span className="text-sm font-medium text-foreground">
                  Quote {q.statusLabel.toLowerCase()}
                </span>
                <span className="text-xs text-foreground-subtle ml-1.5">
                  · {q.title}
                  {q.updatedAtLabel ? ` · ${q.updatedAtLabel}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isFull ? (
        <p className="text-xs text-foreground-subtle px-1">
          Detailed activity logs will appear here when event storage is available. No
          fabricated history is shown.
        </p>
      ) : (
        <p className="text-xs text-foreground-subtle">
          Full activity log is available on the{" "}
          <Link
            href={lead.leadHref}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            lead record
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/* ─── Quote tab — embeds QuoteWorkSurface(standard) when active quote loaded ─ */

function QuoteTab({
  mode,
  lead,
  linkedQuotes,
  activeQuoteWorkSurface,
  isLoadingActiveQuote,
  activeQuoteError,
  onSwitchToContact,
  onActiveQuoteMutated,
  isStartQuotePending,
  startQuoteError,
  onStartQuote,
  onRequestServiceAddress,
}: {
  mode: LeadWorkSurfaceMode;
  lead: LeadWorkSurfaceData;
  linkedQuotes: LeadWorkSurfaceQuote[];
  activeQuoteWorkSurface?: LeadWorkSurfaceActiveQuotePayload | null;
  isLoadingActiveQuote: boolean;
  activeQuoteError: string | null;
  onSwitchToContact: () => void;
  onActiveQuoteMutated?: () => void;
  isStartQuotePending: boolean;
  startQuoteError: string | null;
  onStartQuote: () => void;
  /** Routes the embedded Quote's missing-address CTA back to the Lead Customer Info block. */
  onRequestServiceAddress: () => void;
}) {
  const isFull = mode === "full";

  if (linkedQuotes.length === 0 && !activeQuoteWorkSurface) {
    if (isStartQuotePending) {
      return (
        <div
          className="flex flex-col items-center justify-center py-10 text-center space-y-3"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-foreground">Creating quote…</p>
          <p className="text-xs text-foreground-subtle max-w-xs leading-relaxed">
            Staying in this workspace. The Quote tab will open the editor when ready.
          </p>
        </div>
      );
    }

    const hasCustomer = lead.customerId != null;
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-foreground/[0.03] text-foreground-subtle">
            <ArrowRight className="size-6" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">No quote started yet</p>
            <p className="text-xs text-foreground-muted max-w-xs leading-relaxed">
              {hasCustomer
                ? "The customer is linked. You can now start a draft quote to begin pricing the work."
                : "Start a draft quote for this lead. You can link a customer later on the Contact tab."}
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onStartQuote}
              disabled={isStartQuotePending}
              aria-busy={isStartQuotePending}
              className={primaryBtnClass}
            >
              Start draft quote
              <ArrowRight className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
            </button>

            {!hasCustomer ? (
              <button
                type="button"
                onClick={onSwitchToContact}
                className="text-xs text-foreground-subtle hover:text-foreground underline underline-offset-4 transition-colors"
              >
                Link customer first
              </button>
            ) : null}
          </div>

          {startQuoteError ? (
            <p
              className="max-w-sm rounded-lg border border-border bg-surface px-3 py-2 text-xs text-danger"
              role="alert"
              aria-live="polite"
            >
              {startQuoteError}
            </p>
          ) : null}

          <div className="pt-4 border-t border-border w-full max-w-[200px]">
            <Link
              href={lead.newQuoteHref}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-foreground-subtle hover:text-foreground transition-colors"
            >
              Full quote builder
              <ArrowUpRight className="w-3 h-3" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* When the container provided pre-loaded active-quote readiness — or the
   * lazy loader has resolved one — render QuoteWorkSurface(standard) so the
   * embedded quote work is identical to what the user gets on the Quote full
   * page or in the Workstation drawer. Additional non-active quotes render
   * as the simple cards beneath.
   *
   * While the lazy loader is in flight we don't yet know the active quote
   * id, so we use the most-recent linked quote as the *presumed* active id
   * to keep the additional-cards layout stable across loading/loaded. The
   * leads list serializer filters archived first, so `linkedQuotes[0]` is
   * the same row `getLeadCommercialProgress` picks. */
  const presumedActiveId =
    activeQuoteWorkSurface?.quote.id ?? linkedQuotes[0]?.id ?? null;
  const additionalQuotes = presumedActiveId
    ? linkedQuotes.filter((q) => q.id !== presumedActiveId)
    : linkedQuotes;
  const fallbackHref = linkedQuotes[0]?.href;

  return (
    <div className="space-y-4">
      {activeQuoteWorkSurface ? (
        <QuoteWorkSurface
          mode="standard"
          quote={activeQuoteWorkSurface.quote}
          readiness={activeQuoteWorkSurface.readiness}
          workspaceTabs={activeQuoteWorkSurface.workspaceTabs}
          onWorkSurfaceMutated={onActiveQuoteMutated}
          embeddedInLead
          onRequestServiceAddress={onRequestServiceAddress}
        />
      ) : isLoadingActiveQuote ? (
        <div
          className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-foreground-subtle"
          role="status"
          aria-live="polite"
        >
          Loading quote…
        </div>
      ) : activeQuoteError ? (
        <div
          className="rounded-xl border border-border bg-surface px-4 py-3"
          role="alert"
          aria-live="polite"
        >
          <p className="text-xs font-medium text-foreground">
            Couldn&apos;t load quote details.
          </p>
          <p className="mt-1 text-[0.7rem] text-foreground-subtle">
            {activeQuoteError}
          </p>
          {fallbackHref ? (
            <Link
              href={fallbackHref}
              className="mt-2 inline-flex items-center gap-1 text-xs text-foreground-subtle underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Open full quote page
              <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
            </Link>
          ) : null}
        </div>
      ) : null}

      {additionalQuotes.map((q) => (
        <div
          key={q.id}
          className="rounded-xl border border-border bg-surface overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
            <StatusBadge label={q.statusLabel} tone={q.statusTone} />
          </div>
          <div className="px-4 py-3 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-foreground tabular-nums">
              {formatMoney(q.totalCents)}
            </span>
            <span className="text-xs text-foreground-subtle">
              · {q.lineItemCount}{" "}
              {q.lineItemCount === 1 ? "line item" : "line items"}
            </span>
            {q.updatedAtLabel && (
              <span className="text-xs text-foreground-subtle">
                · Updated {q.updatedAtLabel}
              </span>
            )}
          </div>

          {/* Full mode shows per-quote action buttons when status hints are passed
              (matches today's full lead page). All modes show the "Open full quote
              page" link to preserve today's behavior. */}
          {isFull && (q.isDraft || q.isApproved) ? (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              {q.isDraft && (
                <Link href={q.href} className={primaryBtnClass}>
                  Continue quote
                  <ArrowRight className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
                </Link>
              )}
              {q.isApproved && q.executionReviewHref && (
                <Link href={q.executionReviewHref} className={primaryBtnClass}>
                  Open execution review
                  <ArrowUpRight className="w-3.5 h-3.5 opacity-70" strokeWidth={1.5} />
                </Link>
              )}
              <Link href={q.href} className={secondaryBtnClass}>
                Open full quote page
                <ArrowUpRight className="w-3 h-3 ml-1" strokeWidth={1.5} />
              </Link>
            </div>
          ) : (
            <div className="px-4 pb-3">
              <Link
                href={q.href}
                className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Open full quote page
                <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
              </Link>
            </div>
          )}
        </div>
      ))}

      <div className="pt-1">
        <Link
          href={lead.newQuoteHref}
          className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Start additional quote
          <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}

/* ─── Main export ──────────────────────────────────────────────────────── */

export type LeadWorkSurfaceHandle = {
  /** Imperatively trigger the "Start Quote" flow (same as the next-step card). */
  startQuote: () => Promise<void>;
};

export const LeadWorkSurface = forwardRef<LeadWorkSurfaceHandle, LeadWorkSurfaceProps>(
  function LeadWorkSurface(
    {
      mode,
      lead,
      linkedQuotes,
      customersForLink,
      matchHints,
      updateStatusAction,
      linkLeadAction,
      initialTab = "overview",
      activeQuoteWorkSurface,
      loadActiveQuoteWorkSurface,
      serviceAddressContext,
      loadServiceAddressContext,
      onQuoteStarted,
    },
    ref,
  ) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<LeadWorkSurfaceTab>(initialTab);
    const serviceAddressBlockRef = useRef<LeadServiceAddressBlockHandle | null>(null);

    const requestRef = useRef<HTMLDivElement>(null);
    const contactRef = useRef<HTMLDivElement>(null);
    const quoteRef = useRef<HTMLDivElement>(null);
    const activityRef = useRef<HTMLDivElement>(null);

    const scrollToSection = useCallback(
      (section: "request" | "contact" | "quote" | "activity") => {
        const refs = {
          request: requestRef,
          contact: contactRef,
          quote: quoteRef,
          activity: activityRef,
        };
        refs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      [],
    );

    /* When the embedded Quote tab routes the user back to the Customer Info
     * service-address block, we both switch tabs and ask the block to scroll
     * itself into view + flash a brief emphasis. The flag is consumed by the
     * post-tab-switch effect below so the focus call runs after the Contact
     * tab has actually rendered. */
    const [pendingServiceAddressFocus, setPendingServiceAddressFocus] = useState(false);

    useEffect(() => {
      if (!pendingServiceAddressFocus) return;
      if (activeTab !== "contact") return;
      /* Defer to the next tick so the ContactTab has mounted the block ref. */
      const t = window.setTimeout(() => {
        serviceAddressBlockRef.current?.focus();
        setPendingServiceAddressFocus(false);
      }, 30);
      return () => window.clearTimeout(t);
    }, [pendingServiceAddressFocus, activeTab]);

    const handleRequestServiceAddressFromQuote = useCallback(() => {
      if (mode === "compact") {
        setActiveTab("contact");
      } else {
        scrollToSection("contact");
      }
      setPendingServiceAddressFocus(true);
    }, [mode, scrollToSection]);
    const [postCreateActiveQuote, setPostCreateActiveQuote] =
      useState<LeadWorkSurfaceActiveQuotePayload | null>(null);
    const [isStartQuotePending, setIsStartQuotePending] = useState(false);
    const [startQuoteError, setStartQuoteError] = useState<string | null>(null);
    const [showGraduationPopup, setShowGraduationPopup] = useState(false);

    const isCompact = mode === "compact";
    const isFull = mode === "full";

    /* Lazy load active-quote payload when:
     *   - parent did NOT preload it (activeQuoteWorkSurface === undefined)
     *   - a loader was provided
     *   - the lead has at least one linked quote
     *   - the user has opened the Quote tab at least once in this surface
     *
     * The state is hoisted here so switching tabs back to Quote does not
     * refetch. The whole surface remounts (via key={lead.id} on the popup
     * container) when the user opens a different lead, which resets this state.
     *
     * Also re-callable after a workspace-safe quote mutation so the Lead
     * Quote tab can refresh embedded quote scope/readiness without forcing
     * the user to re-open the lead. Older responses are dropped via
     * `loadIdRef` so they cannot overwrite newer state.
     */
    const [activeQuoteState, setActiveQuoteState] = useState<ActiveQuoteLazyState>({
      kind: "idle",
    });
    const loadIdRef = useRef(0);

    const parentProvidedActiveQuote = activeQuoteWorkSurface !== undefined;
    const previousLeadIdRef = useRef<string | null>(null);

    /* Intake→quote graduation: reset post-create state only when the open sales
     * intake identity changes, not when the surface remounts after router.refresh(). */
    useEffect(() => {
      const previousId = previousLeadIdRef.current;
      previousLeadIdRef.current = lead.id;
      if (previousId === null || previousId === lead.id) return;
      void Promise.resolve().then(() => {
        setPostCreateActiveQuote(null);
        setStartQuoteError(null);
        setShowGraduationPopup(false);
      });
    }, [lead.id]);

    useEffect(() => {
      if (!activeQuoteWorkSurface) return;
      void Promise.resolve().then(() => {
        setPostCreateActiveQuote(null);
      });
    }, [activeQuoteWorkSurface]);

    const refreshAfterGraduation = useCallback(() => {
      router.refresh();
    }, [router]);

    const handleDismissGraduation = useCallback(() => {
      setShowGraduationPopup(false);
      refreshAfterGraduation();
    }, [refreshAfterGraduation]);

    const handleStartQuote = useCallback(async () => {
      setStartQuoteError(null);
      setIsStartQuotePending(true);
      try {
        const res = await createQuoteFromLeadWorkspaceAction(lead.id);
        if (!res.success) {
          setStartQuoteError(res.error);
          return;
        }
        const loaded = await loadLeadActiveQuoteWorkSurfaceAction(lead.id);
        const activeQuotePayload = loaded.ok ? loaded.payload : null;
        if (activeQuotePayload) {
          setPostCreateActiveQuote(activeQuotePayload);
        }

        setActiveTab("quote");
        onQuoteStarted?.({ quoteId: res.quoteId, activeQuotePayload });

        const suppressed =
          typeof window !== "undefined" &&
          localStorage.getItem("suppress-graduation-popup") === "true";
        if (suppressed) {
          refreshAfterGraduation();
          return;
        }

        setShowGraduationPopup(true);
      } finally {
        setIsStartQuotePending(false);
      }
    }, [lead.id, onQuoteStarted, refreshAfterGraduation]);

    useImperativeHandle(ref, () => ({
      startQuote: handleStartQuote,
    }));

    const runActiveQuoteLoad = useCallback(
    (showSpinner: boolean) => {
      if (parentProvidedActiveQuote) return;
      if (!loadActiveQuoteWorkSurface) return;
      if (linkedQuotes.length === 0) return;

      loadIdRef.current += 1;
      const myId = loadIdRef.current;
      if (showSpinner) {
        /* Defer the loading-spinner setState so it does not run
         * synchronously inside the calling effect (React 19 rule). */
        void Promise.resolve().then(() => {
          if (myId !== loadIdRef.current) return;
          setActiveQuoteState({ kind: "loading" });
        });
      }
      void loadActiveQuoteWorkSurface()
        .then((res) => {
          if (myId !== loadIdRef.current) return;
          if (res.ok) {
            setActiveQuoteState({ kind: "loaded", payload: res.payload });
          } else {
            setActiveQuoteState({ kind: "error", message: res.error });
          }
        })
        .catch((err: unknown) => {
          if (myId !== loadIdRef.current) return;
          const message =
            err instanceof Error
              ? err.message
              : "Failed to load quote — try opening the full quote page.";
          setActiveQuoteState({ kind: "error", message });
        });
    },
    [parentProvidedActiveQuote, loadActiveQuoteWorkSurface, linkedQuotes.length],
  );

  useEffect(() => {
    if (activeTab !== "quote") return;
    runActiveQuoteLoad(true);
    return () => {
      /* Bumping the loader id ensures any in-flight request for this
       * mount/tab-open resolves into a no-op once we leave. */
      loadIdRef.current += 1;
    };
  }, [activeTab, runActiveQuoteLoad]);

  /* Called after a workspace-safe mutation (e.g. quote line item add/edit/
   * delete inside the embedded QuoteWorkSurface). Re-fetches the lazy
   * payload (if applicable) and `router.refresh()`s for the SSR-rendered
   * Lead full page case. */
  const handleActiveQuoteMutated = useCallback(() => {
    if (!parentProvidedActiveQuote) {
      runActiveQuoteLoad(false);
    }
    router.refresh();
  }, [parentProvidedActiveQuote, runActiveQuoteLoad, router]);

  /* Effective payload: explicit non-null parent payload wins; otherwise a
   * lazy-loaded quote payload when one is already in state; otherwise the
   * post–Start quote client fetch so promotion can render before the first
   * lazy fetch completes. When the parent passes explicit `null` (no quote
   * yet), that post-create payload still bridges until the lazy loader runs. */
  const effectiveActiveQuotePayload =
    activeQuoteWorkSurface != null
      ? activeQuoteWorkSurface
      : !parentProvidedActiveQuote && activeQuoteState.kind === "loaded"
        ? activeQuoteState.payload ?? postCreateActiveQuote
        : postCreateActiveQuote ?? null;

  const isLoadingActiveQuote =
    !parentProvidedActiveQuote && activeQuoteState.kind === "loading";
  const activeQuoteError =
    !parentProvidedActiveQuote && activeQuoteState.kind === "error"
      ? activeQuoteState.message
      : null;

  /* Mode-specific tab strip styling — popup uses bg-background container
     (sits inside bg-surface dialog/drawer); full page uses bg-surface
     container (sits on bg-background page). */
  const tabStripClass = isFull
    ? "mb-4 inline-flex rounded-lg bg-surface border border-border p-1 gap-0.5"
    : "mb-4 inline-flex rounded-lg bg-background p-1 gap-0.5";
  const activeTabClass = isFull
    ? "bg-background text-foreground shadow-sm"
    : "bg-surface text-foreground shadow-sm";
  const inactiveTabClass = "text-foreground-subtle hover:text-foreground";
  const tabPaddingClass = isCompact ? "px-3 py-1.5" : "px-4 py-1.5";

  if (isCompact || mode === "standard") {
    return (
      <div>
        <div className={tabStripClass}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={[
                `rounded-md ${tabPaddingClass} text-xs font-medium transition-colors`,
                activeTab === t.id ? activeTabClass : inactiveTabClass,
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <OverviewTab
            mode={mode}
            lead={lead}
            linkedQuotes={linkedQuotes}
            updateStatusAction={updateStatusAction}
            onSwitchToSection={(section) => setActiveTab(section === "quote" ? "quote" : "contact")}
          />
        )}
        {activeTab === "contact" && (
          <ContactTab
            ref={serviceAddressBlockRef}
            mode={mode}
            lead={lead}
            customersForLink={customersForLink}
            matchHints={matchHints}
            linkLeadAction={linkLeadAction}
            onRefresh={() => router.refresh()}
            serviceAddressContext={serviceAddressContext}
            loadServiceAddressContext={loadServiceAddressContext}
          />
        )}
        {activeTab === "quote" && (
          <QuoteTab
            mode={mode}
            lead={lead}
            linkedQuotes={linkedQuotes}
            activeQuoteWorkSurface={effectiveActiveQuotePayload}
            isLoadingActiveQuote={isLoadingActiveQuote}
            activeQuoteError={activeQuoteError}
            onSwitchToContact={() => setActiveTab("contact")}
            onActiveQuoteMutated={handleActiveQuoteMutated}
            isStartQuotePending={isStartQuotePending}
            startQuoteError={startQuoteError}
            onStartQuote={() => void handleStartQuote()}
            onRequestServiceAddress={handleRequestServiceAddressFromQuote}
          />
        )}
        {activeTab === "activity" && (
          <ActivityTab mode={mode} lead={lead} linkedQuotes={linkedQuotes} />
        )}

        {showGraduationPopup && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success mb-4">
                <Check className="size-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Intake Promoted!</h3>
              <p className="mt-2 text-sm text-foreground-muted leading-relaxed">
                This request has been promoted to a Quote. It will now be found in the <strong>Quotes</strong> tab of the Sales Hub.
              </p>
              <p className="mt-2 text-sm text-foreground-muted leading-relaxed">
                You can continue working on the quote right here.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleDismissGraduation}
                  className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast hover:opacity-90 transition-opacity"
                >
                  Got it
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem("suppress-graduation-popup", "true");
                    handleDismissGraduation();
                  }}
                  className="text-xs text-foreground-subtle hover:text-foreground transition-colors"
                >
                  Don&apos;t show this again
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
      {/* Main Column */}
      <div className="space-y-12">
        {/* Request Section */}
        <section ref={requestRef} className="scroll-mt-8">
          <OverviewTab
            mode={mode}
            lead={lead}
            linkedQuotes={linkedQuotes}
            updateStatusAction={updateStatusAction}
            onSwitchToSection={scrollToSection}
          />
        </section>

        {/* Customer & Address Section */}
        <section ref={contactRef} className="scroll-mt-8 space-y-4">
          <div className="flex items-center gap-2 px-1">
            <UserRound className="size-4 text-foreground-subtle" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Customer & Address
            </h2>
          </div>
          <ContactTab
            ref={serviceAddressBlockRef}
            mode={mode}
            lead={lead}
            customersForLink={customersForLink}
            matchHints={matchHints}
            linkLeadAction={linkLeadAction}
            onRefresh={() => router.refresh()}
            serviceAddressContext={serviceAddressContext}
            loadServiceAddressContext={loadServiceAddressContext}
          />
        </section>

        {/* Quote Section */}
        <section ref={quoteRef} className="scroll-mt-8 space-y-4">
          <div className="flex items-center gap-2 px-1">
            <ArrowRight className="size-4 text-foreground-subtle" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Quote
            </h2>
          </div>
          <QuoteTab
            mode={mode}
            lead={lead}
            linkedQuotes={linkedQuotes}
            activeQuoteWorkSurface={effectiveActiveQuotePayload}
            isLoadingActiveQuote={isLoadingActiveQuote}
            activeQuoteError={activeQuoteError}
            onSwitchToContact={() => scrollToSection("contact")}
            onActiveQuoteMutated={handleActiveQuoteMutated}
            isStartQuotePending={isStartQuotePending}
            startQuoteError={startQuoteError}
            onStartQuote={() => void handleStartQuote()}
            onRequestServiceAddress={handleRequestServiceAddressFromQuote}
          />
        </section>

        {/* Activity Section */}
        <section ref={activityRef} className="scroll-mt-8 space-y-4">
          <div className="flex items-center gap-2 px-1">
            <ChevronRight className="size-4 text-foreground-subtle" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Activity
            </h2>
          </div>
          <ActivityTab mode={mode} lead={lead} linkedQuotes={linkedQuotes} />
        </section>
      </div>

      {/* Right Rail (Sticky) */}
      <aside className="sticky top-8 space-y-6">
        <NextStepCard
          lead={lead}
          onSwitchToSection={scrollToSection}
        />

        {/* Quick section nav */}
        <nav className="rounded-xl border border-border bg-surface p-2 space-y-1">
          <button
            onClick={() => scrollToSection("request")}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-background rounded-lg transition-colors"
          >
            <span>Request</span>
            <ChevronRight className="size-3 opacity-50" />
          </button>
          <button
            onClick={() => scrollToSection("contact")}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-background rounded-lg transition-colors"
          >
            <span>Customer & Address</span>
            <ChevronRight className="size-3 opacity-50" />
          </button>
          <button
            onClick={() => scrollToSection("quote")}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-background rounded-lg transition-colors"
          >
            <span>Quote</span>
            <ChevronRight className="size-3 opacity-50" />
          </button>
          <button
            onClick={() => scrollToSection("activity")}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-background rounded-lg transition-colors"
          >
            <span>Activity</span>
            <ChevronRight className="size-3 opacity-50" />
          </button>
        </nav>
      </aside>

      {showGraduationPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success mb-4">
              <Check className="size-6" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Intake Promoted!</h3>
            <p className="mt-2 text-sm text-foreground-muted leading-relaxed">
              This request has been promoted to a Quote. It will now be found in the <strong>Quotes</strong> tab of the Sales Hub.
            </p>
            <p className="mt-2 text-sm text-foreground-muted leading-relaxed">
              You can continue working on the quote right here.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleDismissGraduation}
                className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast hover:opacity-90 transition-opacity"
              >
                Got it
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem("suppress-graduation-popup", "true");
                  handleDismissGraduation();
                }}
                className="text-xs text-foreground-subtle hover:text-foreground transition-colors"
              >
                Don&apos;t show this again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
