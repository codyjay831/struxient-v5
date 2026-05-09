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
 *   - Customer & Lead — customer card + lead intake context
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
  sendQuoteWorkspaceAction,
  type QuoteWorkspaceActionState,
} from "@/app/(workspace)/workstation/quote-workspace-actions";
import {
  resolveQuoteReadinessActionHref,
  type QuoteReadiness,
  type QuoteReadinessAction,
  type QuoteReadinessActionKind,
} from "@/lib/quote-readiness";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";
import type {
  QuoteWorkspaceCheckpointPayload,
  QuoteWorkspaceTabData,
} from "@/lib/quote-workspace-payload";
import {
  ArchivedQuoteReadOnlyNotice,
  QuoteDraftWorkspaceControls,
} from "@/components/quotes/quote-draft-workspace-controls";
import {
  QuoteArchivedRestorePanel,
  QuoteDraftArchivePanel,
} from "@/components/quotes/quote-archive-controls";
import {
  QuoteLineDraftExecutionSummary,
  QuoteLineItemScanBlock,
  QuoteLiveProposalPreviewLineBlock,
} from "@/components/quotes/quote-line-item-display";
import { QuoteLineItemsWorkspaceEditor } from "@/components/quotes/quote-line-items-workspace-editor";
import { formatMoneyCents } from "@/lib/quote-display";
import { buildQuoteExecutionReviewPreviewModel } from "@/lib/quote-execution-review-preview-model";
import { EXECUTION_STAGE_KEYS_ORDERED } from "@/lib/execution-stage-catalog";

/* ─── Public types ─────────────────────────────────────────────────────── */

export type QuoteWorkSurfaceMode = "compact" | "standard" | "full";

export type QuoteWorkSurfaceTab =
  | "overview"
  | "scope"
  | "context"
  | "sendaccept"
  | "record";

