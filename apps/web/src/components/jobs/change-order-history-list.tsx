"use client";

import { ChangeOrderStatus } from "@prisma/client";
import { formatCents } from "@/lib/job-payment-display";
import { StatusBadge } from "@/components/ui/status-badge";
import type { LoadedChangeOrderRevision } from "@/lib/change-order-loader";

function revisionStatusTone(
  status: ChangeOrderStatus,
): "draft" | "approved" | "neutral" | "warning" {
  switch (status) {
    case ChangeOrderStatus.DRAFT:
      return "draft";
    case ChangeOrderStatus.ACCEPTED:
      return "approved";
    case ChangeOrderStatus.APPLIED:
      return "approved";
    case ChangeOrderStatus.REJECTED:
      return "warning";
    default:
      return "neutral";
  }
}

function formatRevisionStatus(status: ChangeOrderStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function ChangeOrderHistoryList({
  revisions,
  selectedRevisionId,
  onSelect,
  jobId,
}: {
  revisions: LoadedChangeOrderRevision[];
  selectedRevisionId: string | null;
  onSelect: (revisionId: string) => void;
  jobId: string;
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
                {`CO-${String(revision.number).padStart(3, "0")} · ${revision.title}`}
              </span>
              <StatusBadge
                label={formatRevisionStatus(revision.status)}
                tone={revisionStatusTone(revision.status)}
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-foreground-muted">
              <span>{revision.lines.length} line(s)</span>
              <span>{formatCents(revision.priceDeltaCents)} delta</span>
              <span>{new Date(revision.createdAt).toLocaleString()}</span>
              <a
                href={`/jobs/${jobId}/change-orders/${revision.id}`}
                className="text-accent hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                Open detail
              </a>
            </div>
          </button>
        );
      })}
    </div>
  );
}
