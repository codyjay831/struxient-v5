"use client";

/**
 * QuoteWorkSurface — the canonical Quote workspace body, regardless of container.
 *
 * Same quote, same work surface. Different container, same behavior.
 *
 * Modes change density / surrounding context, never core actions.
 *
 *   compact   — Workstation drawer
 *   standard  — Quotes list popup, Lead Quote tab embed
 *   full      — Quote full page (`/quotes/[quoteId]`) — the entire workspace body
 *
 * The surface owns the same five tabs the full Quote page used to render
 * separately:
 *   - Overview        — readiness + facts + linked context (drives next step)
 *   - Scope           — line items (full editor in full+DRAFT; read-only otherwise)
 *   - Customer & Opportunity — customer card + intake context
 *   - Send & Accept   — inline Send/Approve + checkpoint history + preview link
 *   - Record          — archive/restore + internal notes + record details
 *
 * Actions that the surface can satisfy in-place switch tabs internally:
 *   - ADD_LINE_ITEM / ADD_FROM_SCOPE_LIBRARY / CONTINUE_EDITING → Scope tab
 *   - RESTORE_TO_DRAFT                 → Record tab
 *   - SEND_QUOTE / MARK_APPROVED       → inline workspace-safe forms (no nav)
 *
 * Full-page-only escapes (kept as `<Link>` in every mode):
 *   - OPEN_PROPOSAL_PREVIEW (dedicated preview route)
 *   - OPEN_EXECUTION_REVIEW / ACTIVATE_JOB (execution review page)
 *   - OPEN_JOB (job page)
 *
 * Workspace-safe mutations (every mode — actions return structured state
 * instead of `redirect()`, so popup/drawer/lead-tab containers stay open):
 *   - line item add / edit / delete (`QuoteLineItemsWorkspaceEditor` in
 *     `standard`/`compact`; `QuoteDraftWorkspaceControls` in `full` — the
 *     full-page editor's redirecting form actions are a no-op when the user
 *     is already on `/quotes/[id]`).
 *   - line item execution planning (`QuoteLineDraftExecutionSummary` editing —
 *     workspace-safe in every mode; full-page integration drives
 *     `revalidatePath` to match the previous redirect-and-rerender behavior).
 *   - apply Scope Library template (`SavedLineItemPickerDialog` — workspace-
 *     safe in every mode; full-page integration drives `router.refresh()` to
 *     match the previous redirect-and-rerender behavior).
 *   - send / approve checkpoint (`SendQuoteInlineButton` / `ApproveQuoteInlineButton`).
 *
 * Full-mode-only embedded mutations (still redirect to self):
 *   - archive / restore (`QuoteDraftArchivePanel` / `QuoteArchivedRestorePanel`)
 *   - draft details form / copy intake-into-notes
 *
 * After every workspace-safe mutation, the surface calls `router.refresh()`
 * (always) and the optional `onWorkSurfaceMutated` prop (when supplied by
 * a popup/drawer/lead-tab container that lazy-loaded its
 * `QuoteWorkSurfaceData` payload via `loadQuoteWorkSurfaceAction`).
 */
import { useCallback, useEffect, useRef, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  Layers,
  Library,
  ListOrdered,
  MapPin,
  MessageSquare,
  Send,
  ThumbsUp,
  UserRound,
  Wrench,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import {
  approveQuoteWorkspaceAction,
  revokeQuoteShareTokenAction,
  extendQuoteShareTokenAction,
  type QuoteWorkspaceActionState,
} from "@/app/(workspace)/workstation/quote-workspace-actions";
import { activateQuoteJobWorkspaceAction } from "@/app/(workspace)/quotes/quote-job-activation-actions";
import {
  resolveQuoteReadinessActionHref,
  type QuoteReadiness,
  type QuoteReadinessAction,
  type QuoteReadinessActionKind,
} from "@/lib/quote-readiness";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";
import { AddOrEditServiceLocationDialog } from "@/components/customers/add-or-edit-service-location-dialog";
import type {
  QuoteWorkspaceCheckpointPayload,
  QuoteWorkspaceTabData,
} from "@/lib/quote-workspace-payload";
import {
  QuoteAuthoringSurface,
  ArchivedQuoteReadOnlyNotice,
} from "@/components/quotes/quote-authoring-surface";
import { QuoteSendPanel } from "@/components/quotes/quote-send-panel";
import {
  QuoteArchivedRestorePanel,
  QuoteDraftArchivePanel,
} from "@/components/quotes/quote-archive-controls";
import {
  QuoteLineDraftExecutionSummary,
  QuoteLineItemScanBlock,
  QuoteLiveProposalPreviewLineBlock,
} from "@/components/quotes/quote-line-item-display";
import { QuotePaymentScheduleEditor } from "@/components/quotes/quote-payment-schedule-editor";
import { formatMoneyCents } from "@/lib/quote-display";
import { buildQuoteExecutionReviewPreviewModel } from "@/lib/quote-execution-review-preview-model";

/* ─── Public types ─────────────────────────────────────────────────────── */

export type QuoteWorkSurfaceTab =
  | "overview"
  | "scope"
  | "payments"
  | "context"
  | "sendaccept"
  | "record";

export type QuoteWorkSurfaceProps = {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  workspaceTabs: QuoteWorkspaceTabData;
  /**
   * Suppress the internal identity row when the container
   * chrome already prints the quote's status/title/customer/lead (e.g. the
   * Quotes list popup chrome). Default `false` preserves the embedded Lead
   * Quote tab UX, where the surrounding Lead container shows lead identity
   * and the quote needs its own.
   */
  suppressIdentityRow?: boolean;
  /** Initial active tab. Defaults to "overview". */
  initialTab?: QuoteWorkSurfaceTab;
  /**
   * Called after a workspace-safe mutation (line item add/edit/delete,
   * inline send/approve) so the container can re-fetch its lazy-loaded
   * QuoteWorkSurfaceData payload. Required for popup/drawer/lead-tab
   * containers that load via `loadQuoteWorkSurfaceAction`. Server-rendered
   * full-page and Workstation containers can omit this — `revalidatePath`
   * + `router.refresh()` already covers them — but providing it is
   * always safe.
   */
  onWorkSurfaceMutated?: () => void;
  /**
   * When true, the surface is rendered inside the Lead workspace Quote tab.
   * Lets the surface defer service-address ownership to the surrounding
   * Lead Customer Info area: the missing-address CTA routes back to the
   * Lead block instead of opening a quote-owned dialog, and the present-
   * address callout is suppressed (the Lead shell already shows it).
   *
   * Optional + defaults to `false` so Workstation / standalone Quote page
   * usage is unchanged.
   */
  embeddedInLead?: boolean;
  /**
   * Required when `embeddedInLead` is true — handler invoked by the
   * embedded missing-address CTA so the Lead workspace can switch to the
   * Customer Info tab and scroll the Service address block into view.
   */
  onRequestServiceAddress?: () => void;
};

/* ─── Constants ────────────────────────────────────────────────────────── */

const TABS: { id: QuoteWorkSurfaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "scope", label: "Scope" },
  { id: "payments", label: "Payments" },
  { id: "context", label: "Customer & Intake" },
  { id: "sendaccept", label: "Send & Accept" },
  { id: "record", label: "Record" },
];

const workspaceActionInitial: QuoteWorkspaceActionState = {};

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

const primaryBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground";

const mutedFooterLinkClass =
  "inline-flex items-center gap-1 text-xs text-foreground-subtle underline underline-offset-2 transition-colors hover:text-foreground";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

/** Action kinds the surface satisfies internally by switching tabs. */
const TAB_BOUND_ACTIONS: Record<
  QuoteReadinessActionKind,
  QuoteWorkSurfaceTab | null
> = {
  ADD_LINE_ITEM: "scope",
  ADD_FROM_SCOPE_LIBRARY: "scope",
  CONTINUE_EDITING: "scope",
  RESTORE_TO_DRAFT: "record",
  SEND_QUOTE: null,
  MARK_APPROVED: null,
  OPEN_PROPOSAL_PREVIEW: "sendaccept",
  OPEN_EXECUTION_REVIEW: "sendaccept",
  ACTIVATE_JOB: null,
  OPEN_JOB: null,
};

