"use client";

import { QuoteScopeRevisionLineOperation } from "@prisma/client";
import type { ChangeOrderLineDiff } from "@/lib/change-order-flow";

function operationLabel(operation: QuoteScopeRevisionLineOperation): string {
  switch (operation) {
    case QuoteScopeRevisionLineOperation.ADD:
      return "Add";
    case QuoteScopeRevisionLineOperation.MODIFY:
      return "Modify";
    case QuoteScopeRevisionLineOperation.REMOVE:
      return "Remove";
  }
}

export function ChangeOrderLineDiffPreview({
  diffs,
}: {
  diffs: ChangeOrderLineDiff[];
}) {
  if (diffs.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No proposed changes yet. Select a scope item or edit the proposed values.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {diffs.map((diff) => (
        <div
          key={`diff-${diff.lineIndex}-${diff.operation}`}
          className="rounded-lg border border-border bg-surface px-3 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              Line {diff.lineIndex + 1}: {operationLabel(diff.operation)}
            </p>
            {diff.sourceDescription ? (
              <p className="text-xs text-foreground-muted">{diff.sourceDescription}</p>
            ) : null}
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {diff.fields.map((field) => (
              <li key={`${diff.lineIndex}-${field.label}`} className="text-foreground-muted">
                <span className="font-medium text-foreground">{field.label}:</span>{" "}
                {field.before} → {field.after}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
