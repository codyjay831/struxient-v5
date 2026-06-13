"use client";

import { QuoteScopeRevisionStatus } from "@prisma/client";
import { formatCents } from "@/lib/job-payment-display";
import { StatusBadge } from "@/components/ui/status-badge";
import type { LoadedChangeOrderRevision } from "@/lib/change-order-loader";

function revisionStatusTone(
  status: QuoteScopeRevisionStatus,
): "draft" | "approved" | "neutral" | "warning" {
  switch (status) {
    case QuoteScopeRevisionStatus.DRAFT:
      return "draft";
    case QuoteScopeRevisionStatus.APPROVED:
      return "approved";
    case QuoteScopeRevisionStatus.APPLIED:
      return "approved";
    case QuoteScopeRevisionStatus.REJECTED:
      return "warning";
    default:
      return "neutral";
  }
}

function formatRevisionStatus(status: QuoteScopeRevisionStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function ChangeOrderHistoryList({
  revisions,
  selectedRevisionId,
  onSelect,
}: {
  revisions: LoadedChangeOrderRevision[];
  selectedRevisionId: string | null;
  onSelect: (revisionId: string) => void;
}) {
  if (revisions.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No Change Orders yet. Create a draft to capture commercial scope changes.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {revisions.map((revision) => {
        const selected = revision.id === selectedRevisionId;
        return (
          <button
            key={revision.id}
            type="button"
            onClick={() => onSelect(revision.id)}
            className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
              selected
                ? "border-accent bg-accent/5"
                : "border-border bg-surface hover:border-border-strong hover:bg-foreground/[0.02]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">
                {revision.reasoning.slice(0, 80)}
                {revision.reasoning.length > 80 ? "…" : ""}
              </span>
              <StatusBadge
                label={formatRevisionStatus(revision.status)}
                tone={revisionStatusTone(revision.status)}
              />
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-foreground-muted">
              <span>{revision.lines.length} line(s)</span>
              <span>{formatCents(revision.priceDeltaCents)} delta</span>
              <span>{new Date(revision.createdAt).toLocaleString()}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