const ACTION_ICON: Record<QuoteReadinessAction["kind"], typeof Send> = {
  SEND_QUOTE: Send,
  MARK_APPROVED: ThumbsUp,
  OPEN_EXECUTION_REVIEW: Wrench,
  ACTIVATE_JOB: Briefcase,
  OPEN_JOB: Briefcase,
  ADD_LINE_ITEM: FileText,
  ADD_FROM_SCOPE_LIBRARY: Library,
  CONTINUE_EDITING: FileText,
  OPEN_PROPOSAL_PREVIEW: ArrowRight,
  RESTORE_TO_DRAFT: ArrowRight,
};

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

function formatMoneyCompact(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

/** External-link label suffix for actions that always navigate away. Internal
 *  tab-bound actions never get a suffix because the user stays on the surface. */
function externalActionLabel(
  action: QuoteReadinessAction,
): string {
  switch (action.kind) {
    case "OPEN_JOB":
      return `${action.label} — opens job`;
    case "ACTIVATE_JOB":
      return `${action.label} — opens quote`;
    default:
      return action.label;
  }
}

/* ─── Embedded Previews (Send & Accept tab) ────────────────────────────── */

function QuoteProposalPreviewEmbedded({
  quote,
  workspaceTabs,
}: {
  quote: QuoteWorkSurfaceData;
  workspaceTabs: QuoteWorkspaceTabData;
}) {
  const { lineItems, customerDocumentTitle } = workspaceTabs;
  return (
    <div className="space-y-6 rounded-xl border border-border bg-background p-6 shadow-sm">
      <div className="border-b border-border pb-4">
        <h3 className="text-lg font-semibold text-foreground">
          {customerDocumentTitle ?? quote.title}
        </h3>
        <p className="mt-1 text-xs text-foreground-subtle">
          Internal proposal preview · {quote.totalCents > 0 ? formatMoney(quote.totalCents) : "No total"}
        </p>
      </div>

      {lineItems.length === 0 ? (
        <p className="py-4 text-center text-sm text-foreground-muted">
          No line items on this quote yet.
        </p>
      ) : (
        <ul className="space-y-8">
          {lineItems.map((line) => (
            <li key={line.id}>
              <QuoteLiveProposalPreviewLineBlock
                line={{
                  id: line.id,
                  sortOrder: line.sortOrder,
                  presentationGroup: line.customerPresentationGroup,
                  lineTitle: line.customerScopeTitle ?? line.description,
                  lineDetail: line.customerScopeDescription,
                  includedNotes: line.customerIncludedNotes,
                  excludedNotes: line.customerExcludedNotes,
                  quantityDisplay: line.quantityDisplay,
                  unitAmountCents: line.unitAmountCents,
                  lineTotalCents: line.lineTotalCents,
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border pt-4">
        <p className={sectionLabelClass}>Internal note</p>
        <p className="mt-1 text-[0.65rem] leading-relaxed text-foreground-subtle">
          This is an internal preview of the customer proposal. We&apos;ll email the customer a secure link they can review, sign, and download. E-sign vendor (DocuSign / Adobe Sign) integration is optional and not enabled.
        </p>
      </div>
    </div>
  );
}

function QuoteExecutionPreviewEmbedded({
  quote,
  workspaceTabs,
}: {
  quote: QuoteWorkSurfaceData;
  workspaceTabs: QuoteWorkspaceTabData;
}) {
  const { lineItems, draftTasksByLineId } = workspaceTabs;

  const model = buildQuoteExecutionReviewPreviewModel({
    id: quote.id,
    title: quote.title,
    status: quote.status,
    lines: lineItems.map((l) => ({
      id: l.id,
      description: l.description,
      sortOrder: l.sortOrder,
      tasks: (draftTasksByLineId[l.id] ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        stageId: t.stageId,
        category: t.category,
        providesSignals: t.providesSignals,
        requiresSignals: t.requiresSignals,
        hardSignal: t.hardSignal,
        sortOrder: t.sortOrder,
      })),
    })),
  });

  const { summary, handshakes, orphans, lineReadiness } = model;

  if (summary.totalTasks === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center">
        <p className="text-sm text-foreground-muted">
          No planned tasks have been added to this quote yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
        <SectionHeading
          title="Task dependencies preview"
          description="How tasks unlock each other once the job is created."
        />
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <dt className={sectionLabelClass}>Lines</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">{summary.totalLines}</dd>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <dt className={sectionLabelClass}>Tasks</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">{summary.totalTasks}</dd>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <dt className={sectionLabelClass}>Dependencies</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">{handshakes.length}</dd>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <dt className={sectionLabelClass}>Dependency gaps</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">
              {summary.orphanCount}
              {summary.hardOrphanCount > 0 ? (
                <span className="ml-1 text-xs text-danger">
                  ({summary.hardOrphanCount} required)
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>

      {handshakes.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <SectionHeading
            title="Connected dependencies"
            description="Dependencies that already have an upstream task in this quote."
          />
          <ul className="mt-4 space-y-2">
            {handshakes.map((h, idx) => (
              <li
                key={`${h.signal}-${h.providerTaskId}-${h.consumerTaskId}-${idx}`}
                className="rounded-md border border-border/80 bg-surface/50 px-3 py-2"
              >
                <p className="text-[0.65rem] font-mono font-bold uppercase tracking-wider text-accent">
                  {h.signal}
                </p>
                <p className="mt-1 text-sm text-foreground">
                  <span className="font-medium">{h.providerTaskTitle}</span>
                  <span className="mx-1 text-foreground-subtle">→</span>
                  <span className="font-medium">{h.consumerTaskTitle}</span>
                </p>
                <p className="mt-0.5 text-[0.65rem] text-foreground-muted">
                  {h.providerLineDescription} → {h.consumerLineDescription}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {orphans.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <SectionHeading
            title="Dependency gaps"
            description="Dependencies with no upstream task yet. Auto-resolved gaps are handled at job creation; required gaps block job creation."
          />
          <ul className="mt-4 space-y-2">
            {orphans.map((o, idx) => (
              <li
                key={`${o.signal}-${o.consumerTaskId}-${idx}`}
                className="rounded-md border border-border/80 bg-surface/50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <p className="text-[0.65rem] font-mono font-bold uppercase tracking-wider text-accent">
                    {o.signal}
                  </p>
                  {o.isHard ? (
                    <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-danger">
                      Required
                    </span>
                  ) : (
                    <span className="rounded bg-foreground/[0.05] px-1.5 py-0.5 text-[0.55rem] font-medium uppercase tracking-wider text-foreground-subtle">
                      Auto-resolved
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-foreground">
                  Required by <span className="font-medium">{o.consumerTaskTitle}</span>
                </p>
                <p className="mt-0.5 text-[0.65rem] text-foreground-muted">
                  {o.consumerLineDescription}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lineReadiness.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <SectionHeading
            title="Per-line readiness"
            description="Task outputs and dependencies for each quote line."
          />
          <ul className="mt-4 space-y-3">
            {lineReadiness.map((l) => (
              <li
                key={l.lineId}
                className="rounded-md border border-border/80 bg-surface/50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Layers className="size-3.5 text-foreground-subtle" aria-hidden />
                  <p className="text-sm font-medium text-foreground">{l.description}</p>
                  <span className="ml-auto text-[0.65rem] text-foreground-subtle">
                    {l.taskCount} {l.taskCount === 1 ? "task" : "tasks"}
                  </span>
                </div>
                {(l.providesSignals.length > 0 || l.requiresSignals.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {l.providesSignals.map((s) => (
                      <span
                        key={`p-${s}`}
                        className="rounded bg-accent/10 px-1.5 py-0.5 text-[0.55rem] font-mono font-bold text-accent"
                        title="Outputs"
                      >
                        ↑ {s}
                      </span>
                    ))}
                    {l.requiresSignals.map((s) => (
                      <span
                        key={`r-${s}`}
                        className="rounded bg-foreground/[0.05] px-1.5 py-0.5 text-[0.55rem] font-mono font-bold text-foreground-muted"
                        title="Dependencies"
                      >
                        ↓ {s}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─── Inline send / approve buttons (workspace-safe, every mode) ───────── */

function ApproveQuoteInlineButton({
  quoteId,
  variant,
  label,
  onMutated,
}: {
  quoteId: string;
  variant: "primary" | "secondary";
  label: string;
  onMutated?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    approveQuoteWorkspaceAction.bind(null, quoteId),
    workspaceActionInitial,
  );
  const handledKeyRef = useRef<unknown>(null);

  useEffect(() => {
    if (state.success && handledKeyRef.current !== state) {
      handledKeyRef.current = state;
      onMutated?.();
    }
  }, [state, onMutated]);

  const cls = variant === "primary" ? primaryBtnClass : secondaryBtnClass;

  return (
    <form action={formAction} className="contents">
      <button type="submit" disabled={isPending} aria-busy={isPending} className={cls}>
        <ThumbsUp className="size-3.5 opacity-80" strokeWidth={2} />
        {isPending ? "Recording…" : label}
      </button>
      {state.error ? (
        <p
          className="basis-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function RevokeTokenButton({
  quoteId,
  onMutated,
}: {
  quoteId: string;
  onMutated?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    revokeQuoteShareTokenAction.bind(null, quoteId),
    workspaceActionInitial,
  );
  const handledKeyRef = useRef<unknown>(null);

  useEffect(() => {
    if (state.success && handledKeyRef.current !== state) {
      handledKeyRef.current = state;
      onMutated?.();
    }
  }, [state, onMutated]);

  return (
    <form action={formAction} className="contents">
      <button type="submit" disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[10px] font-medium text-foreground-muted transition-opacity hover:opacity-80 disabled:opacity-50">
        {isPending ? "Revoking…" : "Revoke"}
      </button>
      {state.error ? (
        <p className="basis-full text-[10px] text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function ExtendTokenButton({
  quoteId,
  onMutated,
}: {
  quoteId: string;
  onMutated?: () => void;
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [state, formAction, isPending] = useActionState(
    extendQuoteShareTokenAction.bind(null, quoteId),
    workspaceActionInitial,
  );
  const handledKeyRef = useRef<unknown>(null);

  useEffect(() => {
    if (state.success && handledKeyRef.current !== state) {
      handledKeyRef.current = state;
      setShowDialog(false);
      onMutated?.();
    }
  }, [state, onMutated]);

  if (showDialog) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
          <h3 className="text-base font-bold text-foreground mb-4">
            Extend / Rotate Token
          </h3>
          <form action={formAction} className="space-y-4">
            <div>
              <label htmlFor="expiresInDays" className="block text-xs font-medium text-foreground-subtle mb-1.5">
                New expiry
              </label>
              <select
                id="expiresInDays"
                name="expiresInDays"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                defaultValue="30"
              >
                <option value="7">In 7 days</option>
                <option value="14">In 14 days</option>
                <option value="30">In 30 days (recommended)</option>
                <option value="never">Never</option>
              </select>
            </div>
            
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="rotateToken"
                name="rotateToken"
                value="true"
                className="mt-0.5"
              />
              <label htmlFor="rotateToken" className="text-xs text-foreground-muted">
                Generate a new link and email it to the customer (old link will stop working)
              </label>
            </div>

            {state.error ? (
              <p className="text-xs text-danger" role="alert">
                {state.error}
              </p>
            ) : null}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDialog(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowDialog(true)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[10px] font-medium text-foreground-muted transition-opacity hover:opacity-80"
    >
      Extend / Rotate
    </button>
  );
}

/* ─── Action renderer (tab-bound actions stay on the surface) ──────────── */

function renderAction({
  action,
  variant,
  quote,
  onSwitchToTab,
  onRequestAddLineItem,
  onRequestScopeLibraryPicker,
  onMutated,
}: {
  action: QuoteReadinessAction | null;
  variant: "primary" | "secondary";
  quote: QuoteWorkSurfaceData;
  onSwitchToTab: (tab: QuoteWorkSurfaceTab, preview?: "none" | "proposal" | "execution" | "send") => void;
  onRequestAddLineItem: () => void;
  onRequestScopeLibraryPicker: () => void;
  onMutated?: () => void;
}) {
  if (!action) return null;

  if (action.kind === "SEND_QUOTE") {
    return (
      <button
        type="button"
        onClick={() => onSwitchToTab("sendaccept", "send")}
        className={variant === "primary" ? primaryBtnClass : secondaryBtnClass}
      >
        <Send className="size-3.5 opacity-80" strokeWidth={2} />
        {action.label}
      </button>
    );
  }
  if (action.kind === "MARK_APPROVED") {
    return (
      <ApproveQuoteInlineButton
        quoteId={quote.id}
        variant={variant}
        label={action.label}
        onMutated={onMutated}
      />
    );
  }

  const targetTab = TAB_BOUND_ACTIONS[action.kind];
  const cls = variant === "primary" ? primaryBtnClass : secondaryBtnClass;
  const Icon = ACTION_ICON[action.kind] ?? ArrowRight;

  if (targetTab) {
    return (
      <button
        type="button"
        onClick={() => {
          const preview =
            action.kind === "OPEN_PROPOSAL_PREVIEW"
              ? "proposal"
              : action.kind === "OPEN_EXECUTION_REVIEW"
                ? "execution"
                : "none";
          onSwitchToTab(targetTab, preview);
          if (action.kind === "ADD_LINE_ITEM") {
            onRequestAddLineItem();
          }
          if (action.kind === "ADD_FROM_SCOPE_LIBRARY") {
            onRequestScopeLibraryPicker();
          }
        }}
        className={cls}
      >
        <Icon className="size-3.5 opacity-80" strokeWidth={2} />
        {action.label}
      </button>
    );
  }

  /* External link — preview / execution review / activate / open job. */
  const href = resolveQuoteReadinessActionHref(action, { quoteId: quote.id });
  return (
    <Link href={href} className={cls}>
      <Icon className="size-3.5 opacity-80" strokeWidth={2} />
      {externalActionLabel(action)}
      {variant === "primary" ? (
        <ArrowUpRight className="size-3.5 opacity-70" strokeWidth={1.5} />
      ) : null}
    </Link>
  );
}

/* ─── Identity row (standard mode only) ────────────────────────────────── */

function StandardIdentityRow({ quote }: { quote: QuoteWorkSurfaceData }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusBadge label={quote.statusLabel} tone={quote.statusTone} />
          <span className="truncate text-xs text-foreground-subtle">
            Commercial quote
            {quote.createdAtLabel ? ` · ${quote.createdAtLabel}` : ""}
          </span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-foreground">
          {quote.subtitle ?? quote.title}
        </p>
      </div>
      <p className="shrink-0 text-base font-semibold tabular-nums text-foreground">
        {formatMoneyCompact(quote.totalCents)}
      </p>
    </div>
  );
}

/* ─── Tab: Overview ────────────────────────────────────────────────────── */

function NextStepCard({
  quote,
  readiness,
  onSwitchToTab,
  onRequestAddLineItem,
  onRequestScopeLibraryPicker,
  onMutated,
}: {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  onSwitchToTab: (tab: QuoteWorkSurfaceTab, preview?: "none" | "proposal" | "execution" | "send") => void;
  onRequestAddLineItem: () => void;
  onRequestScopeLibraryPicker: () => void;
  onMutated?: () => void;
}) {
  const { primaryAction, secondaryAction, label, description, showsRevisionDrift } =
    readiness;

  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <p className={sectionLabelClass}>Next step</p>
      <h3 className="mt-1.5 text-base font-semibold leading-snug text-foreground">
        {label}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
        {description}
      </p>

      {showsRevisionDrift ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-foreground/[0.04] px-2 py-1 text-[0.7rem] font-medium text-foreground">
          <CheckCircle2 className="size-3.5 opacity-70" strokeWidth={2} />
          Quote edited since last commercial proof
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {renderAction({
          action: primaryAction,
          variant: "primary",
          quote,
          onSwitchToTab,
          onRequestAddLineItem,
          onRequestScopeLibraryPicker,
          onMutated,
        })}
        {renderAction({
          action: secondaryAction,
          variant: "secondary",
          quote,
          onSwitchToTab,
          onRequestAddLineItem,
          onRequestScopeLibraryPicker,
          onMutated,
        })}
      </div>
    </div>
  );
}

function QuoteJobsiteCallout({
  quote,
  onMutated,
  embeddedInLead = false,
  onRequestServiceAddress,
}: {
  quote: QuoteWorkSurfaceData;
  onMutated?: () => void;
  embeddedInLead?: boolean;
  onRequestServiceAddress?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const hasLine = Boolean(quote.jobsiteAddressLine?.trim());

  /* When the Quote is embedded inside the Lead workspace AND the Lead
   * shell already shows the address prominently, suppress the present-
   * address card here. The Lead Customer Info block owns it. */
  if (embeddedInLead && hasLine) {
    return null;
  }

  /* Embedded missing-address: route the user back to the Lead Customer Info
   * service-address block instead of opening a quote-owned dialog. The
   * primary CTA copy makes ownership obvious. */
  if (embeddedInLead && !hasLine && onRequestServiceAddress) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex gap-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className={sectionLabelClass}>Jobsite address needed</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
              Add the project address before scheduling or creating a job.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRequestServiceAddress}
                className={primaryBtnClass}
              >
                Add jobsite address in Customer Info
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex gap-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className={sectionLabelClass}>
              {hasLine ? "Jobsite address" : "Jobsite address needed"}
            </p>
            {hasLine ? (
              <p className="mt-1 text-sm leading-relaxed text-foreground">{quote.jobsiteAddressLine}</p>
            ) : (
              <>
                <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
                  Add the project address before scheduling or creating a job.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {quote.canAddServiceAddress && quote.customerId ? (
                    <button type="button" onClick={() => setOpen(true)} className={primaryBtnClass}>
                      Add jobsite address
                    </button>
                  ) : null}
                  {quote.leadHref && !quote.canAddServiceAddress ? (
                    <Link href={`${quote.leadHref}/edit`} className={primaryBtnClass}>
                      Add on request
                    </Link>
                  ) : null}
                  {quote.leadHref && quote.canAddServiceAddress ? (
                    <Link href={`${quote.leadHref}/edit`} className={secondaryBtnClass}>
                      Edit request record
                    </Link>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {quote.customerId && quote.canAddServiceAddress ? (
        <AddOrEditServiceLocationDialog
          open={open}
          onOpenChange={setOpen}
          googleMapsApiKey={apiKey}
          customerId={quote.customerId}
          mode="create"
          onSaved={onMutated}
        />
      ) : null}
    </>
  );
}

function FactsGrid({
  quote,
  readiness,
  onSwitchToTab,
}: {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  onSwitchToTab: (tab: QuoteWorkSurfaceTab, preview?: "none" | "proposal" | "execution" | "send") => void;
}) {
  const { signals } = readiness;
  const leadLabel = quote.leadTitle ?? "—";

  return (
    <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4">
      <button
        type="button"
        onClick={() => onSwitchToTab("scope")}
        className="rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:bg-background"
      >
        <p className={`${sectionLabelClass} mb-0.5`}>Lines</p>
        <p className="text-sm font-medium text-foreground">{signals.lineItemCount}</p>
        <p className="mt-0.5 text-[0.7rem] text-foreground-subtle">
          {formatMoney(quote.totalCents)}
        </p>
      </button>
      <button
        type="button"
        onClick={() => onSwitchToTab("context")}
        className="rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:bg-background"
      >
        <p className={`${sectionLabelClass} mb-0.5`}>Customer</p>
        <p className="truncate text-sm font-medium text-foreground">
          {quote.customerDisplayName ?? "Not linked"}
        </p>
      </button>
      <button
        type="button"
        onClick={() => onSwitchToTab("context")}
        className="rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:bg-background group"
      >
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className={sectionLabelClass}>Intake</p>
          {quote.leadId && (
            <ArrowUpRight className="size-3 text-foreground-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
        <p className="truncate text-sm font-medium text-foreground">{leadLabel}</p>
      </button>
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className={`${sectionLabelClass} mb-0.5`}>Job</p>
        {quote.activatedJobId ? (
          <Link
            href={`/jobs/${quote.activatedJobId}`}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline capitalize"
          >
            {quote.activatedJobStatus
              ? `${quote.activatedJobStatus.charAt(0).toUpperCase()}${quote.activatedJobStatus.slice(1).toLowerCase()}`
              : "Active"}
          </Link>
        ) : (
          <p className="text-sm text-foreground-muted">Not activated</p>
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  quote,
  readiness,
  workspaceTabs,
  onSwitchToTab,
  onRequestAddLineItem,
  onRequestScopeLibraryPicker,
  onMutated,
  embeddedInLead,
  onRequestServiceAddress,
}: {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  workspaceTabs: QuoteWorkspaceTabData;
  onSwitchToTab: (tab: QuoteWorkSurfaceTab, preview?: "none" | "proposal" | "execution" | "send") => void;
  onRequestAddLineItem: () => void;
  onRequestScopeLibraryPicker: () => void;
  onMutated?: () => void;
  embeddedInLead?: boolean;
  onRequestServiceAddress?: () => void;
}) {
  const canSendFromOverview = readiness.primaryAction?.kind === "SEND_QUOTE";

  return (
    <div className="space-y-4">
      <NextStepCard
        quote={quote}
        readiness={readiness}
        onSwitchToTab={onSwitchToTab}
        onRequestAddLineItem={onRequestAddLineItem}
        onRequestScopeLibraryPicker={onRequestScopeLibraryPicker}
        onMutated={onMutated}
      />

      {canSendFromOverview ? (
        <div className="rounded-xl border border-border border-l-[3px] border-l-accent bg-surface p-4">
          <p className={sectionLabelClass}>Ready to send</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
            This quote is ready for customers. Open the send panel to choose recipients and deliver the proposal.
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onSwitchToTab("sendaccept", "send")}
              className={primaryBtnClass}
            >
              <Send className="size-3.5 opacity-80" strokeWidth={2} />
              Send quote
            </button>
          </div>
        </div>
      ) : null}

      <FactsGrid
        quote={quote}
        readiness={readiness}
        onSwitchToTab={onSwitchToTab}
      />

      <QuoteJobsiteCallout
        quote={quote}
        onMutated={onMutated}
        embeddedInLead={embeddedInLead}
        onRequestServiceAddress={onRequestServiceAddress}
      />

      {/* Active job link — visible on Overview when activated. */}
      {quote.activatedJobId ? (
        <Link
          href={`/jobs/${quote.activatedJobId}`}
          className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong"
        >
          <div>
            <p className={sectionLabelClass}>Active job</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              Job activated from this quote
            </p>
          </div>
          <ArrowUpRight className="size-4 text-foreground-subtle" strokeWidth={1.5} />
        </Link>
      ) : null}

      {/* Revision-drift hint (also surfaces from NextStepCard but kept here so
          the Overview tab is self-contained when scrolled). */}
      {readiness.showsRevisionDrift ? (
        <div className="rounded-xl border border-border bg-foreground/[0.02] px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            Quote revised since last send
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">
            The quote record has been updated after the most recent send checkpoint.
            The customer may not have seen the latest scope and pricing.
          </p>
        </div>
      ) : null}

      {/* Record details disclosure — handy on Overview, full content lives on Record tab. */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
              aria-hidden
            />
            <span className={sectionLabelClass}>Record details</span>
            <span className="ml-auto text-[0.65rem] text-foreground-subtle">
              Created {workspaceTabs.createdAtLabel}
            </span>
          </summary>
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className={sectionLabelClass}>Created</dt>
                <dd className="mt-0.5 text-foreground-muted">
                  {workspaceTabs.createdAtLabel}
                </dd>
              </div>
              <div>
                <dt className={sectionLabelClass}>Updated</dt>
                <dd className="mt-0.5 text-foreground-muted">
                  {workspaceTabs.updatedAtLabel}
                </dd>
              </div>
            </dl>
            <div>
              <p className={sectionLabelClass}>Record ID</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground-muted">
                {quote.id}
              </p>
            </div>
          </div>
        </details>
      </div>

      {/* Footer escape hatch — only when not on full page. */}
      <div className="pt-1 @[1000px]:hidden">
        <Link href={quote.quoteHref} className={mutedFooterLinkClass}>
          Open full quote page
          <ArrowUpRight className="size-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}

/* ─── Tab: Scope ───────────────────────────────────────────────────────── */

function ScopeTab({
  quote,
  workspaceTabs,
  onSwitchToTab,
  shouldFocusAddForm,
  onAddFormFocusConsumed,
  shouldOpenScopeLibraryPicker,
  onScopeLibraryPickerOpenConsumed,
  onMutated,
}: {
  quote: QuoteWorkSurfaceData;
  workspaceTabs: QuoteWorkspaceTabData;
  onSwitchToTab: (tab: QuoteWorkSurfaceTab, preview?: "none" | "proposal" | "execution" | "send") => void;
  shouldFocusAddForm: boolean;
  onAddFormFocusConsumed: () => void;
  shouldOpenScopeLibraryPicker: boolean;
  onScopeLibraryPickerOpenConsumed: () => void;
  onMutated?: () => void;
}) {
  const {
    isCommercialEditable,
    isExecutionEditable,
    isArchived,
    customerDocumentTitle,
    internalNotes,
    hasLeadNotes,
    subtotalCents,
    totalCents,
    lineItems,
    lineItemTemplates,
    draftTasksByLineId,
    reusableTaskOptions,
    stages,
  } = workspaceTabs;
  const lineCount = lineItems.length;

  /* DRAFT — unified authoring surface. */
  if (isCommercialEditable) {
    return (
      <QuoteAuthoringSurface
        quoteId={quote.id}
        quoteHref={quote.quoteHref}
        initialTitle={quote.title}
        initialInternalNotes={internalNotes}
        initialCustomerDocumentTitle={customerDocumentTitle}
        lead={workspaceTabs.lead}
        lineItems={lineItems}
        subtotalCents={subtotalCents}
        totalCents={totalCents}
        lineItemTemplates={lineItemTemplates}
        draftTasksByLineId={draftTasksByLineId}
        reusableTaskOptions={reusableTaskOptions}
        stages={stages}
        shouldFocusAddForm={shouldFocusAddForm}
        onAddOpenConsumed={onAddFormFocusConsumed}
        shouldOpenScopeLibraryPicker={shouldOpenScopeLibraryPicker}
        onScopeLibraryPickerOpenConsumed={onScopeLibraryPickerOpenConsumed}
        onMutated={onMutated ?? (() => {})}
      />
    );
  }

  /* non-DRAFT — read-only line list with execution-edit summaries. */
  return (
    <div className="space-y-4">
      <WorkspacePanel
        id="line-items"
        className="border-border-strong shadow-md ring-1 ring-ring/30"
      >
        <SectionHeading
          title="Line items"
          description={
            isArchived
              ? "Read-only scope rows as stored when archived. Restore to draft to edit."
              : "Commercial scope and pricing are read-only after send. Internal draft execution can still be edited from each line."
          }
        />
        <div className="mb-5 grid gap-3 grid-cols-2 @lg:grid-cols-3">
          <SignalCard
            label="Subtotal"
            value={formatMoneyCents(subtotalCents)}
            hint={isArchived ? "Stored rollup." : "Sum of line totals."}
          />
          <SignalCard
            label="Total"
            value={formatMoneyCents(totalCents)}
            hint="Same as subtotal for now."
          />
          <SignalCard
            label="Lines"
            value={String(lineCount)}
            hint="Persisted rows."
          />
        </div>
        {lineCount === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="No line items"
            description={
              isArchived
                ? "No scope rows were captured before archive. Restore to draft to add line items."
                : "No scope rows on this quote."
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {lineItems.map((line) => (
              <li key={line.id} className="px-3 py-3 @lg:px-4 @lg:py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <QuoteLineItemScanBlock line={line} />
                    <QuoteLineDraftExecutionSummary
                      quoteId={quote.id}
                      line={line}
                      isExecutionEditable={isExecutionEditable}
                      draftTasks={draftTasksByLineId[line.id] ?? []}
                      reusableOptions={reusableTaskOptions}
                      stages={stages}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </WorkspacePanel>

      <div className="pt-1 @[1000px]:hidden">
        <Link
          href={`${quote.quoteHref}#line-items`}
          className={mutedFooterLinkClass}
        >
          {isArchived
            ? "Restore on full quote page to edit lines"
            : "Open lines on full quote page"}
          <ArrowUpRight className="size-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}

/* ─── Tab: Payments ──────────────────────────────────────────────────────── */

function PaymentsTab({
  quote,
  workspaceTabs,
}: {
  quote: QuoteWorkSurfaceData;
  workspaceTabs: QuoteWorkspaceTabData;
}) {
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Payment Schedule"
        description="Define milestones and deposits. Tying milestones to stages creates execution gates."
      />

      <QuotePaymentScheduleEditor
        quoteId={quote.id}
        quoteTotalCents={quote.totalCents}
        items={workspaceTabs.paymentSchedule}
        stages={workspaceTabs.stages}
      />
    </div>
  );
}

/* ─── Tab: Customer & Opportunity ─────────────────────────────────────────────── */

function ContextTab({
  quote,
  workspaceTabs,
  onMutated,
  embeddedInLead,
  onRequestServiceAddress,
}: {
  quote: QuoteWorkSurfaceData;
  workspaceTabs: QuoteWorkspaceTabData;
  onMutated?: () => void;
  embeddedInLead?: boolean;
  onRequestServiceAddress?: () => void;
}) {
  const { customerName, customerHref, lead } = workspaceTabs;
  const contactName = lead?.contactName;
  const isResidentialDuplication =
    customerName && contactName && customerName.trim().toLowerCase() === contactName.trim().toLowerCase();

  return (
    <div className="space-y-4">
      <QuoteJobsiteCallout
        quote={quote}
        onMutated={onMutated}
        embeddedInLead={embeddedInLead}
        onRequestServiceAddress={onRequestServiceAddress}
      />

      {/* Customer */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className={`${sectionLabelClass} mb-2`}>Customer</p>
        {customerName && customerHref ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className={sectionLabelClass}>Linked customer</p>
                {isResidentialDuplication && (
                  <span className="rounded bg-foreground/[0.05] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-foreground-subtle">
                    Residential Match
                  </span>
                )}
              </div>
              {!isResidentialDuplication && (
                <p className="mt-1 truncate text-sm font-medium text-foreground">
                  {customerName}
                </p>
              )}
              {(quote.customerEmail || quote.customerFormattedPhone) && (
                <dl className="mt-2 space-y-1 text-xs text-foreground-muted">
                  {quote.customerEmail ? (
                    <div>
                      <dt className={sectionLabelClass}>Email</dt>
                      <dd className="mt-0.5">
                        <a
                          href={`mailto:${encodeURIComponent(quote.customerEmail)}`}
                          className="break-all underline-offset-4 hover:underline"
                        >
                          {quote.customerEmail}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {quote.customerFormattedPhone ? (
                    <div>
                      <dt className={sectionLabelClass}>Phone</dt>
                      <dd className="mt-0.5">
                        <a
                          href={`tel:${(quote.customerPhone ?? "").replace(/\s/g, "")}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {quote.customerFormattedPhone}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              )}
            </div>
            <Link href={customerHref} className={listLinkClass}>
              Customer record
              <ArrowUpRight className="size-3 ml-1" strokeWidth={1.5} />
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-6 text-center">
            <UserRound
              className="mx-auto mb-3 size-8 text-foreground-subtle opacity-70"
              strokeWidth={1.25}
              aria-hidden
            />
            <p className="text-sm text-foreground-muted">
              No customer linked to this quote.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground-subtle max-w-xs mx-auto">
              Linking is optional. When set, it connects this quote to a billing
              record for your team.
            </p>
            <Link href="/customers" className={`mt-3 ${listLinkClass}`}>
              Customers
            </Link>
          </div>
        )}
      </div>

      {/* Opportunity */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className={`${sectionLabelClass} mb-2`}>Opportunity</p>
        {lead ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
              <div className="min-w-0">
                <p className={sectionLabelClass}>Linked opportunity</p>
                <p className="mt-1 truncate text-sm font-medium text-foreground">
                  {lead.title}
                </p>
              </div>
              <Link href={lead.href} className={listLinkClass}>
                Opportunity record
                <ArrowUpRight className="size-3 ml-1" strokeWidth={1.5} />
              </Link>
            </div>

            {/* Intake context */}
            <div className="rounded-lg border border-border bg-foreground/[0.01] px-4 py-4">
              <p className={`${sectionLabelClass} mb-3`}>Intake context</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  {lead.source ? (
                    <div>
                      <p className={sectionLabelClass}>Source</p>
                      <p className="mt-0.5 text-sm text-foreground">
                        {lead.source}
                      </p>
                    </div>
                  ) : null}
                  {lead.contactName ||
                  lead.email ||
                  lead.phone ? (
                    <div>
                      <p className={sectionLabelClass}>Contact</p>
                      <div className="mt-0.5 space-y-0.5 text-sm">
                        {lead.contactName ? (
                          <p className="text-foreground">
                            {lead.contactName}
                          </p>
                        ) : null}
                        {lead.email ? (
                          <p className="text-foreground-muted break-all">
                            {lead.email}
                          </p>
                        ) : null}
                        {lead.phone ? (
                          <p className="text-foreground-muted">
                            {lead.phone}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div>
                  <p className={sectionLabelClass}>Intake notes</p>
                  <div className="mt-1">
                    {lead.notes ? (
                      <div className="rounded border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-foreground">
                        {lead.notes}
                      </div>
                    ) : (
                      <p className="text-sm italic text-foreground-muted">
                        No intake notes provided.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-5 text-center">
            <p className="text-sm text-foreground-muted">
              No opportunity linked to this quote.
            </p>
            <p className="mt-1 text-xs text-foreground-subtle">
              Linking is optional. Use it when this quote comes from a tracked
              opportunity.
            </p>
            <Link href="/leads" className={`mt-3 ${listLinkClass}`}>
              Sales pipeline
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Send & Accept ───────────────────────────────────────────────── */

function CheckpointList({
  checkpoints,
  emptyText,
}: {
  checkpoints: QuoteWorkspaceCheckpointPayload[];
  emptyText: string;
}) {
  if (checkpoints.length === 0) {
    return <p className="text-xs text-foreground-muted">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2 text-xs text-foreground-muted">
      {checkpoints.map((cp) => (
        <li
          key={cp.id}
          className="flex flex-wrap items-baseline justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <span>
              #{cp.sequence} ·{" "}
              <time dateTime={cp.createdAtIso}>{cp.createdAtLabel}</time>
            </span>
            {cp.source === "CUSTOMER_PORTAL" && (
              <span className="rounded bg-accent/10 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-accent">
                Customer portal
              </span>
            )}
          </div>
          <Link href={cp.href} className={listLinkClass}>
            Open record
            <ArrowUpRight className="size-3 ml-1" strokeWidth={1.5} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Workspace-safe activate button shown only when the quote is approved AND
 * the surface is embedded inside a Lead workspace. Calls the same activation
 * transaction as the full-page form, but stays in the Lead workspace and
 * shows an in-place success card with an Open job link.
 *
 * The full-page execution-review activation form continues to redirect — this
 * button is additive, not a replacement.
 */
function EmbeddedActivateJobButton({
  quoteId,
  onMutated,
}: {
  quoteId: string;
  onMutated?: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activatedJobId, setActivatedJobId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleActivate = useCallback(async () => {
    setError(null);
    setIsPending(true);
    try {
      const res = await activateQuoteJobWorkspaceAction(quoteId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setActivatedJobId(res.jobId);
      setShowConfirm(false);
      onMutated?.();
    } finally {
      setIsPending(false);
    }
  }, [quoteId, onMutated]);

  if (activatedJobId) {
    return (
      <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-3">
        <p className="text-xs font-medium text-foreground">Job activated</p>
        <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
          Tasks are ready to schedule.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={`/jobs/${activatedJobId}`}
            className={primaryBtnClass}
          >
            <Briefcase className="size-3.5" strokeWidth={1.5} />
            Open job
          </Link>
        </div>
      </div>
    );
  }

  if (showConfirm) {
    return (
      <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-4">
        <p className="text-xs font-bold text-foreground">Create job from this approved quote?</p>
        <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
          This will create an active job using the approved quote and reviewed work plan.
          Planned tasks and readiness checks will be copied into the job for your team to manage.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleActivate()}
            disabled={isPending}
            className={primaryBtnClass}
          >
            {isPending ? "Creating…" : "Create Job"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={isPending}
            className={secondaryBtnClass}
          >
            Cancel
          </button>
        </div>
        {error ? (
          <p
            className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-danger"
            role="alert"
            aria-live="polite"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-3 py-3">
      <p className="text-xs font-medium text-foreground">Create job</p>
      <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
        Create a job from this approved quote to start managing work.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className={primaryBtnClass}
        >
          <Briefcase className="size-3.5" strokeWidth={1.5} />
          Create job
        </button>
      </div>
    </div>
  );
}

function SendAcceptTab({
  quote,
  readiness,
  workspaceTabs,
  activePreview,
  onPreviewChange,
  onMutated,
  embeddedInLead,
}: {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  workspaceTabs: QuoteWorkspaceTabData;
  activePreview: "none" | "proposal" | "execution" | "send";
  onPreviewChange: (preview: "none" | "proposal" | "execution" | "send") => void;
  onMutated?: () => void;
  embeddedInLead?: boolean;
}) {
  const { isArchived, sendCheckpoints, approvalCheckpoints } = workspaceTabs;
  const [lastSendSummary, setLastSendSummary] = useState<{
    recipientCount: number;
    recipientEmails: string[];
    expiresInDays: string;
    shareUrl: string;
  } | null>(null);

  const canSend = readiness.primaryAction?.kind === "SEND_QUOTE";
  const canApprove = readiness.primaryAction?.kind === "MARK_APPROVED";
  const isApproved = quote.status === "APPROVED";
  const latestSend = sendCheckpoints[sendCheckpoints.length - 1] ?? null;
  const latestApproval =
    approvalCheckpoints[approvalCheckpoints.length - 1] ?? null;

  if (activePreview === "send") {
    return (
      <QuoteSendPanel
        quoteId={quote.id}
        initialRecipients={
          quote.customerEmail
            ? [{ email: quote.customerEmail, name: quote.customerDisplayName ?? undefined }]
            : []
        }
        organizationDisplayName={quote.organizationDisplayName}
        shareUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/q/${quote.shareToken}`}
        onSuccess={(summary) => {
          setLastSendSummary(summary);
          onPreviewChange("none");
          onMutated?.();
        }}
        onCancel={() => onPreviewChange("none")}
      />
    );
  }

  if (activePreview === "proposal") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPreviewChange("none")}
            className="text-xs font-medium text-foreground-subtle hover:text-foreground"
          >
            ← Back to Send & Accept
          </button>
          <Link
            href={quote.proposalPreviewHref}
            className="inline-flex items-center gap-1 text-[10px] text-foreground-subtle underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Open full proposal preview
            <ArrowUpRight className="size-2.5" strokeWidth={1.5} />
          </Link>
        </div>
        <QuoteProposalPreviewEmbedded quote={quote} workspaceTabs={workspaceTabs} />
      </div>
    );
  }

  if (activePreview === "execution") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPreviewChange("none")}
            className="text-xs font-medium text-foreground-subtle hover:text-foreground"
          >
            ← Back to Send & Accept
          </button>
          <Link
            href={quote.executionReviewHref}
            className="inline-flex items-center gap-1 text-[10px] text-foreground-subtle underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Open full quote page for advanced review
            <ArrowUpRight className="size-2.5" strokeWidth={1.5} />
          </Link>
        </div>
        <QuoteExecutionPreviewEmbedded quote={quote} workspaceTabs={workspaceTabs} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lastSendSummary ? (
        <div className="rounded-lg border border-success/35 bg-success/[0.08] px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-success">
            Quote sent
          </p>
          <p className="mt-1 text-sm text-foreground">
            Sent to {lastSendSummary.recipientCount} recipient
            {lastSendSummary.recipientCount === 1 ? "" : "s"}.
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            {lastSendSummary.recipientEmails.join(", ")}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Link expiry:{" "}
            {lastSendSummary.expiresInDays === "never"
              ? "Never"
              : `${lastSendSummary.expiresInDays} days`}
          </p>
          <p className="mt-1 text-xs text-foreground-muted truncate">
            Share link: {lastSendSummary.shareUrl}
          </p>
        </div>
      ) : null}

      {/* Inline action panel — workspace-safe in every mode. */}
      <div className="rounded-xl border border-border border-l-[3px] border-l-accent bg-surface p-4">
        <p className={`${sectionLabelClass} mb-1`}>Commercial send & acceptance</p>
        <p className="mb-4 text-xs leading-relaxed text-foreground-muted">
          Internal records only — not email, not a customer portal, and not job
          activation. Send captures the proposal as sent; approval captures
          commercial acceptance.
        </p>

        {!isArchived && canSend ? (
          <div className="mb-4 rounded-lg border border-dashed border-border bg-foreground/[0.02] px-3 py-3">
            <p className="text-xs font-medium text-foreground">Send this quote</p>
            <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
              When you are ready to treat this proposal as sent to the customer,
              use Send to customer. Commercial fields stay editable only while Draft —
              after send, scope and pricing lock.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onPreviewChange("send")}
                className={primaryBtnClass}
              >
                <Send className="size-3.5 opacity-80" strokeWidth={2} />
                Send to customer
              </button>
            </div>
          </div>
        ) : null}

        {quote.shareToken && (
          <div className="mb-4 rounded-lg border border-border bg-background px-3 py-3 shadow-sm">
            <p className={sectionLabelClass}>Public proposal link</p>
            <p className="mt-1 text-xs text-foreground-muted leading-relaxed">
              Share this secure link with the customer to view and accept the proposal.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-[10px] font-mono text-foreground truncate">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/q/${quote.shareToken}`
                  : `/q/${quote.shareToken}`}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    navigator.clipboard.writeText(`${window.location.origin}/q/${quote.shareToken}`);
                  }
                }}
                className={secondaryBtnClass}
              >
                Copy
              </button>
            </div>
            
            {/* Token status */}
            <div className="mt-2 space-y-1">
              {quote.lastSentEmailAtLabel && (
                <p className="text-[10px] text-foreground-subtle">
                  Last sent: {quote.lastSentEmailAtLabel}
                </p>
              )}
              {quote.shareTokenRevokedAt && (
                <p className="text-[10px] text-danger">
                  Revoked: {new Date(quote.shareTokenRevokedAt).toLocaleDateString()}
                </p>
              )}
              {!quote.shareTokenRevokedAt && quote.shareTokenExpiresAt && (
                <p className="text-[10px] text-foreground-subtle">
                  Expires: {new Date(quote.shareTokenExpiresAt).toLocaleDateString()}
                </p>
              )}
              {!quote.shareTokenRevokedAt && !quote.shareTokenExpiresAt && (
                <p className="text-[10px] text-foreground-subtle">
                  Never expires
                </p>
              )}
            </div>

            {/* Token management buttons */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RevokeTokenButton quoteId={quote.id} onMutated={onMutated} />
              <ExtendTokenButton quoteId={quote.id} onMutated={onMutated} />
            </div>
          </div>
        )}

        {!isArchived && canApprove ? (
          <div className="mb-4 rounded-lg border border-dashed border-border bg-foreground/[0.02] px-3 py-3">
            <p className="text-xs font-medium text-foreground">
              Customer accepted commercially
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
              This quote is Sent. When the customer has agreed to scope and
              price, record approval here.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ApproveQuoteInlineButton
                quoteId={quote.id}
                variant="primary"
                label="Mark approved"
                onMutated={onMutated}
              />
            </div>
          </div>
        ) : null}

        {!isArchived && isApproved ? (
          <div className="mb-4 rounded-lg border border-border bg-foreground/[0.02] px-3 py-3">
            <p className="text-xs font-medium text-foreground">
              Next: review job plan before creation
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
              Commercial terms are approved. Review the job plan and create the job when the work setup is ready.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onPreviewChange("execution")}
                className={secondaryBtnClass}
              >
                <Wrench className="size-3.5 mr-1.5" strokeWidth={1.5} />
                Review job plan
              </button>
              <Link
                href={quote.executionReviewHref}
                className={mutedFooterLinkClass}
              >
                Open full job-plan review page
                <ArrowUpRight className="size-3 ml-1" strokeWidth={1.5} />
              </Link>
            </div>
          </div>
        ) : null}

        {/* Embedded-only inline Activate job — keeps the user in the Lead
            workspace; the full quote page continues to use the redirecting
            QuoteActivateJobForm via the execution-review route. Only shown
            when the readiness story says activation is the next step. */}
        {embeddedInLead &&
        !isArchived &&
        readiness.state === "APPROVED_READY_TO_ACTIVATE" ? (
          <div className="mb-4">
            <EmbeddedActivateJobButton quoteId={quote.id} onMutated={onMutated} />
          </div>
        ) : null}

        {isArchived ? (
          <p className="text-xs leading-relaxed text-foreground-muted">
            This quote is archived and read-only. Existing checkpoints below stay
            historical; restore to draft on the full quote page to change status
            again.
          </p>
        ) : null}

        {latestSend ? (
          <p className="mt-2 text-xs font-medium text-foreground">
            Last send record:{" "}
            <time dateTime={latestSend.createdAtIso}>
              {latestSend.createdAtLabel}
            </time>
          </p>
        ) : null}
      </div>

      {/* Send checkpoints */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className={`${sectionLabelClass} mb-3`}>Send records</p>
        <CheckpointList
          checkpoints={sendCheckpoints}
          emptyText="No send records yet — use Mark as sent while the quote is still a draft."
        />
      </div>

      {/* Approval checkpoints */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className={`${sectionLabelClass} mb-3`}>Acceptance records</p>
        {latestApproval ? (
          <p className="mb-2 text-xs font-medium text-foreground">
            Last acceptance record:{" "}
            <time dateTime={latestApproval.createdAtIso}>
              {latestApproval.createdAtLabel}
            </time>
          </p>
        ) : null}
        <CheckpointList
          checkpoints={approvalCheckpoints}
          emptyText="No acceptance records yet."
        />
      </div>

      {/* Proposal preview */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className={`${sectionLabelClass} mb-1`}>Proposal preview</p>
        <p className="mb-3 text-xs leading-relaxed text-foreground-muted">
          Internal preview from the current saved quote — not a customer portal.
          We&apos;ll email the customer a secure link they can review, sign, and download. E-sign vendor (DocuSign / Adobe Sign) integration is optional and not enabled.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onPreviewChange("proposal")}
            className={secondaryBtnClass}
          >
            <Eye className="size-3.5 mr-1.5" strokeWidth={1.5} />
            Preview proposal
          </button>
          <button
            type="button"
            onClick={() => onPreviewChange("execution")}
            className={secondaryBtnClass}
          >
            <Wrench className="size-3.5 mr-1.5" strokeWidth={1.5} />
            Review execution
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href={quote.proposalPreviewHref} className={mutedFooterLinkClass}>
            Open full proposal preview
            <ArrowUpRight className="size-3 ml-1" strokeWidth={1.5} />
          </Link>
          <Link href={quote.executionReviewHref} className={mutedFooterLinkClass}>
            Open full quote page
            <ArrowUpRight className="size-3 ml-1" strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      {/* Active job link */}
      {quote.activatedJobId ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className={`${sectionLabelClass} mb-1`}>Active job</p>
          <p className="mb-3 text-xs leading-relaxed text-foreground-muted">
            This quote has been activated into a running job.
          </p>
          <Link href={`/jobs/${quote.activatedJobId}`} className={listLinkClass}>
            <Briefcase className="size-3.5 mr-1.5" strokeWidth={1.5} />
            Open job
            <span className="@[1000px]:hidden"> — opens job</span>
            <ArrowUpRight className="size-3 ml-1" strokeWidth={1.5} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Tab: Record ──────────────────────────────────────────────────────── */

function RecordTab({
  quote,
  workspaceTabs,
}: {
  quote: QuoteWorkSurfaceData;
  workspaceTabs: QuoteWorkspaceTabData;
}) {
  const { isCommercialEditable, isArchived, internalNotes } = workspaceTabs;

  return (
    <div className="space-y-4">
      {/* Archive / Restore */}
      <div className="@lg:hidden">
        {isArchived ? (
          <>
            <ArchivedQuoteReadOnlyNotice />
            <QuoteArchivedRestorePanel id="archive-restore" quoteId={quote.id} />
          </>
        ) : (
          <QuoteDraftArchivePanel id="archive-restore" quoteId={quote.id} />
        )}
      </div>
      <div className="hidden @lg:block">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className={`${sectionLabelClass} mb-1`}>
            {isArchived ? "Restore to draft" : "Archive quote"}
          </p>
          <p className="mb-3 text-xs leading-relaxed text-foreground-muted">
            {isArchived
              ? "Returns this quote to Draft so commercial editing is possible again. Open the full quote page to apply."
              : "Sets status to Archived; commercial fields and line items lock until restored. Open the full quote page to apply."}
          </p>
          <Link
            href={`${quote.quoteHref}#archive-restore`}
            className={listLinkClass}
          >
            {isArchived ? "Restore on full quote page" : "Archive on full quote page"}
            <ArrowUpRight className="size-3 ml-1" strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      {/* Internal notes — read-only when commercial-locked (DRAFT shows them inline in Scope tab via the details form). */}
      {!isCommercialEditable ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className={`${sectionLabelClass} mb-1`}>Internal notes</p>
          <p className="mb-3 text-xs leading-relaxed text-foreground-muted">
            Staff-only notes on the quote record — omitted from proposal preview
            and commercial checkpoint payloads.
          </p>
          {internalNotes ? (
            <p className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-sm leading-relaxed text-foreground-muted">
              {internalNotes}
            </p>
          ) : (
            <p className="text-sm text-foreground-muted">
              No internal notes on this quote.
            </p>
          )}
        </div>
      ) : null}

      {/* Activity placeholder */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className={`${sectionLabelClass} mb-1`}>Notes & activity</p>
        <p className="mb-3 text-xs leading-relaxed text-foreground-muted">
          When edit and checkpoint events exist, they will surface here. No
          fabricated history is shown.
        </p>
        <EmptyState
          icon={MessageSquare}
          title="No activity yet"
          description="Nothing logged on this quote yet."
        />
      </div>

      {/* Record details */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className={`${sectionLabelClass} mb-3`}>Record details</p>
        <dl className="space-y-3 text-xs">
          <div>
            <dt className={sectionLabelClass}>Record ID</dt>
            <dd className="mt-0.5 break-all font-mono text-foreground-muted">
              {quote.id}
            </dd>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className={sectionLabelClass}>Created</dt>
              <dd className="mt-0.5 text-foreground-muted">
                {workspaceTabs.createdAtLabel}
              </dd>
            </div>
            <div>
              <dt className={sectionLabelClass}>Updated</dt>
              <dd className="mt-0.5 text-foreground-muted">
                {workspaceTabs.updatedAtLabel}
              </dd>
            </div>
          </div>
        </dl>
      </div>

      {/* Footer escape hatch — only when not on full page. */}
      <div className="pt-1 @[1000px]:hidden">
        <Link href={quote.quoteHref} className={mutedFooterLinkClass}>
          Open full quote page
          <ArrowUpRight className="size-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}

/* ─── Main export ──────────────────────────────────────────────────────── */

export function QuoteWorkSurface({
  quote,
  readiness,
  workspaceTabs,
  suppressIdentityRow = false,
  initialTab = "overview",
  onWorkSurfaceMutated,
  embeddedInLead = false,
  onRequestServiceAddress,
}: QuoteWorkSurfaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<QuoteWorkSurfaceTab>(() => {
    if (
      initialTab === "overview" &&
      embeddedInLead &&
      workspaceTabs.lineItems.length === 0
    ) {
      return "scope";
    }
    return initialTab;
  });

  const visibleTabs = TABS.filter((t) => {
    if (embeddedInLead && t.id === "context") return false;
    return true;
  });
  const [activePreview, setActivePreview] = useState<
    "none" | "proposal" | "execution" | "send"
  >("none");

  const handleSwitchToTab = useCallback(
    (tab: QuoteWorkSurfaceTab, preview: "none" | "proposal" | "execution" | "send" = "none") => {
      setActiveTab(tab);
      setActivePreview(preview);
    },
    [setActiveTab, setActivePreview],
  );

  /* Set by `ADD_LINE_ITEM` action to ask the Scope tab editor to mount with
   * its add-line form open + focused. Cleared after the editor consumes it. */
  const [shouldFocusAddForm, setShouldFocusAddForm] = useState(false);
  const [shouldOpenScopeLibraryPicker, setShouldOpenScopeLibraryPicker] = useState(false);
  const handleRequestAddLineItem = () => {
    setShouldOpenScopeLibraryPicker(false);
    setShouldFocusAddForm(true);
  };
  const handleRequestScopeLibraryPicker = () => {
    setShouldFocusAddForm(false);
    setShouldOpenScopeLibraryPicker(true);
  };
  const handleAddFormFocusConsumed = () => setShouldFocusAddForm(false);
  const handleScopeLibraryPickerOpenConsumed = () =>
    setShouldOpenScopeLibraryPicker(false);

  /* Always invalidate SSR-rendered surfaces (Workstation drawer, full Quote
   * page, full Lead page Quote tab) and additionally let the parent
   * container re-fetch its lazy `loadQuoteWorkSurfaceAction` payload for
   * popup/drawer/lead-tab cases. This handler is the single source of
   * truth for "the quote just changed inside the surface — refresh
   * everything that displays it without navigating away". */
  const handleSurfaceMutated = useCallback(() => {
    router.refresh();
    onWorkSurfaceMutated?.();
  }, [router, onWorkSurfaceMutated]);

  /* Tab strip styling — adapts via container width. */
  const tabStripClass = "mb-4 inline-flex rounded-lg bg-background p-1 gap-0.5 @[1000px]:bg-surface @[1000px]:border @[1000px]:border-border";
  const activeTabClass = "bg-surface text-foreground shadow-sm @[1000px]:bg-background";
  const inactiveTabClass = "text-foreground-subtle hover:text-foreground";
  const tabPaddingClass = "px-3 py-1.5 @lg:px-4";

  return (
    <div className="@container space-y-4 @[1000px]:mb-6">
      {!suppressIdentityRow && (
        <div className="@[1000px]:hidden">
          <StandardIdentityRow quote={quote} />
        </div>
      )}

      <div className={tabStripClass}>
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleSwitchToTab(t.id)}
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
          quote={quote}
          readiness={readiness}
          workspaceTabs={workspaceTabs}
          onSwitchToTab={handleSwitchToTab}
          onRequestAddLineItem={handleRequestAddLineItem}
          onRequestScopeLibraryPicker={handleRequestScopeLibraryPicker}
          onMutated={handleSurfaceMutated}
          embeddedInLead={embeddedInLead}
          onRequestServiceAddress={onRequestServiceAddress}
        />
      )}
      {activeTab === "scope" && (
        <ScopeTab
          quote={quote}
          workspaceTabs={workspaceTabs}
          onSwitchToTab={handleSwitchToTab}
          shouldFocusAddForm={shouldFocusAddForm}
          onAddFormFocusConsumed={handleAddFormFocusConsumed}
          shouldOpenScopeLibraryPicker={shouldOpenScopeLibraryPicker}
          onScopeLibraryPickerOpenConsumed={handleScopeLibraryPickerOpenConsumed}
          onMutated={handleSurfaceMutated}
        />
      )}
      {activeTab === "payments" && (
        <PaymentsTab
          quote={quote}
          workspaceTabs={workspaceTabs}
        />
      )}
      {activeTab === "context" && (
        <ContextTab
          quote={quote}
          workspaceTabs={workspaceTabs}
          onMutated={handleSurfaceMutated}
          embeddedInLead={embeddedInLead}
          onRequestServiceAddress={onRequestServiceAddress}
        />
      )}
      {activeTab === "sendaccept" && (
        <SendAcceptTab
          quote={quote}
          readiness={readiness}
          workspaceTabs={workspaceTabs}
          activePreview={activePreview}
          onPreviewChange={setActivePreview}
          onMutated={handleSurfaceMutated}
          embeddedInLead={embeddedInLead}
        />
      )}
      {activeTab === "record" && (
        <RecordTab quote={quote} workspaceTabs={workspaceTabs} />
      )}
    </div>
  );
}
