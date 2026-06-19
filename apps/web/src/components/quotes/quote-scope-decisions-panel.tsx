"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { updateQuoteScopeDecisionAction } from "@/app/(workspace)/quotes/quote-scope-decision-actions";
import {
  formatQuoteScopeDecisionResolutionTiming,
  formatQuoteScopeDecisionStatus,
  type QuoteScopeDecisionManualAction,
  type QuoteScopeDecisionPayload,
} from "@/lib/quote-scope-decision-types";
import { workspaceFormSecondaryButtonClass } from "@/components/line-item-templates/line-item-template-form-fields";

const actionButtonClass = `${workspaceFormSecondaryButtonClass} px-2 py-0.5 text-[10px]`;

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

export function QuoteScopeDecisionsQuoteWidePanel({
  quoteId,
  decisions,
  onUpdated,
}: {
  quoteId: string;
  decisions: readonly QuoteScopeDecisionPayload[];
  onUpdated: () => void;
}) {
  const quoteWide = decisions.filter((d) => d.quoteLineItemId == null);
  if (quoteWide.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-border bg-foreground/[0.02] p-3">
      <div className="mb-2">
        <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
          Open scope decisions (quote-wide)
        </p>
        <p className="mt-1 text-xs text-foreground-subtle">
          Unresolved scope questions that apply to the whole quote.
        </p>
      </div>
      <div className="space-y-2">
        {quoteWide.map((decision) => (
          <ScopeDecisionRow
            key={decision.id}
            quoteId={quoteId}
            decision={decision}
            onUpdated={onUpdated}
          />
        ))}
      </div>
    </div>
  );
}

export function QuoteScopeDecisionsLinePanel({
  quoteId,
  lineId,
  decisions,
  onUpdated,
}: {
  quoteId: string;
  lineId: string;
  decisions: readonly QuoteScopeDecisionPayload[];
  onUpdated: () => void;
}) {
  const lineDecisions = decisions.filter((d) => d.quoteLineItemId === lineId);
  if (lineDecisions.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
        Open scope decisions ({lineDecisions.length})
      </p>
      {lineDecisions.map((decision) => (
        <ScopeDecisionRow
          key={decision.id}
          quoteId={quoteId}
          decision={decision}
          compact
          onUpdated={onUpdated}
        />
      ))}
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
