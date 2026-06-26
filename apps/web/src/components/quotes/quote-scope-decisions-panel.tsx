"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { updateQuoteScopeDecisionAction } from "@/app/(workspace)/quotes/quote-scope-decision-actions";
import {
  buildScopeDecisionPreviewChips,
  filterLineScopeDecisions,
  filterOpenScopeDecisions,
  filterQuoteWideScopeDecisions,
  filterSendBlockingScopeDecisions,
} from "@/lib/quote-scope-decision-display";
import {
  formatQuoteScopeDecisionResolutionTiming,
  formatQuoteScopeDecisionStatus,
  type QuoteScopeDecisionManualAction,
  type QuoteScopeDecisionPayload,
} from "@/lib/quote-scope-decision-types";
import type { QuoteWorkflowBlocker } from "@/lib/quote-workflow-presenter";
import {
  LEGACY_GAP_HANDLING_DESCRIPTION,
  LEGACY_GAP_HANDLING_LABEL,
  QUOTE_SEND_READINESS_HEADING,
  QUOTE_SEND_READINESS_READY_COPY,
} from "@/lib/quote/quote-clarify-scope-ui";
import {
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";

const legacyActionButtonClass = `${workspaceFormSecondaryButtonClass} px-2 py-0.5 text-[10px]`;
const chipClass =
  "inline-flex items-center rounded-full border border-border bg-foreground/[0.03] px-2 py-0.5 text-[10px] text-foreground-muted";

type ManualActionOption = {
  action: QuoteScopeDecisionManualAction;
  label: string;
};

const LEGACY_MANUAL_ACTIONS: ManualActionOption[] = [
  { action: "ask_customer", label: "Ask customer" },
  { action: "verify_on_site", label: "Verify on site" },
  { action: "defer_to_execution", label: "Defer to execution" },
  { action: "use_assumption", label: "Use assumption" },
  { action: "dismiss", label: "Dismiss" },
];

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

function LegacyScopeDecisionRow({
  quoteId,
  decision,
  onUpdated,
}: {
  quoteId: string;
  decision: QuoteScopeDecisionPayload;
  onUpdated: () => void;
}) {
  const [selectedAction, setSelectedAction] =
    useState<QuoteScopeDecisionManualAction>("dismiss");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timingLabel = formatQuoteScopeDecisionResolutionTiming(decision.resolutionTiming);
  const statusLabel = formatQuoteScopeDecisionStatus(decision.status);

  const handleUpdate = async () => {
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
    <div className="rounded-md border border-border bg-foreground/[0.02] px-2 py-1.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">{decision.title}</p>
          {decision.detail ? (
            <p className="mt-0.5 text-[11px] text-foreground-muted">{decision.detail}</p>
          ) : null}
          <p className="mt-1 text-[10px] text-foreground-subtle">
            {statusLabel}
            {timingLabel ? ` · ${timingLabel}` : null}
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
            aria-label={`Legacy action for ${decision.title}`}
          >
            {LEGACY_MANUAL_ACTIONS.map(({ action, label }) => (
              <option key={action} value={action}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            className={legacyActionButtonClass}
            onClick={() => void handleUpdate()}
          >
            {pending ? <Loader2 className="inline size-3 animate-spin" /> : "Update record"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Collapsed compatibility path for clearing OPEN internal gap records (until Slice 3). */
function LegacyGapHandlingSection({
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
  const openDecisions = filterOpenScopeDecisions(decisions);

  if (openDecisions.length === 0) return null;

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex items-center gap-1 text-[10px] font-medium text-foreground-subtle underline-offset-2 hover:text-foreground hover:underline"
        aria-expanded={expanded}
      >
        {LEGACY_GAP_HANDLING_LABEL} ({openDecisions.length})
        {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>
      {expanded ? (
        <div className="mt-2 space-y-2 rounded-md border border-dashed border-border bg-foreground/[0.01] p-2">
          <p className="text-[10px] leading-relaxed text-foreground-subtle">
            {LEGACY_GAP_HANDLING_DESCRIPTION}
          </p>
          {openDecisions.map((decision) => (
            <LegacyScopeDecisionRow
              key={decision.id}
              quoteId={quoteId}
              decision={decision}
              onUpdated={onUpdated}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Quote-tab send readiness — uses Slice 1 workflow blockers/warnings. */
export function QuoteSendReadinessSummary({
  canSend,
  blockers,
  warnings,
}: {
  canSend: boolean;
  blockers: readonly QuoteWorkflowBlocker[];
  warnings: readonly QuoteWorkflowBlocker[];
}) {
  if (canSend && blockers.length === 0 && warnings.length === 0) {
    return (
      <div className="mb-6 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5">
        <p className="text-xs font-medium text-foreground">{QUOTE_SEND_READINESS_HEADING}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-foreground-muted">
          {QUOTE_SEND_READINESS_READY_COPY}
        </p>
      </div>
    );
  }

  if (blockers.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5">
      <p className="text-xs font-medium text-foreground">{QUOTE_SEND_READINESS_HEADING}</p>

      {blockers.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
            Required before send
          </p>
          <ul className="mt-1.5 space-y-1">
            {blockers.map((blocker) => (
              <li
                key={blocker.message}
                className="text-[11px] leading-relaxed text-foreground-muted"
              >
                {blocker.message}
                {blocker.fixTab === "scope" ? (
                  <span className="text-foreground-subtle"> — use Clarify on affected lines.</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className={blockers.length > 0 ? "mt-3 border-t border-border pt-3" : "mt-2"}>
          <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
            Optional for job setup
          </p>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((warning) => (
              <li
                key={warning.message}
                className="text-[11px] leading-relaxed text-foreground-subtle"
              >
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Quote-wide legacy gap records — collapsed compatibility only. */
export function QuoteLegacyGapHandlingQuoteSection({
  quoteId,
  decisions,
  onUpdated,
}: {
  quoteId: string;
  decisions: readonly QuoteScopeDecisionPayload[];
  onUpdated: () => void;
}) {
  const quoteWideOpen = filterOpenScopeDecisions(filterQuoteWideScopeDecisions(decisions));
  if (quoteWideOpen.length === 0) return null;

  return (
    <div className="mb-6 rounded-md border border-dashed border-border bg-foreground/[0.01] px-3 py-2">
      <p className="text-[10px] font-medium text-foreground-subtle">{LEGACY_GAP_HANDLING_LABEL}</p>
      <p className="mt-1 text-[10px] text-foreground-subtle">
        Quote-wide internal records ({quoteWideOpen.length}). Prefer Clarify scope on line items.
      </p>
      <div className="mt-2">
        <ScopeDecisionPreviewChips decisions={quoteWideOpen} />
      </div>
      <LegacyGapHandlingSection
        quoteId={quoteId}
        decisions={quoteWideOpen}
        onUpdated={onUpdated}
      />
    </div>
  );
}

/** Line-level legacy gap records — below Clarify primary action. */
export function QuoteLegacyGapHandlingLineSection({
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
  const lineOpen = filterOpenScopeDecisions(filterLineScopeDecisions(decisions, lineId));
  if (lineOpen.length === 0) return null;

  const blockingPreview = filterSendBlockingScopeDecisions(lineOpen);

  return (
    <div className="mt-2 rounded-md border border-dashed border-border bg-foreground/[0.01] px-2.5 py-2">
      {blockingPreview.length > 0 ? (
        <div className="mb-2">
          <ScopeDecisionPreviewChips decisions={blockingPreview} />
        </div>
      ) : null}
      <LegacyGapHandlingSection
        quoteId={quoteId}
        decisions={lineOpen}
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
