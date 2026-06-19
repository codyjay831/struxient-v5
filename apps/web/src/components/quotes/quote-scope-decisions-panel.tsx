"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { updateQuoteScopeDecisionAction } from "@/app/(workspace)/quotes/quote-scope-decision-actions";
import {
  buildScopeDecisionPreviewChips,
  filterLineScopeDecisions,
  filterQuoteWideScopeDecisions,
} from "@/lib/quote-scope-decision-display";
import {
  formatQuoteScopeDecisionResolutionTiming,
  formatQuoteScopeDecisionStatus,
  type QuoteScopeDecisionManualAction,
  type QuoteScopeDecisionPayload,
} from "@/lib/quote-scope-decision-types";
import {
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";

const actionButtonClass = `${workspaceFormSecondaryButtonClass} px-2 py-0.5 text-[10px]`;
const chipClass =
  "inline-flex items-center rounded-full border border-border bg-foreground/[0.03] px-2 py-0.5 text-[10px] text-foreground-muted";

type ManualActionOption = {
  action: QuoteScopeDecisionManualAction;
  label: string;
};

const MANUAL_ACTIONS: ManualActionOption[] = [
  { action: "resolve", label: "Resolve" },
  { action: "ask_customer", label: "Ask customer" },
  { action: "verify_on_site", label: "Verify on site" },
  { action: "defer_to_execution", label: "Defer to execution" },
  { action: "use_assumption", label: "Use assumption" },
  { action: "dismiss", label: "Dismiss" },
];

function ScopeDecisionRow({
  quoteId,
  decision,
  compact = false,
  onUpdated,
}: {
  quoteId: string;
  decision: QuoteScopeDecisionPayload;
  compact?: boolean;
  onUpdated: () => void;
}) {
  const [selectedAction, setSelectedAction] =
    useState<QuoteScopeDecisionManualAction>("resolve");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timingLabel = formatQuoteScopeDecisionResolutionTiming(decision.resolutionTiming);
  const statusLabel = formatQuoteScopeDecisionStatus(decision.status);

  const handleApply = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await updateQuoteScopeDecisionAction(quoteId, decision.id, selectedAction);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      onUpdated();
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={
        compact
          ? "rounded-md border border-border bg-foreground/[0.02] px-2 py-1.5"
          : "rounded-md border border-border bg-surface px-3 py-2"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">{decision.title}</p>
          {decision.detail ? (
            <p className="mt-0.5 text-[11px] text-foreground-muted">{decision.detail}</p>
          ) : null}
          <p className="mt-1 text-[10px] text-foreground-subtle">
            {statusLabel}
            {timingLabel ? ` · ${timingLabel}` : null}
            {decision.quoteImpact !== "NONE" ? ` · Impact: ${decision.quoteImpact.toLowerCase()}` : null}
          </p>
          {error ? (
            <p className="mt-1 text-[10px] text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <select
            value={selectedAction}
            onChange={(e) =>
              setSelectedAction(e.target.value as QuoteScopeDecisionManualAction)
            }
            className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] text-foreground"
            aria-label={`Action for ${decision.title}`}
          >
            {MANUAL_ACTIONS.map(({ action, label }) => (
              <option key={action} value={action}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            className={actionButtonClass}
            onClick={() => void handleApply()}
          >
            {pending ? <Loader2 className="inline size-3 animate-spin" /> : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScopeDecisionPreviewChips({
  decisions,
}: {
  decisions: readonly QuoteScopeDecisionPayload[];
}) {
  const chips = buildScopeDecisionPreviewChips(decisions);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span key={chip} className={chipClass}>
          {chip}
        </span>
      ))}
    </div>
  );
}

function ScopeDecisionManageHandling({
  quoteId,
  decisions,
  onUpdated,
  compact = false,
}: {
  quoteId: string;
  decisions: readonly QuoteScopeDecisionPayload[];
  onUpdated: () => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (decisions.length === 0) return null;

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex items-center gap-1 text-[10px] font-medium text-foreground-subtle underline-offset-2 hover:text-foreground hover:underline"
        aria-expanded={expanded}
      >
        Manage handling
        {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>
      {expanded ? (
        <div className="mt-2 space-y-2 rounded-md border border-dashed border-border bg-foreground/[0.01] p-2">
          <p className="text-[10px] text-foreground-subtle">
            Admin triage only — use Clarify scope to capture structured answers.
          </p>
          {decisions.map((decision) => (
            <ScopeDecisionRow
              key={decision.id}
              quoteId={quoteId}
              decision={decision}
              compact
              onUpdated={onUpdated}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Compact quote-wide summary — raw decision rows hidden unless Manage handling is opened. */
export function QuoteScopeDetailsNeededQuoteSummary({
  quoteId,
  decisions,
  onUpdated,
}: {
  quoteId: string;
  decisions: readonly QuoteScopeDecisionPayload[];
  onUpdated: () => void;
}) {
  const quoteWide = filterQuoteWideScopeDecisions(decisions);
  if (quoteWide.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          Scope details needed: {quoteWide.length}
        </p>
        <p className="text-[10px] text-foreground-subtle">Quote-wide gaps</p>
      </div>
      <div className="mt-2">
        <ScopeDecisionPreviewChips decisions={quoteWide} />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-foreground-subtle">
        Use Clarify scope on affected line items to capture answers. These records track unresolved
        gaps until answered.
      </p>
      <ScopeDecisionManageHandling
        quoteId={quoteId}
        decisions={quoteWide}
        onUpdated={onUpdated}
      />
    </div>
  );
}

/** Compact line summary with Clarify scope as the primary action. */
export function QuoteScopeDetailsNeededLineSummary({
  quoteId,
  lineId,
  decisions,
  onClarifyScope,
  onUpdated,
  isClarifyLoading = false,
}: {
  quoteId: string;
  lineId: string;
  decisions: readonly QuoteScopeDecisionPayload[];
  onClarifyScope: () => void;
  onUpdated: () => void;
  isClarifyLoading?: boolean;
}) {
  const lineDecisions = filterLineScopeDecisions(decisions, lineId);
  if (lineDecisions.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-border bg-foreground/[0.02] px-2.5 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">
            Scope details needed: {lineDecisions.length}
          </p>
          <div className="mt-1.5">
            <ScopeDecisionPreviewChips decisions={lineDecisions} />
          </div>
        </div>
        <button
          type="button"
          disabled={isClarifyLoading}
          onClick={onClarifyScope}
          className={`${workspaceFormPrimaryButtonClass} shrink-0 px-2.5 py-1 text-[10px]`}
        >
          {isClarifyLoading ? (
            <Loader2 className="inline size-3 animate-spin" />
          ) : (
            "Clarify scope"
          )}
        </button>
      </div>
      <ScopeDecisionManageHandling
        quoteId={quoteId}
        decisions={lineDecisions}
        onUpdated={onUpdated}
        compact
      />
    </div>
  );
}

export function groupScopeDecisionsByLineId(
  decisions: readonly QuoteScopeDecisionPayload[],
): Map<string | null, QuoteScopeDecisionPayload[]> {
  const map = new Map<string | null, QuoteScopeDecisionPayload[]>();
  for (const decision of decisions) {
    const key = decision.quoteLineItemId;
    const existing = map.get(key);
    if (existing) {
      existing.push(decision);
    } else {
      map.set(key, [decision]);
    }
  }
  return map;
}
