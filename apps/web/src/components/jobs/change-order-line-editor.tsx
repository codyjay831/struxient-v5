"use client";

import { QuoteScopeRevisionLineOperation } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChangeOrderLineDraft, ChangeOrderScopeItemSnapshot } from "@/lib/change-order-flow";

const OPERATION_OPTIONS: Array<{ value: QuoteScopeRevisionLineOperation; label: string }> = [
  { value: QuoteScopeRevisionLineOperation.ADD, label: "Add scope" },
  { value: QuoteScopeRevisionLineOperation.MODIFY, label: "Modify scope" },
  { value: QuoteScopeRevisionLineOperation.REMOVE, label: "Remove scope" },
];

function emptyLine(): ChangeOrderLineDraft {
  return {
    operation: QuoteScopeRevisionLineOperation.ADD,
    description: "",
    quantity: "1",
    priceDeltaCents: 0,
    executionRelevant: true,
  };
}

export function ChangeOrderLineEditor({
  lines,
  activeScopeItems,
  onChange,
  disabled,
}: {
  lines: ChangeOrderLineDraft[];
  activeScopeItems: ChangeOrderScopeItemSnapshot[];
  onChange: (lines: ChangeOrderLineDraft[]) => void;
  disabled?: boolean;
}) {
  function updateLine(index: number, patch: Partial<ChangeOrderLineDraft>) {
    const next = lines.map((line, lineIndex) =>
      lineIndex === index ? { ...line, ...patch } : line,
    );
    onChange(next);
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, lineIndex) => lineIndex !== index));
  }

  function addLine() {
    onChange([...lines, emptyLine()]);
  }

  return (
    <div className="space-y-3">
      {lines.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          Add at least one line describing the commercial scope change.
        </p>
      ) : null}

      {lines.map((line, index) => {
        const needsSource =
          line.operation === QuoteScopeRevisionLineOperation.MODIFY ||
          line.operation === QuoteScopeRevisionLineOperation.REMOVE;

        return (
          <div
            key={`line-${index}`}
            className="rounded-lg border border-border bg-surface p-3 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Line {index + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => removeLine(index)}
                aria-label={`Remove line ${index + 1}`}
              >
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground-muted">Operation</span>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={line.operation}
                  disabled={disabled}
                  onChange={(event) => {
                    const operation = event.target.value as QuoteScopeRevisionLineOperation;
                    updateLine(index, {
                      operation,
                      sourceJobScopeItemId:
                        operation === QuoteScopeRevisionLineOperation.ADD
                          ? null
                          : line.sourceJobScopeItemId,
                    });
                  }}
                >
                  {OPERATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {needsSource ? (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground-muted">Source scope item</span>
                  <select
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={line.sourceJobScopeItemId ?? ""}
                    disabled={disabled}
                    onChange={(event) =>
                      updateLine(index, {
                        sourceJobScopeItemId: event.target.value || null,
                      })
                    }
                  >
                    <option value="">Select active scope…</option>
                    {activeScopeItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.description}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground-muted">Description</span>
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={line.description}
                disabled={disabled}
                onChange={(event) => updateLine(index, { description: event.target.value })}
                placeholder="Describe the scope change"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground-muted">Quantity</span>
                <input
                  type="text"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={line.quantity}
                  disabled={disabled}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground-muted">Price delta (¢)</span>
                <input
                  type="number"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={line.priceDeltaCents ?? 0}
                  disabled={disabled}
                  onChange={(event) =>
                    updateLine(index, {
                      priceDeltaCents: Number.parseInt(event.target.value, 10) || 0,
                    })
                  }
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={line.executionRelevant !== false}
                  disabled={disabled}
                  onChange={(event) =>
                    updateLine(index, { executionRelevant: event.target.checked })
                  }
                />
                Execution relevant
              </label>
            </div>
          </div>
        );
      })}

      <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={addLine}>
        <Plus className="size-3.5" />
        Add line
      </Button>
    </div>
  );
}

export { emptyLine as createEmptyChangeOrderLine };
