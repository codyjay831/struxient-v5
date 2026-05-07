"use client";

/**
 * QuoteWorkSurface — the canonical Quote work UX, regardless of container.
 *
 * Same quote, same work surface. Different container, same behavior.
 *
 * Modes change density / surrounding context, never core actions.
 *
 *   compact   — Workstation drawer (no internal identity row; Workstation
 *               already prints quote identity above)
 *   standard  — Embedded inside `LeadWorkSurface` Quote tab (small identity
 *               row so the user knows which quote)
 *   full      — Quote full page (no identity row; the page shell renders its
 *               own H1 + total above this surface)
 *
 * Phase-2 scope: complex quote actions (add/edit lines, execution review,
 * activate job, proposal preview) remain links to the full quote page. Inline
 * mutations are limited to the already-approved workspace-safe send/approve
 * pair.
 */
import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  FileText,
  Send,
  ThumbsUp,
  Wrench,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  approveQuoteWorkspaceAction,
  sendQuoteWorkspaceAction,
  type QuoteWorkspaceActionState,
} from "@/app/(workspace)/workstation/quote-workspace-actions";
import {
  resolveQuoteReadinessActionHref,
  type QuoteReadiness,
  type QuoteReadinessAction,
} from "@/lib/quote-readiness";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";

export type QuoteWorkSurfaceMode = "compact" | "standard" | "full";

export type QuoteWorkSurfaceProps = {
  mode: QuoteWorkSurfaceMode;
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  /**
   * Suppress the `mode="standard"` internal identity row. Set this when the
   * container chrome already prints the quote's status/title/customer/lead
   * (e.g. the Quotes list popup chrome). Default `false` preserves the
   * embedded Lead Quote tab UX, where the surrounding Lead container shows
   * lead identity and the quote needs its own.
   */
  suppressIdentityRow?: boolean;
};

const workspaceActionInitial: QuoteWorkspaceActionState = {};

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

const primaryBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground";

const mutedFooterLinkClass =
  "inline-flex items-center gap-1 text-xs text-foreground-subtle underline underline-offset-2 transition-colors hover:text-foreground";

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

const ACTION_ICON: Record<QuoteReadinessAction["kind"], typeof Send> = {
  SEND_QUOTE: Send,
  MARK_APPROVED: ThumbsUp,
  OPEN_EXECUTION_REVIEW: Wrench,
  ACTIVATE_JOB: Briefcase,
  OPEN_JOB: Briefcase,
  ADD_LINE_ITEM: FileText,
  CONTINUE_EDITING: FileText,
  OPEN_PROPOSAL_PREVIEW: ArrowRight,
  RESTORE_TO_DRAFT: ArrowRight,
};

/** Append a clear "— opens quote / preview / job" suffix in non-full modes so
 *  the user knows secondary actions navigate away from this surface. */
function actionLinkLabel(
  action: QuoteReadinessAction,
  mode: QuoteWorkSurfaceMode,
): string {
  if (mode === "full") return action.label;
  switch (action.kind) {
    case "OPEN_PROPOSAL_PREVIEW":
      return `${action.label} — opens preview`;
    case "OPEN_JOB":
      return `${action.label} — opens job`;
    default:
      return `${action.label} — opens quote`;
  }
}

/* ─── Inline send / approve buttons (workspace-safe, all modes) ────────── */

