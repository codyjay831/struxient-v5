"use client";

import { formatCents } from "@/lib/job-payment-display";
import type { ChangeOrderScopeItemSnapshot } from "@/lib/change-order-flow";

function ScopeValueRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd
        className={`mt-0.5 text-sm ${
          highlight ? "font-medium text-warning" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function ChangeOrderSourceComparisonCard({
  scopeItem,
}: {
  scopeItem: ChangeOrderScopeItemSnapshot;
}) {
  const signed = scopeItem.signedQuote;
  const currentTotal =
    scopeItem.unitPriceCents != null
      ? formatCents(Math.round(Number(scopeItem.quantity) * scopeItem.unitPriceCents))
      : "—";

  const signedDiffersFromCurrent =
    signed != null &&
    (signed.description.trim() !== scopeItem.description.trim() ||
      signed.quantity !== scopeItem.quantity ||
      signed.unitAmountCents !== (scopeItem.unitPriceCents ?? signed.unitAmountCents));

  return (
    <div className="rounded-lg border border-border bg-foreground/[0.02] p-4 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Current job scope</h4>
        <p className="mt-1 text-xs text-foreground-muted">
          Active scope on this job right now.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <ScopeValueRow label="Description" value={scopeItem.description} />
        <ScopeValueRow label="Quantity" value={scopeItem.quantity} />
        <ScopeValueRow
          label="Unit price"
          value={formatCents(scopeItem.unitPriceCents)}
        />
        <ScopeValueRow label="Line total" value={currentTotal} />
        <ScopeValueRow
          label="Execution relevant"
          value={scopeItem.executionRelevant ? "Yes" : "No"}
        />
      </dl>

      {signed ? (
        <div className="border-t border-border pt-4 space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Signed quote scope</h4>
            <p className="mt-1 text-xs text-foreground-muted">
              What the customer originally agreed to on the signed quote.
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <ScopeValueRow
              label="Description"
              value={signed.customerScopeTitle?.trim() || signed.description}
              highlight={signedDiffersFromCurrent && signed.description !== scopeItem.description}
            />
            <ScopeValueRow
              label="Quantity"
              value={signed.quantity}
              highlight={signedDiffersFromCurrent && signed.quantity !== scopeItem.quantity}
            />
            <ScopeValueRow
              label="Unit price"
              value={formatCents(signed.unitAmountCents)}
              highlight={
                signedDiffersFromCurrent &&
                signed.unitAmountCents !== scopeItem.unitPriceCents
              }
            />
            <ScopeValueRow
              label="Line total"
              value={formatCents(signed.lineTotalCents)}
            />
          </dl>
          {signed.customerScopeDescription ? (
            <p className="text-xs text-foreground-muted">{signed.customerScopeDescription}</p>
          ) : null}
        </div>
      ) : null}

      {scopeItem.priorRevision ? (
        <div className="border-t border-border pt-4">
          <p className="text-xs text-foreground-muted">
            This scope item came from a prior Change Order:{" "}
            <span className="font-medium text-foreground">
              {scopeItem.priorRevision.description}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
