"use client";

import type { QuoteWorkflowBlocker } from "@/lib/quote-workflow-presenter";
import {
  QUOTE_SEND_READINESS_HEADING,
  QUOTE_SEND_READINESS_READY_COPY,
} from "@/lib/quote/quote-clarify-scope-ui";

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