function SendQuoteInlineButton({
  quoteId,
  variant,
  label,
}: {
  quoteId: string;
  variant: "primary" | "secondary";
  label: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    sendQuoteWorkspaceAction.bind(null, quoteId),
    workspaceActionInitial,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

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
}: {
  quoteId: string;
  variant: "primary" | "secondary";
  label: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    approveQuoteWorkspaceAction.bind(null, quoteId),
    workspaceActionInitial,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

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

/* ─── Action renderer ──────────────────────────────────────────────────── */

function renderAction({
  action,
  variant,
  quote,
  mode,
}: {
  action: QuoteReadinessAction | null;
  variant: "primary" | "secondary";
  quote: QuoteWorkSurfaceData;
  mode: QuoteWorkSurfaceMode;
}) {
  if (!action) return null;

  if (action.kind === "SEND_QUOTE") {
    return (
      <SendQuoteInlineButton
        quoteId={quote.id}
        variant={variant}
        label={action.label}
      />
    );
  }
  if (action.kind === "MARK_APPROVED") {
    return (
      <ApproveQuoteInlineButton
        quoteId={quote.id}
        variant={variant}
        label={action.label}
      />
    );
  }

  const href = resolveQuoteReadinessActionHref(action, { quoteId: quote.id });
  const cls = variant === "primary" ? primaryBtnClass : secondaryBtnClass;
  const Icon = ACTION_ICON[action.kind] ?? ArrowRight;

  return (
    <Link href={href} className={cls}>
      <Icon className="size-3.5 opacity-80" strokeWidth={2} />
      {actionLinkLabel(action, mode)}
      {variant === "primary" ? (
        <ArrowUpRight className="size-3.5 opacity-70" strokeWidth={1.5} />
      ) : null}
    </Link>
  );
}

/* ─── Next-step card ───────────────────────────────────────────────────── */

function NextStepCard({
  quote,
  readiness,
  mode,
}: {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  mode: QuoteWorkSurfaceMode;
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
        {renderAction({ action: primaryAction, variant: "primary", quote, mode })}
        {renderAction({
          action: secondaryAction,
          variant: "secondary",
          quote,
          mode,
        })}
      </div>
    </div>
  );
}

/* ─── Facts grid (4 calm tiles, popup-style) ───────────────────────────── */

function FactsGrid({
  quote,
  readiness,
  mode,
}: {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  mode: QuoteWorkSurfaceMode;
}) {
  const { signals } = readiness;

  /* Lead/customer context — embedded inside Lead surface, the Lead tile would
   * be redundant; keep it but de-emphasise via fallback. */
  const leadLabel =
    quote.leadTitle ?? (mode === "standard" ? "Inside this lead" : "—");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className={`${sectionLabelClass} mb-0.5`}>Lines</p>
        <p className="text-sm font-medium text-foreground">{signals.lineItemCount}</p>
        <p className="mt-0.5 text-[0.7rem] text-foreground-subtle">
          {formatMoney(quote.totalCents)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className={`${sectionLabelClass} mb-0.5`}>Customer</p>
        {quote.customerHref && quote.customerDisplayName ? (
          <Link
            href={quote.customerHref}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {quote.customerDisplayName}
          </Link>
        ) : (
          <p className="text-sm text-foreground-muted">
            {quote.customerDisplayName ?? "Not linked"}
          </p>
        )}
      </div>
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className={`${sectionLabelClass} mb-0.5`}>Lead</p>
        {quote.leadHref && quote.leadTitle ? (
          <Link
            href={quote.leadHref}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {quote.leadTitle}
          </Link>
        ) : (
          <p className="text-sm text-foreground-muted">{leadLabel}</p>
        )}
      </div>
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

/* ─── Identity row (standard mode only) ─────────────────────────────────── */

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

/* ─── Main export ──────────────────────────────────────────────────────── */

export function QuoteWorkSurface({
  mode,
  quote,
  readiness,
  suppressIdentityRow = false,
}: QuoteWorkSurfaceProps) {
  const isFull = mode === "full";
  const isStandard = mode === "standard";

  return (
    <div className={isFull ? "mb-6 space-y-4" : "space-y-4"}>
      {isStandard && !suppressIdentityRow ? (
        <StandardIdentityRow quote={quote} />
      ) : null}

      <NextStepCard quote={quote} readiness={readiness} mode={mode} />

      <FactsGrid quote={quote} readiness={readiness} mode={mode} />

      {/* Footer escape hatch — present in compact/standard so the user can
          jump to the full quote page; suppressed in full mode (already there). */}
      {isFull ? null : (
        <div className="pt-1">
          <Link href={quote.quoteHref} className={mutedFooterLinkClass}>
            Open full quote page
            <ArrowUpRight className="size-3" strokeWidth={1.5} />
          </Link>
        </div>
      )}
    </div>
  );
}
