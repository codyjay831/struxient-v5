"use client";

import { AlertTriangle } from "lucide-react";
import { formatCents } from "@/lib/job-payment-display";
import type { ChangeOrderImpactPreview } from "@/lib/change-order-flow";

export function ChangeOrderImpactPreviewPanel({
  preview,
}: {
  preview: ChangeOrderImpactPreview;
}) {
  return (
    <div className="rounded-lg border border-border bg-foreground/[0.02] p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Impact preview</h3>

      <dl className="grid gap-2 text-sm md:grid-cols-2">
        <div>
          <dt className="text-foreground-muted">Scope adds</dt>
          <dd className="font-medium">{preview.addCount}</dd>
        </div>
        <div>
          <dt className="text-foreground-muted">Scope modifies</dt>
          <dd className="font-medium">{preview.modifyCount}</dd>
        </div>
        <div>
          <dt className="text-foreground-muted">Scope removes</dt>
          <dd className="font-medium">{preview.removeCount}</dd>
        </div>
        <div>
          <dt className="text-foreground-muted">Execution-relevant lines</dt>
          <dd className="font-medium">{preview.executionRelevantLineCount}</dd>
        </div>
        <div>
          <dt className="text-foreground-muted">Total price delta</dt>
          <dd className="font-medium">{formatCents(preview.priceDeltaCents)}</dd>
        </div>
      </dl>

      {preview.scopeSummaryLines.length > 0 ? (
        <ul className="space-y-1 text-sm text-foreground-muted">
          {preview.scopeSummaryLines.map((line, index) => (
            <li key={`${line}-${index}`}>• {line}</li>
          ))}
        </ul>
      ) : null}

      {preview.paymentBlocked && preview.paymentBlockReason ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{preview.paymentBlockReason}</p>
        </div>
      ) : null}
    </div>
  );
}
