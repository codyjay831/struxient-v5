"use client";

import { useActionState } from "react";
import { Check, Loader2, MessageSquare, Printer } from "lucide-react";
import { ChangeOrderStatus } from "@prisma/client";
import {
  acceptChangeOrderFromTokenAction,
  requestChangeOrderChangesAction,
} from "@/app/co/[token]/change-order-share-actions";
import type {
  ChangeOrderAcceptState,
  ChangeOrderRequestChangesState,
} from "@/app/co/[token]/change-order-share-types";
import type { ChangeOrderCustomerPreviewDocument } from "@/lib/change-order-customer-projection";
import { formatMoneyCents } from "@/lib/quote-display";

export function ChangeOrderPublicPreview({
  token,
  document,
  status,
}: {
  token: string;
  document: ChangeOrderCustomerPreviewDocument;
  status: ChangeOrderStatus;
}) {
  const boundAccept = acceptChangeOrderFromTokenAction.bind(null, token);
  const boundRequestChanges = requestChangeOrderChangesAction.bind(null, token);
  const [acceptState, acceptAction, acceptPending] = useActionState<ChangeOrderAcceptState, FormData>(
    boundAccept,
    {},
  );
  const [requestState, requestAction, requestPending] = useActionState<
    ChangeOrderRequestChangesState,
    FormData
  >(boundRequestChanges, {});

  const isAccepted = status === ChangeOrderStatus.ACCEPTED || status === ChangeOrderStatus.APPLIED;
  const canRespond = status === ChangeOrderStatus.SENT;
  const requestChangesRecorded = status === ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES;

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

      {requestChangesRecorded ? (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
          <p className="font-semibold">Change request received</p>
          <p className="mt-1 text-foreground-muted">
            Your requested changes were sent to the company. They will revise this Change Order and
            send an updated version if needed.
          </p>
        </div>
      ) : null}

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
                    <p>
                      {line.quantityDisplay} @ {formatMoneyCents(line.unitPriceCents)}
                    </p>
                    <p className="font-semibold text-foreground">
                      {formatMoneyCents(line.lineTotalCents)}
                    </p>
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
              <span className="font-semibold text-foreground">
                {formatMoneyCents(document.baseTotalCents)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground-muted">Change Order delta</span>
              <span className="font-semibold text-foreground">
                {formatMoneyCents(document.deltaCents)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="font-semibold text-foreground">Revised total</span>
              <span className="text-lg font-bold text-foreground">
                {formatMoneyCents(document.revisedTotalCents)}
              </span>
            </div>
          </div>
        </section>

        {document.paymentTerms ? (
          <section className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold text-foreground">Payment terms</h2>
            <p className="mt-1 text-xs text-foreground-muted">
              {document.paymentTerms.strategyLabel}
            </p>
            <p className="mt-3 text-sm text-foreground">{document.paymentTerms.customerTermsText}</p>
            <p className="mt-2 text-sm text-foreground-muted">{document.paymentTerms.customerSummary}</p>
            {document.paymentTerms.dueTimingLabel ? (
              <p className="mt-3 text-sm text-foreground">
                <span className="font-medium">Due timing:</span> {document.paymentTerms.dueTimingLabel}
              </p>
            ) : null}
            {document.paymentTerms.depositAmountCents ? (
              <p className="mt-3 text-sm text-foreground">
                <span className="font-medium">Deposit due now:</span>{" "}
                {formatMoneyCents(document.paymentTerms.depositAmountCents)}
                {document.paymentTerms.depositDueLabel
                  ? ` — ${document.paymentTerms.depositDueLabel}`
                  : ""}
              </p>
            ) : null}
            {document.paymentTerms.allocationLines.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-foreground/[0.02] text-left text-xs uppercase tracking-wide text-foreground-subtle">
                      <th className="px-3 py-2 font-medium">Payment</th>
                      <th className="px-3 py-2 font-medium text-right">Current</th>
                      <th className="px-3 py-2 font-medium text-right">Revised</th>
                    </tr>
                  </thead>
                  <tbody>
                    {document.paymentTerms.allocationLines.map((line) => (
                      <tr key={line.title} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-medium text-foreground">{line.title}</td>
                        <td className="px-3 py-2 text-right text-foreground-muted">
                          {formatMoneyCents(line.currentAmountCents)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">
                          {formatMoneyCents(line.newAmountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : document.paymentTerms.affectedPaymentTitle ? (
              <p className="mt-2 text-sm text-foreground-muted">
                Affected payment: {document.paymentTerms.affectedPaymentTitle}
                {document.paymentTerms.targetAmountBeforeCents != null &&
                document.paymentTerms.targetAmountAfterCents != null ? (
                  <>
                    {" "}
                    ({formatMoneyCents(document.paymentTerms.targetAmountBeforeCents)} →{" "}
                    {formatMoneyCents(document.paymentTerms.targetAmountAfterCents)})
                  </>
                ) : null}
              </p>
            ) : null}
            {document.paymentTerms.isCredit ? (
              <p className="mt-2 text-sm text-foreground-muted">
                This credit reduces your remaining balance.
              </p>
            ) : null}
            {document.paymentTerms.dueBeforeAddedWork ? (
              <p className="mt-2 text-sm text-foreground-muted">
                Payment is due before added work begins.
              </p>
            ) : null}
          </section>
        ) : null}

        {canRespond ? (
          <section className="rounded-xl border-2 border-accent bg-surface p-6">
            <h2 className="text-lg font-bold text-foreground">Respond to this Change Order</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              You are approving the scope changes, revised total
              {document.paymentTerms ? ", and payment allocation" : ""} shown above. You can also
              changes for the office to review.
            </p>

            <form action={acceptAction} className="mt-5 space-y-4">
              <input
                name="acceptedByName"
                type="text"
                required
                placeholder="Your full name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              {acceptState.error ? (
                <p className="text-xs font-medium text-destructive">{acceptState.error}</p>
              ) : null}
              {acceptState.success ? (
                <p className="text-xs font-medium text-success">Change Order accepted.</p>
              ) : null}
              <button
                type="submit"
                disabled={acceptPending}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-bold text-accent-contrast"
              >
                {acceptPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Accept Change Order
              </button>
            </form>

            <form action={requestAction} className="mt-8 space-y-4 border-t border-border pt-6">
              <h3 className="text-sm font-semibold text-foreground">Request changes</h3>
              <textarea
                name="message"
                required
                minLength={5}
                placeholder="Describe what you would like changed."
                className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              {requestState.error ? (
                <p className="text-xs font-medium text-destructive">{requestState.error}</p>
              ) : null}
              {requestState.success ? (
                <p className="text-xs font-medium text-success">
                  Your change request was sent to the company.
                </p>
              ) : null}
              <button
                type="submit"
                disabled={requestPending}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2 text-sm font-semibold text-foreground"
              >
                {requestPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MessageSquare className="size-4" />
                )}
                Request changes
              </button>
            </form>
          </section>
        ) : null}

        {isAccepted ? (
          <section className="rounded-xl border border-success/30 bg-success/10 p-6">
            <p className="font-semibold text-foreground">Change Order accepted.</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
