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
import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import {
  updateLeadContactWorkspaceAction,
  type WorkspaceFormState,
} from "@/app/(workspace)/leads/leads-workspace-actions";
import { LeadWorkspaceCustomerCreateInline } from "@/components/leads/lead-workspace-customer-create-inline";
import {
  LeadLinkCustomerForm,
  LeadLinkCustomerWorkspaceForm,
} from "@/components/leads/lead-link-customer-form";
import { LeadStatusForm } from "@/components/leads/lead-status-form";
import type { LeadFormState } from "@/app/(workspace)/leads/lead-form-actions";
import type { LeadCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import {
  resolveLeadCommercialProgressActionHref,
  type LeadCommercialProgressAction,
} from "@/lib/lead-commercial-progress";
import type { LeadStatus } from "@prisma/client";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";
import type { QuoteReadiness } from "@/lib/quote-readiness";

/**
 * Pre-loaded QuoteWorkSurface payload for the active linked quote. When
 * provided, the Quote tab renders `<QuoteWorkSurface mode="standard" />` for
 * the active quote; falls back to today's simpler quote cards when absent.
 */
export type LeadWorkSurfaceActiveQuotePayload = {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
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

export type LeadWorkSurfaceProgressAction = {
  href: string;
  label: string;
  /** OPEN_DRAFT_QUOTE / OPEN_QUOTE / START_QUOTE → switch to Quote tab. */
  opensQuoteTab: boolean;
  /** ATTACH_OR_CREATE_CUSTOMER / EDIT_CONTACT_INFO → switch to Contact tab. */
  opensContactTab: boolean;
};

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
  sourceLabel: string;
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
   * Pre-loaded active-quote QuoteWorkSurface payload — when provided
   * (including explicit `null` to mean "no active quote"), the surface uses
   * it directly and does NOT call `loadActiveQuoteWorkSurface`.
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
};

/* ─── Helpers exported for container serialization ─────────────────────── */

/**
 * Helper for server containers to convert a `LeadCommercialProgressAction`
 * into the serialized shape this surface expects (href + tab-switch flags).
 */
export function serializeLeadProgressAction(
  action: LeadCommercialProgressAction | null,
  ctx: { leadId: string },
): LeadWorkSurfaceProgressAction | null {
  if (!action) return null;
  const href = resolveLeadCommercialProgressActionHref(action, ctx);
  const opensQuoteTab =
    action.kind === "OPEN_DRAFT_QUOTE" ||
    action.kind === "OPEN_QUOTE" ||
    action.kind === "START_QUOTE";
  const opensContactTab =
    action.kind === "ATTACH_OR_CREATE_CUSTOMER" ||
    action.kind === "EDIT_CONTACT_INFO";
  return { href, label: action.label, opensQuoteTab, opensContactTab };
}

/* ─── Shared classnames ─────────────────────────────────────────────────── */

const TABS: { id: LeadWorkSurfaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contact", label: "Contact" },
  { id: "activity", label: "Activity" },
  { id: "quote", label: "Quote" },
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
  onSwitchToQuote,
  onSwitchToContact,
}: {
  lead: LeadWorkSurfaceData;
  onSwitchToQuote: () => void;
  onSwitchToContact: () => void;
}) {
  const { progressPrimaryAction: primary, progressSecondaryAction: secondary } = lead;

  function renderAction(
    action: LeadWorkSurfaceProgressAction,
    variant: "primary" | "secondary",
  ) {
    const cls = variant === "primary" ? primaryBtnClass : secondaryBtnClass;

    if (action.opensQuoteTab) {
      return (
        <button type="button" onClick={onSwitchToQuote} className={cls}>
          {action.label}
          {variant === "primary" && (
            <ArrowRight className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
          )}
        </button>
      );
    }
    if (action.opensContactTab) {
      return (
        <button type="button" onClick={onSwitchToContact} className={cls}>
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
    <div className="rounded-xl border border-border bg-background p-5">
      <p className={sectionLabelClass}>Next step</p>
      <h3 className="mt-1.5 text-base font-semibold text-foreground leading-snug">
        {lead.progressLabel}
      </h3>
      <p className="mt-1 text-sm text-foreground-muted leading-relaxed">
        {lead.progressDescription}
      </p>

      {lead.activeJobId && (
        <div className="mt-3 rounded-lg border border-border bg-surface px-3 py-2.5 flex items-center justify-between gap-3">
          <div>
            <p className={sectionLabelClass}>Linked job</p>
            <p className="mt-0.5 text-sm font-medium text-foreground capitalize">
              {lead.activeJobStatus
                ? lead.activeJobStatus.charAt(0).toUpperCase() +
                  lead.activeJobStatus.slice(1).toLowerCase()
                : "Active"}
            </p>
          </div>
          <p className="text-xs text-foreground-subtle">
            Opening the job page is the next step.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
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
  onSwitchToQuote,
  onSwitchToContact,
}: {
  mode: LeadWorkSurfaceMode;
  lead: LeadWorkSurfaceData;
  linkedQuotes: LeadWorkSurfaceQuote[];
  updateStatusAction?: LeadWorkSurfaceProps["updateStatusAction"];
  onSwitchToQuote: () => void;
  onSwitchToContact: () => void;
}) {
  const isFull = mode === "full";
  const quoteLabel =
    linkedQuotes.length > 0 ? linkedQuotes[0].statusLabel : "Not started";

  /* Full mode shows a "Received" tile (matches today's full page); other modes
     show the manual lead status badge (matches the popup). */
  return (
    <div className="space-y-4">
      <NextStepCard
        lead={lead}
        onSwitchToQuote={onSwitchToQuote}
        onSwitchToContact={onSwitchToContact}
      />

      {/* 4-field summary — same shape in all modes. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Customer</p>
          <p className="text-sm font-medium text-foreground truncate">
            {lead.customerDisplayName ?? "Not linked"}
          </p>
        </div>
        <button
          type="button"
          onClick={onSwitchToQuote}
          className="rounded-lg border border-border bg-surface p-3 text-left hover:bg-background transition-colors"
        >
          <p className={`${sectionLabelClass} mb-0.5`}>Quote</p>
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

      {/* Active quote summary (full mode only). */}
      {isFull && lead.activeQuoteId && lead.activeQuoteTitle && (
        <Link
          href={`/quotes/${lead.activeQuoteId}`}
          className="block rounded-xl border border-border bg-surface overflow-hidden hover:border-border-strong transition-colors"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className={sectionLabelClass}>Active quote</p>
            {lead.activeQuoteTone && lead.activeQuoteStatusLabel && (
              <StatusBadge
                label={lead.activeQuoteStatusLabel}
                tone={lead.activeQuoteTone}
              />
            )}
          </div>
          <div className="px-4 py-3 flex items-baseline gap-2">
            <p className="text-sm font-medium text-foreground truncate flex-1">
              {lead.activeQuoteTitle}
            </p>
          </div>
          <div className="px-4 pb-3 flex items-baseline gap-2">
            {lead.activeQuoteTotalCents != null && (
              <span className="text-lg font-semibold text-foreground tabular-nums">
                {formatMoney(lead.activeQuoteTotalCents)}
              </span>
            )}
            {lead.activeQuoteLineItemCount != null && (
              <span className="text-xs text-foreground-subtle">
                · {lead.activeQuoteLineItemCount}{" "}
                {lead.activeQuoteLineItemCount === 1 ? "line item" : "line items"}
              </span>
            )}
            {lead.showsRevisionDrift && (
              <span className="ml-2 rounded-md border border-border-strong bg-foreground/[0.04] px-2 py-0.5 text-[0.7rem] font-medium text-foreground">
                Edits since last send
              </span>
            )}
          </div>
          <div className="px-4 pb-3">
            <span className="inline-flex items-center gap-1 text-xs text-foreground-subtle">
              Open quote page
              <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
            </span>
          </div>
        </Link>
      )}

      {/* Active job summary (full mode only). */}
      {isFull && lead.activeJobId && (
        <Link
          href={`/jobs/${lead.activeJobId}`}
          className="block rounded-xl border border-border bg-surface px-4 py-3 hover:border-border-strong transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={sectionLabelClass}>Active job</p>
              <p className="mt-0.5 text-sm font-medium text-foreground capitalize">
                {lead.activeJobStatus
                  ? lead.activeJobStatus.charAt(0).toUpperCase() +
                    lead.activeJobStatus.slice(1).toLowerCase()
                  : "Active"}
              </p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-foreground-subtle" strokeWidth={1.5} />
          </div>
        </Link>
      )}

      {/* Notes — popup keeps this simple; full mode also shows sourceDetail. */}
      {(lead.notes || (isFull && lead.sourceDetail)) && (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <p className={sectionLabelClass}>
            {isFull ? "Intake notes" : "Request notes"}
          </p>
          {isFull && lead.sourceDetail && (
            <div>
              <p className={`${sectionLabelClass} mb-0.5`}>Source detail</p>
              <p className="text-sm text-foreground-muted">{lead.sourceDetail}</p>
            </div>
          )}
          {lead.notes && (
            <div>
              {isFull ? (
                <>
                  <p className={`${sectionLabelClass} mb-0.5`}>Notes</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground-muted">
                    {lead.notes}
                  </p>
                </>
              ) : (
                <p className="text-sm text-foreground-muted leading-relaxed">
                  {lead.notes}
                </p>
              )}
            </div>
          )}
        </div>
      )}

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

function ContactTab({
  mode,
  lead,
  customersForLink,
  matchHints,
  linkLeadAction,
  onRefresh,
}: {
  mode: LeadWorkSurfaceMode;
  lead: LeadWorkSurfaceData;
  customersForLink?: { id: string; displayName: string }[];
  matchHints?: LeadCustomerMatchHints;
  linkLeadAction?: LeadWorkSurfaceProps["linkLeadAction"];
  onRefresh: () => void;
}) {
  const isFull = mode === "full";
  /* Auto-expand the edit form when the lead has no contact info. Lazy initial
     state so it's set once per surface mount. */
  const [isEditingContact, setIsEditingContact] = useState(
    () => lead.progressState === "ADD_CONTACT_INFO",
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
      <div className="rounded-xl border border-border bg-surface p-4">
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
              <p className="text-sm text-foreground-muted">
                {lead.contactName ?? "Not provided"}
              </p>
            </div>
            <div>
              <p className={`${sectionLabelClass} mb-0.5`}>Email</p>
              {lead.email ? (
                <a
                  href={`mailto:${lead.email}`}
                  className="text-sm text-foreground-muted hover:text-foreground transition-colors break-all"
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
                  className="text-sm text-foreground-muted hover:text-foreground transition-colors"
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
            <div>
              <p className={sectionLabelClass}>Customer</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {lead.customerDisplayName}
              </p>
              <StatusBadge label="Linked" tone="approved" />
            </div>
            <div className="flex flex-col items-end gap-2">
              {lead.customerHref && (
                <Link href={lead.customerHref} className={mutedLinkClass}>
                  Customer record
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

          {/* Create from lead — workspace-safe, used in every mode. */}
          <LeadWorkspaceCustomerCreateInline
            lead={{
              id: lead.id,
              title: lead.title,
              contactName: lead.contactName,
              email: lead.email,
              phone: lead.phone,
              notes: lead.notes,
            }}
            editLeadHref={lead.editHref}
            onSuccess={onRefresh}
          />

          {/* Link existing — full mode uses the redirecting form when caller wires it
               (matches today's full page); compact/standard fall back to the
               workspace-safe form so Workstation/popup keep behavior unchanged. */}
          {customersForLink && customersForLink.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                  <span className="text-xs font-medium text-foreground-muted hover:text-foreground transition-colors">
                    Link existing customer
                  </span>
                </summary>
                <div className="mt-4 border-t border-border pt-4">
                  <p className={`${sectionLabelClass} mb-3`}>Select customer to link</p>
                  {isFull && linkLeadAction ? (
                    <LeadLinkCustomerForm
                      linkFormAction={linkLeadAction}
                      customers={customersForLink}
                    />
                  ) : (
                    <LeadLinkCustomerWorkspaceForm
                      leadId={lead.id}
                      customers={customersForLink}
                      onSuccess={onRefresh}
                    />
                  )}
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
}: {
  mode: LeadWorkSurfaceMode;
  lead: LeadWorkSurfaceData;
  linkedQuotes: LeadWorkSurfaceQuote[];
  activeQuoteWorkSurface?: LeadWorkSurfaceActiveQuotePayload | null;
  isLoadingActiveQuote: boolean;
  activeQuoteError: string | null;
  onSwitchToContact: () => void;
}) {
  const isFull = mode === "full";

  if (linkedQuotes.length === 0) {
    const canStart = lead.customerId != null;
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">No quote started</p>
          <p className="text-xs text-foreground-subtle max-w-xs leading-relaxed">
            {canStart
              ? isFull
                ? "Open the quote builder to create a quote for this lead."
                : "Open the quote builder to create a quote for this lead. You can return to this workspace afterward."
              : "Link a customer first so the quote is tied to a billing record."}
          </p>
          {canStart ? (
            <Link href={lead.newQuoteHref} className={primaryBtnClass}>
              Open quote builder
              <ArrowUpRight className="w-3.5 h-3.5 opacity-70" strokeWidth={1.5} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onSwitchToContact}
              className="text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Go to Contact tab to link or create a customer
            </button>
          )}
        </div>

        {!canStart && (
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-foreground-muted leading-relaxed">
            You can also start a quote without {isFull ? "a" : "linking a"} customer
            {isFull ? "" : " by opening the full quote builder"}.{" "}
            <Link
              href={lead.newQuoteHref}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Open quote builder anyway
            </Link>
          </div>
        )}
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

export function LeadWorkSurface({
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
}: LeadWorkSurfaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LeadWorkSurfaceTab>(initialTab);
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
   */
  const [activeQuoteState, setActiveQuoteState] = useState<ActiveQuoteLazyState>({
    kind: "idle",
  });

  const parentProvidedActiveQuote = activeQuoteWorkSurface !== undefined;

  useEffect(() => {
    if (activeTab !== "quote") return;
    if (parentProvidedActiveQuote) return;
    if (!loadActiveQuoteWorkSurface) return;
    if (linkedQuotes.length === 0) return;

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setActiveQuoteState({ kind: "loading" });
    });
    void loadActiveQuoteWorkSurface()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setActiveQuoteState({ kind: "loaded", payload: res.payload });
        } else {
          setActiveQuoteState({ kind: "error", message: res.error });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load quote — try opening the full quote page.";
        setActiveQuoteState({ kind: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    parentProvidedActiveQuote,
    loadActiveQuoteWorkSurface,
    linkedQuotes.length,
  ]);

  /* Effective payload: parent value (incl. explicit null) wins; otherwise
   * fall back to whatever the lazy loader produced. */
  const effectiveActiveQuotePayload = parentProvidedActiveQuote
    ? activeQuoteWorkSurface
    : activeQuoteState.kind === "loaded"
      ? activeQuoteState.payload
      : null;

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
          onSwitchToQuote={() => setActiveTab("quote")}
          onSwitchToContact={() => setActiveTab("contact")}
        />
      )}
      {activeTab === "contact" && (
        <ContactTab
          mode={mode}
          lead={lead}
          customersForLink={customersForLink}
          matchHints={matchHints}
          linkLeadAction={linkLeadAction}
          onRefresh={() => router.refresh()}
        />
      )}
      {activeTab === "activity" && (
        <ActivityTab mode={mode} lead={lead} linkedQuotes={linkedQuotes} />
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
        />
      )}
    </div>
  );
}