export type QuoteWorkSurfaceProps = {
  mode: QuoteWorkSurfaceMode;
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  workspaceTabs: QuoteWorkspaceTabData;
  /**
   * Suppress the `mode="standard"` internal identity row when the container
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
};

/* ─── Constants ────────────────────────────────────────────────────────── */

const TABS: { id: QuoteWorkSurfaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "scope", label: "Scope" },
  { id: "context", label: "Customer & Lead" },
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
  mode: QuoteWorkSurfaceMode,
): string {
  if (mode === "full") return action.label;
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
        <p className="text-[0.65rem] leading-relaxed text-foreground-subtle">
          This is an internal preview of the customer proposal. E-sign and automated
          delivery are not wired in this build.
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
      executionOrder: l.executionOrder,
      executionReviewStatus: l.executionReviewStatus,
      executionMergeMode: l.executionMergeMode,
      tasks: (draftTasksByLineId[l.id] ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        stageKey: t.stageKey,
        category: t.category,
        sortOrder: t.sortOrder,
      })),
    })),
  });

  const { sharedStages, separateBlocks } = model;

  return (
    <div className="space-y-6">
      {sharedStages.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <SectionHeading
            title="Shared job stages (preview)"
            description="Tasks from lines set to use shared job stages, merged by canonical phase."
          />
          <div className="mt-4 space-y-6">
            {sharedStages.map((stage) => (
              <section key={stage.stageKey}>
                <h4 className="mb-2 text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
                  {stage.stageLabel}
                </h4>
                <ul className="space-y-2">
                  {stage.tasks.map((t) => (
                    <li
                      key={t.taskId}
                      className="rounded-md border border-border/80 bg-surface/50 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-foreground">{t.title}</p>
                      <p className="mt-0.5 text-[0.65rem] text-foreground-muted">
                        From line: {t.sourceLineDescription}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}

      {separateBlocks.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <SectionHeading
            title="Separate execution blocks (preview)"
            description="Each block is one quoted scope kept apart from shared stages."
          />
          <div className="mt-4 space-y-6">
            {separateBlocks.map((block) => (
              <section
                key={block.lineId}
                className="rounded-lg border border-border-strong bg-surface/30 px-4 py-4 ring-1 ring-ring/10"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Layers className="size-4 text-foreground-subtle" aria-hidden />
                  <h4 className="text-sm font-semibold text-foreground">
                    {block.lineDescription}
                  </h4>
                </div>
                <div className="space-y-4 border-t border-border pt-3">
                  {block.stages.map((st) => (
                    <div key={st.stageKey}>
                      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                        {st.stageLabel}
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {st.tasks.map((t) => (
                          <li
                            key={t.taskId}
                            className="rounded border border-border/60 bg-background/40 px-2.5 py-1.5 text-sm text-foreground"
                          >
                            {t.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {sharedStages.length === 0 && separateBlocks.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center">
          <p className="text-sm text-foreground-muted">
            No draft execution tasks have been added to this quote yet.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Inline send / approve buttons (workspace-safe, every mode) ───────── */

function SendQuoteInlineButton({
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
    sendQuoteWorkspaceAction.bind(null, quoteId),
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
        <Send className="size-3.5 opacity-80" strokeWidth={2} />
        {isPending ? "Sending…" : label}
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

/* ─── Action renderer (tab-bound actions stay on the surface) ──────────── */

function renderAction({
  action,
  variant,
  quote,
  mode,
  onSwitchToTab,
  onRequestAddLineItem,
  onRequestScopeLibraryPicker,
  onMutated,
}: {
  action: QuoteReadinessAction | null;
  variant: "primary" | "secondary";
  quote: QuoteWorkSurfaceData;
  mode: QuoteWorkSurfaceMode;
  onSwitchToTab: (tab: QuoteWorkSurfaceTab, preview?: "none" | "proposal" | "execution") => void;
  onRequestAddLineItem: () => void;
  onRequestScopeLibraryPicker: () => void;
  onMutated?: () => void;
}) {
  if (!action) return null;

  if (action.kind === "SEND_QUOTE") {
    return (
      <SendQuoteInlineButton
        quoteId={quote.id}
        variant={variant}
        label={action.label}
        onMutated={onMutated}
      />
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
      {externalActionLabel(action, mode)}
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
  mode,
  onSwitchToTab,
  onRequestAddLineItem,
  onRequestScopeLibraryPicker,
  onMutated,
}: {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  mode: QuoteWorkSurfaceMode;
  onSwitchToTab: (tab: QuoteWorkSurfaceTab, preview?: "none" | "proposal" | "execution") => void;
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
          mode,
          onSwitchToTab,
          onRequestAddLineItem,
          onRequestScopeLibraryPicker,
          onMutated,
        })}
        {renderAction({
          action: secondaryAction,
          variant: "secondary",
          quote,
          mode,
          onSwitchToTab,
          onRequestAddLineItem,
          onRequestScopeLibraryPicker,
          onMutated,
        })}
      </div>
    </div>
  );
}

function FactsGrid({
  quote,
  readiness,
  mode,
  onSwitchToTab,
}: {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  mode: QuoteWorkSurfaceMode;
  onSwitchToTab: (tab: QuoteWorkSurfaceTab, preview?: "none" | "proposal" | "execution") => void;
}) {
  const { signals } = readiness;
  const leadLabel =
    quote.leadTitle ?? (mode === "standard" ? "Inside this lead" : "—");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        className="rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:bg-background"
      >
        <p className={`${sectionLabelClass} mb-0.5`}>Lead</p>
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
  mode,
  onSwitchToTab,
  onRequestAddLineItem,
  onRequestScopeLibraryPicker,
  onMutated,
}: {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  workspaceTabs: QuoteWorkspaceTabData;
  mode: QuoteWorkSurfaceMode;
  onSwitchToTab: (tab: QuoteWorkSurfaceTab, preview?: "none" | "proposal" | "execution") => void;
  onRequestAddLineItem: () => void;
  onRequestScopeLibraryPicker: () => void;
  onMutated?: () => void;
}) {
  const isFull = mode === "full";
  return (
    <div className="space-y-4">
      <NextStepCard
        quote={quote}
        readiness={readiness}
        mode={mode}
        onSwitchToTab={onSwitchToTab}
        onRequestAddLineItem={onRequestAddLineItem}
        onRequestScopeLibraryPicker={onRequestScopeLibraryPicker}
        onMutated={onMutated}
      />

      <FactsGrid
        quote={quote}
        readiness={readiness}
        mode={mode}
        onSwitchToTab={onSwitchToTab}
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
      {!isFull ? (
        <div className="pt-1">
          <Link href={quote.quoteHref} className={mutedFooterLinkClass}>
            Open full quote page
            <ArrowUpRight className="size-3" strokeWidth={1.5} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Tab: Scope ───────────────────────────────────────────────────────── */

function ScopeTab({
  quote,
  workspaceTabs,
  mode,
  shouldFocusAddForm,
  onAddFormFocusConsumed,
  shouldOpenScopeLibraryPicker,
  onScopeLibraryPickerOpenConsumed,
  onMutated,
}: {
  quote: QuoteWorkSurfaceData;
  workspaceTabs: QuoteWorkspaceTabData;
  mode: QuoteWorkSurfaceMode;
  onSwitchToTab: (tab: QuoteWorkSurfaceTab, preview?: "none" | "proposal" | "execution") => void;
  shouldFocusAddForm: boolean;
  onAddFormFocusConsumed: () => void;
  shouldOpenScopeLibraryPicker: boolean;
  onScopeLibraryPickerOpenConsumed: () => void;
  onMutated?: () => void;
}) {
  const isFull = mode === "full";
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
  } = workspaceTabs;
  const lineCount = lineItems.length;

  /* Full + DRAFT — embed the existing full-page editor. The legacy line-item
   * add/edit/delete forms here redirect to `/quotes/[id]` which is where we
   * already are, so no navigation occurs. The Scope Library picker now uses
   * the workspace-safe action (no redirect) plus `router.refresh()` driven
   * from QuoteDraftWorkspaceControls. Execution editing remains full-page
   * only by design. */
  if (isFull && isCommercialEditable) {
    return (
      <QuoteDraftWorkspaceControls
        id="line-items"
        quoteId={quote.id}
        initialTitle={quote.title}
        initialInternalNotes={internalNotes}
        initialCustomerDocumentTitle={customerDocumentTitle}
        hasLeadNotes={hasLeadNotes}
        subtotalCents={subtotalCents}
        totalCents={totalCents}
        lineItems={lineItems}
        lineItemTemplates={lineItemTemplates}
        draftTasksByLineId={draftTasksByLineId}
        reusableTaskOptions={reusableTaskOptions}
        shouldOpenScopeLibraryPicker={shouldOpenScopeLibraryPicker}
        onScopeLibraryPickerOpenConsumed={onScopeLibraryPickerOpenConsumed}
      />
    );
  }

  /* Full + non-DRAFT — read-only line list with execution-edit summaries
   * (execution actions also redirect to self → safe). */
  if (isFull) {
    return (
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
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <SignalCard
            label="Subtotal"
            value={formatMoneyCents(subtotalCents)}
            hint="Stored rollup (sum of line totals)."
          />
          <SignalCard
            label="Total"
            value={formatMoneyCents(totalCents)}
            hint="Same as subtotal for now—no tax line."
          />
          <SignalCard
            label="Lines"
            value={String(lineCount)}
            hint="Persisted rows, ordered for display."
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
              <li key={line.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <QuoteLineItemScanBlock line={line} />
                    <QuoteLineDraftExecutionSummary
                      quoteId={quote.id}
                      line={line}
                      isExecutionEditable={isExecutionEditable}
                      draftTasks={draftTasksByLineId[line.id] ?? []}
                      reusableOptions={reusableTaskOptions}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </WorkspacePanel>
    );
  }

  /* Standard / compact + DRAFT — workspace-safe inline editor. Add / Edit /
   * Delete and Scope Library Apply-template submit through `*WorkspaceAction`
   * server actions and call `onMutated()` so the surrounding popup/drawer/
   * lead-tab can re-load its `QuoteWorkSurfaceData` payload. Per-line
   * execution editing is also supported in-place. */
  if (isCommercialEditable) {
    return (
      <QuoteLineItemsWorkspaceEditor
        quoteId={quote.id}
        quoteHref={quote.quoteHref}
        lineItems={lineItems}
        subtotalCents={subtotalCents}
        totalCents={totalCents}
        mode={mode === "compact" ? "compact" : "standard"}
        lineItemTemplates={lineItemTemplates}
        draftTasksByLineId={draftTasksByLineId}
        reusableTaskOptions={reusableTaskOptions}
        shouldFocusAddForm={shouldFocusAddForm}
        onAddOpenConsumed={onAddFormFocusConsumed}
        shouldOpenScopeLibraryPicker={shouldOpenScopeLibraryPicker}
        onScopeLibraryPickerOpenConsumed={onScopeLibraryPickerOpenConsumed}
        onMutated={onMutated ?? (() => {})}
      />
    );
  }

  /* Standard / compact + non-DRAFT — read-only summary + escape hatch.
   * Commercial fields are locked after send; restore-to-draft lives on the
   * full quote page. */
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Subtotal</p>
          <p className="text-sm font-medium text-foreground tabular-nums">
            {formatMoneyCents(subtotalCents)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Total</p>
          <p className="text-sm font-medium text-foreground tabular-nums">
            {formatMoneyCents(totalCents)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Lines</p>
          <p className="text-sm font-medium text-foreground">{lineCount}</p>
        </div>
      </div>

      {lineCount === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-5">
          <p className="text-sm font-medium text-foreground">No line items</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            {isArchived
              ? "No scope rows were captured before archive. Restore to draft on the full quote page to add line items."
              : "Commercial scope is locked after send. Existing rows would appear here."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {lineItems.map((line) => (
            <li key={line.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">
                  {line.description}
                </p>
                <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {formatMoneyCents(line.lineTotalCents)}
                </p>
              </div>
              <p className="mt-0.5 text-[0.7rem] text-foreground-subtle">
                {line.quantityDisplay} ×{" "}
                {formatMoneyCents(line.unitAmountCents)}
              </p>
              <QuoteLineDraftExecutionSummary
                quoteId={quote.id}
                line={line}
                isExecutionEditable={isExecutionEditable}
                draftTasks={draftTasksByLineId[line.id] ?? []}
                reusableOptions={reusableTaskOptions}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="pt-1">
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

/* ─── Tab: Customer & Lead ─────────────────────────────────────────────── */

function ContextTab({
  workspaceTabs,
}: {
  workspaceTabs: QuoteWorkspaceTabData;
}) {
  const { customerName, customerHref, leadIntake } = workspaceTabs;

  return (
    <div className="space-y-4">
      {/* Customer */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className={`${sectionLabelClass} mb-2`}>Customer</p>
        {customerName && customerHref ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
            <div className="min-w-0">
              <p className={sectionLabelClass}>Linked customer</p>
              <p className="mt-1 truncate text-sm font-medium text-foreground">
                {customerName}
              </p>
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

      {/* Lead */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className={`${sectionLabelClass} mb-2`}>Lead</p>
        {leadIntake ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
              <div className="min-w-0">
                <p className={sectionLabelClass}>Linked lead</p>
                <p className="mt-1 truncate text-sm font-medium text-foreground">
                  {leadIntake.title}
                </p>
              </div>
              <Link href={leadIntake.href} className={listLinkClass}>
                Lead record
                <ArrowUpRight className="size-3 ml-1" strokeWidth={1.5} />
              </Link>
            </div>

            {/* Intake context */}
            <div className="rounded-lg border border-border bg-foreground/[0.01] px-4 py-4">
              <p className={`${sectionLabelClass} mb-3`}>Lead intake context</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  {leadIntake.source ? (
                    <div>
                      <p className={sectionLabelClass}>Source</p>
                      <p className="mt-0.5 text-sm text-foreground">
                        {leadIntake.source}
                      </p>
                    </div>
                  ) : null}
                  {leadIntake.contactName ||
                  leadIntake.email ||
                  leadIntake.phone ? (
                    <div>
                      <p className={sectionLabelClass}>Contact</p>
                      <div className="mt-0.5 space-y-0.5 text-sm">
                        {leadIntake.contactName ? (
                          <p className="text-foreground">
                            {leadIntake.contactName}
                          </p>
                        ) : null}
                        {leadIntake.email ? (
                          <p className="text-foreground-muted break-all">
                            {leadIntake.email}
                          </p>
                        ) : null}
                        {leadIntake.phone ? (
                          <p className="text-foreground-muted">
                            {leadIntake.phone}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div>
                  <p className={sectionLabelClass}>Intake notes</p>
                  <div className="mt-1">
                    {leadIntake.notes ? (
                      <div className="rounded border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-foreground">
                        {leadIntake.notes}
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
              No lead linked to this quote.
            </p>
            <p className="mt-1 text-xs text-foreground-subtle">
              Linking is optional. Use it when this quote comes from a tracked
              lead.
            </p>
            <Link href="/leads" className={`mt-3 ${listLinkClass}`}>
              Leads
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
          <span>
            #{cp.sequence} ·{" "}
            <time dateTime={cp.createdAtIso}>{cp.createdAtLabel}</time>
          </span>
          <Link href={cp.href} className={listLinkClass}>
            Open record
            <ArrowUpRight className="size-3 ml-1" strokeWidth={1.5} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SendAcceptTab({
  quote,
  readiness,
  workspaceTabs,
  mode,
  activePreview,
  onPreviewChange,
  onMutated,
}: {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  workspaceTabs: QuoteWorkspaceTabData;
  mode: QuoteWorkSurfaceMode;
  activePreview: "none" | "proposal" | "execution";
  onPreviewChange: (preview: "none" | "proposal" | "execution") => void;
  onMutated?: () => void;
}) {
  const { isArchived, sendCheckpoints, approvalCheckpoints } = workspaceTabs;

  const canSend = readiness.primaryAction?.kind === "SEND_QUOTE";
  const canApprove = readiness.primaryAction?.kind === "MARK_APPROVED";
  const isApproved = quote.status === "APPROVED";
  const latestSend = sendCheckpoints[sendCheckpoints.length - 1] ?? null;
  const latestApproval =
    approvalCheckpoints[approvalCheckpoints.length - 1] ?? null;

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
              use Send quote. Commercial fields stay editable only while Draft —
              after send, scope and pricing lock.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SendQuoteInlineButton
                quoteId={quote.id}
                variant="primary"
                label="Send quote"
                onMutated={onMutated}
              />
            </div>
          </div>
        ) : null}

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
              Next: review execution before activation
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
              Commercial terms are approved. Review the internal draft execution
              and activate the job when planning is ready.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onPreviewChange("execution")}
                className={secondaryBtnClass}
              >
                <Wrench className="size-3.5 mr-1.5" strokeWidth={1.5} />
                Review execution
              </button>
              <Link
                href={quote.executionReviewHref}
                className={mutedFooterLinkClass}
              >
                Open full review page
                <ArrowUpRight className="size-3 ml-1" strokeWidth={1.5} />
              </Link>
            </div>
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
          emptyText="No send records yet — use Send quote while the quote is still a draft."
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
          E-sign and automated delivery are not wired in this build; use Send
          quote and Mark approved as staff workflow steps.
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
            {mode !== "full" ? " — opens job" : ""}
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
  mode,
}: {
  quote: QuoteWorkSurfaceData;
  workspaceTabs: QuoteWorkspaceTabData;
  mode: QuoteWorkSurfaceMode;
}) {
  const isFull = mode === "full";
  const { isCommercialEditable, isArchived, internalNotes } = workspaceTabs;

  return (
    <div className="space-y-4">
      {/* Archive / Restore */}
      {isFull ? (
        isArchived ? (
          <>
            <ArchivedQuoteReadOnlyNotice />
            <QuoteArchivedRestorePanel id="archive-restore" quoteId={quote.id} />
          </>
        ) : (
          <QuoteDraftArchivePanel id="archive-restore" quoteId={quote.id} />
        )
      ) : (
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
      )}

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
      {!isFull ? (
        <div className="pt-1">
          <Link href={quote.quoteHref} className={mutedFooterLinkClass}>
            Open full quote page
            <ArrowUpRight className="size-3" strokeWidth={1.5} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Main export ──────────────────────────────────────────────────────── */

export function QuoteWorkSurface({
  mode,
  quote,
  readiness,
  workspaceTabs,
  suppressIdentityRow = false,
  initialTab = "overview",
  onWorkSurfaceMutated,
}: QuoteWorkSurfaceProps) {
  const router = useRouter();
  const isFull = mode === "full";
  const isStandard = mode === "standard";
  const isCompact = mode === "compact";
  const [activeTab, setActiveTab] = useState<QuoteWorkSurfaceTab>(initialTab);
  const [activePreview, setActivePreview] = useState<
    "none" | "proposal" | "execution"
  >("none");

  const handleSwitchToTab = useCallback(
    (tab: QuoteWorkSurfaceTab, preview: "none" | "proposal" | "execution" = "none") => {
      setActiveTab(tab);
      setActivePreview(preview);
    },
    [],
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

  /* Mode-specific tab strip styling — full page sits on bg-background, popup
   * dialog sits on bg-surface, Workstation drawer sits on bg-surface too. */
  const tabStripClass = isFull
    ? "mb-4 inline-flex rounded-lg bg-surface border border-border p-1 gap-0.5"
    : "mb-4 inline-flex rounded-lg bg-background p-1 gap-0.5";
  const activeTabClass = isFull
    ? "bg-background text-foreground shadow-sm"
    : "bg-surface text-foreground shadow-sm";
  const inactiveTabClass = "text-foreground-subtle hover:text-foreground";
  const tabPaddingClass = isCompact ? "px-3 py-1.5" : "px-4 py-1.5";

  return (
    <div className={isFull ? "mb-6 space-y-4" : "space-y-4"}>
      {isStandard && !suppressIdentityRow ? (
        <StandardIdentityRow quote={quote} />
      ) : null}

      <div className={tabStripClass}>
        {TABS.map((t) => (
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
          mode={mode}
          onSwitchToTab={handleSwitchToTab}
          onRequestAddLineItem={handleRequestAddLineItem}
          onRequestScopeLibraryPicker={handleRequestScopeLibraryPicker}
          onMutated={handleSurfaceMutated}
        />
      )}
      {activeTab === "scope" && (
        <ScopeTab
          quote={quote}
          workspaceTabs={workspaceTabs}
          mode={mode}
          onSwitchToTab={handleSwitchToTab}
          shouldFocusAddForm={shouldFocusAddForm}
          onAddFormFocusConsumed={handleAddFormFocusConsumed}
          shouldOpenScopeLibraryPicker={shouldOpenScopeLibraryPicker}
          onScopeLibraryPickerOpenConsumed={handleScopeLibraryPickerOpenConsumed}
          onMutated={handleSurfaceMutated}
        />
      )}
      {activeTab === "context" && <ContextTab workspaceTabs={workspaceTabs} />}
      {activeTab === "sendaccept" && (
        <SendAcceptTab
          quote={quote}
          readiness={readiness}
          workspaceTabs={workspaceTabs}
          mode={mode}
          activePreview={activePreview}
          onPreviewChange={setActivePreview}
          onMutated={handleSurfaceMutated}
        />
      )}
      {activeTab === "record" && (
        <RecordTab quote={quote} workspaceTabs={workspaceTabs} mode={mode} />
      )}
    </div>
  );
}
