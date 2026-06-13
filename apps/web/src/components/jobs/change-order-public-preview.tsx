"use client";

import { useActionState } from "react";
import { Check, Loader2, Printer } from "lucide-react";
import {
  acceptChangeOrderFromTokenAction,
  type ChangeOrderAcceptState,
} from "@/app/co/[token]/change-order-share-actions";
import type { ChangeOrderCustomerPreviewDocument } from "@/lib/change-order-customer-projection";
import { formatMoneyCents } from "@/lib/quote-display";

export function ChangeOrderPublicPreview({
  token,
  document,
  isAccepted,
}: {
  token: string;
  document: ChangeOrderCustomerPreviewDocument;
  isAccepted: boolean;
}) {
  const boundAccept = acceptChangeOrderFromTokenAction.bind(null, token);
  const [state, formAction, isPending] = useActionState<ChangeOrderAcceptState, FormData>(
    boundAccept,
    {},
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
            Change Order
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{document.changeOrderTitle}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {document.changeOrderNumberLabel} for {document.quoteTitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground"
        >
          <Printer className="size-3" />
          Print / PDF
        </button>
      </div>

      <div className="space-y-8">
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-foreground">Why this is changing</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-muted">{document.reasoning}</p>
        </section>

        <section className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-subtle">
            Scope changes
          </div>
          <ul className="divide-y divide-border">
            {document.lineItems.map((line) => (
              <li key={line.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-foreground-subtle">
                      {line.operation}
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">{line.description}</p>
                    {line.sourceDescription ? (
                      <p className="mt-1 text-xs text-foreground-muted">
                        Source: {line.sourceDescription}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-foreground-muted">
                    <p>{line.quantityDisplay} @ {formatMoneyCents(line.unitPriceCents)}</p>
                    <p className="font-semibold text-foreground">{formatMoneyCents(line.lineTotalCents)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-surface p-6">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-foreground-muted">Current total</span>
              <span className="font-semibold text-foreground">{formatMoneyCents(document.baseTotalCents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground-muted">Change Order delta</span>
              <span className="font-semibold text-foreground">{formatMoneyCents(document.deltaCents)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="font-semibold text-foreground">Revised total</span>
              <span className="text-lg font-bold text-foreground">{formatMoneyCents(document.revisedTotalCents)}</span>
            </div>
          </div>
        </section>

        {!isAccepted ? (
          <section className="rounded-xl border-2 border-accent bg-surface p-6">
            <h2 className="text-lg font-bold text-foreground">Accept this Change Order</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              By accepting, you approve the scope and revised amount shown above.
            </p>
            <form action={formAction} className="mt-5 space-y-4">
              <input
                name="acceptedByName"
                type="text"
                required
                placeholder="Your full name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              {state.error ? (
                <p className="text-xs font-medium text-destructive">{state.error}</p>
              ) : null}
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-bold text-accent-contrast"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Accept Change Order
              </button>
            </form>
          </section>
        ) : (
          <section className="rounded-xl border border-success/30 bg-success/10 p-6">
            <p className="font-semibold text-foreground">Change Order accepted.</p>
          </section>
        )}
      </div>
    </div>
  );
}
