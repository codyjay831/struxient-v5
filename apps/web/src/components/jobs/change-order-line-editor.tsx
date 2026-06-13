"use client";

import { ChangeOrderLineOperation } from "@prisma/client";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildProposedLineFromSource,
  formatCentsAsDollarInput,
  parseDollarInputToCents,
  scopeItemsById,
  type ChangeOrderLineDraft,
  type ChangeOrderScopeItemSnapshot,
} from "@/lib/change-order-flow";
import { ChangeOrderSourceComparisonCard } from "@/components/jobs/change-order-source-comparison-card";

const OPERATION_OPTIONS: Array<{ value: ChangeOrderLineOperation; label: string }> = [
  { value: ChangeOrderLineOperation.ADD, label: "Add scope" },
  { value: ChangeOrderLineOperation.MODIFY, label: "Modify scope" },
  { value: ChangeOrderLineOperation.REMOVE, label: "Remove scope" },
];

function emptyLine(): ChangeOrderLineDraft {
  return {
    operation: ChangeOrderLineOperation.ADD,
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
  showAdvancedControls = true,
}: {
  lines: ChangeOrderLineDraft[];
  activeScopeItems: ChangeOrderScopeItemSnapshot[];
  onChange: (lines: ChangeOrderLineDraft[]) => void;
  disabled?: boolean;
  showAdvancedControls?: boolean;
}) {
  const scopeMap = scopeItemsById(activeScopeItems);

  function updateLine(index: number, patch: Partial<ChangeOrderLineDraft>) {
    const next = lines.map((line, lineIndex) =>
      lineIndex === index ? { ...line, ...patch } : line,
    );
    onChange(next);
  }

  function applySourceSelection(index: number, sourceId: string | null) {
    const line = lines[index];
    if (!sourceId) {
      updateLine(index, { sourceJobScopeItemId: null });
      return;
    }

    const sourceItem = scopeMap.get(sourceId);
    if (!sourceItem) {
      updateLine(index, { sourceJobScopeItemId: sourceId });
      return;
    }

    if (
      line.operation === ChangeOrderLineOperation.MODIFY ||
      line.operation === ChangeOrderLineOperation.REMOVE
    ) {
      updateLine(
        index,
        buildProposedLineFromSource(sourceItem, line.operation),
      );
      return;
    }

    updateLine(index, { sourceJobScopeItemId: sourceId });
  }

  function resetLineToSource(index: number) {
    const line = lines[index];
    const sourceItem = line.sourceJobScopeItemId
      ? scopeMap.get(line.sourceJobScopeItemId)
      : null;
    if (
      !sourceItem ||
      (line.operation !== ChangeOrderLineOperation.MODIFY &&
        line.operation !== ChangeOrderLineOperation.REMOVE)
    ) {
      return;
    }
    updateLine(index, buildProposedLineFromSource(sourceItem, line.operation));
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
          line.operation === ChangeOrderLineOperation.MODIFY ||
          line.operation === ChangeOrderLineOperation.REMOVE;
        const sourceItem = line.sourceJobScopeItemId
          ? scopeMap.get(line.sourceJobScopeItemId) ?? null
          : null;
        const isRemove = line.operation === ChangeOrderLineOperation.REMOVE;

        return (
          <div
            key={`line-${index}`}
            className="rounded-lg border border-border bg-surface p-3 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Line {index + 1}
              </span>
              <div className="flex flex-wrap gap-2">
                {sourceItem &&
                (line.operation === ChangeOrderLineOperation.MODIFY ||
                  line.operation === ChangeOrderLineOperation.REMOVE) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => resetLineToSource(index)}
                  >
                    <RotateCcw className="size-3.5" />
                    Use current values
                  </Button>
                ) : null}
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
            </div>

            {showAdvancedControls ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground-muted">Operation</span>
                  <select
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={line.operation}
                    disabled={disabled}
                    onChange={(event) => {
                      const operation = event.target.value as ChangeOrderLineOperation;
                      if (
                        operation === ChangeOrderLineOperation.MODIFY ||
                        operation === ChangeOrderLineOperation.REMOVE
                      ) {
                        const sourceId = line.sourceJobScopeItemId;
                        if (sourceId && scopeMap.has(sourceId)) {
                          updateLine(
                            index,
                            buildProposedLineFromSource(scopeMap.get(sourceId)!, operation),
                          );
                          return;
                        }
                      }
                      updateLine(index, {
                        operation,
                        sourceJobScopeItemId:
                          operation === ChangeOrderLineOperation.ADD
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
                    <span className="text-xs font-medium text-foreground-muted">
                      Source scope item
                    </span>
                    <select
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={line.sourceJobScopeItemId ?? ""}
                      disabled={disabled}
                      onChange={(event) =>
                        applySourceSelection(index, event.target.value || null)
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
            ) : needsSource ? (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground-muted">
                  Source scope item
                </span>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={line.sourceJobScopeItemId ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    applySourceSelection(index, event.target.value || null)
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

            {sourceItem ? <ChangeOrderSourceComparisonCard scopeItem={sourceItem} /> : null}

            <div className={isRemove ? "opacity-70" : undefined}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Proposed change
              </p>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground-muted">Description</span>
                <input
                  type="text"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={line.description}
                  disabled={disabled || isRemove}
                  onChange={(event) => updateLine(index, { description: event.target.value })}
                  placeholder="Describe the scope change"
                />
              </label>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground-muted">Quantity</span>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={line.quantity}
                    disabled={disabled || isRemove}
                    onChange={(event) => updateLine(index, { quantity: event.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground-muted">Price delta ($)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={formatCentsAsDollarInput(line.priceDeltaCents ?? 0)}
                    disabled={disabled}
                    onChange={(event) =>
                      updateLine(index, {
                        priceDeltaCents: parseDollarInputToCents(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={line.executionRelevant !== false}
                    disabled={disabled || isRemove}
                    onChange={(event) =>
                      updateLine(index, { executionRelevant: event.target.checked })
                    }
                  />
                  Execution relevant
                </label>
              </div>
            </div>
          </div>
        );
      })}

      {showAdvancedControls ? (
        <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={addLine}>
          <Plus className="size-3.5" />
          Add another line
        </Button>
      ) : null}
    </div>
  );
}

export { emptyLine as createEmptyChangeOrderLine };
