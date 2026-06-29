"use client";

import { useActionState, useState } from "react";
import type { QuoteCustomerPreviewDocument } from "@/lib/quote-customer-projection";
import {
  formatMoneyCents,
  formatPaymentAnchorLabel,
} from "@/lib/quote-display";
import {
  acceptQuoteFromSignerTokenAction,
  declineQuoteFromSignerTokenAction,
  requestQuoteChangesFromSignerAction,
  type SignerAcceptState,
  type SignerChangeState,
  type SignerDeclineState,
} from "@/app/q/sign/[recipientToken]/signature-actions";
import { STANDARD_ACCEPTANCE_CONSENT_TEXT } from "@/lib/quote-signature/consent";
import { Check, Download, Loader2, Lock, MessageSquare, X } from "lucide-react";

export function QuoteSignerReview({
  recipientToken,
  document,
  isApproved,
  recipientName,
}: {
  recipientToken: string;
  document: QuoteCustomerPreviewDocument;
  isApproved: boolean;
  recipientName?: string | null;
}) {
  const [showChangeRequest, setShowChangeRequest] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const boundAccept = acceptQuoteFromSignerTokenAction.bind(null, recipientToken);
  const [state, formAction, isPending] = useActionState<SignerAcceptState, FormData>(
    boundAccept,
    {},
  );

  const boundRequestChanges = requestQuoteChangesFromSignerAction.bind(null, recipientToken);
  const [changeState, changeFormAction, isChangePending] = useActionState<
    SignerChangeState,
    FormData
  >(boundRequestChanges, {});

  const boundDecline = declineQuoteFromSignerTokenAction.bind(null, recipientToken);
  const [declineState, declineFormAction, isDeclinePending] = useActionState<
    SignerDeclineState,
    FormData
  >(boundDecline, {});

  if (changeState.success) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
          <MessageSquare className="size-6" />
        </div>
        <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground">Change Request Sent</h2>
        <p className="mx-auto max-w-sm text-sm text-foreground-muted">
          Your feedback has been sent. They will review it and get back to you with an updated proposal.
        </p>
      </div>
    );
  }

  if (declineState.success) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center">
        <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground">Proposal Declined</h2>
        <p className="mx-auto max-w-sm text-sm text-foreground-muted">
          You declined this proposal. The company has been notified.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
            Proposal from
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {document.organizationDisplayName}
          </h1>
          <p className="mt-4 text-sm text-foreground-muted">{document.documentTitle}</p>
        </div>
        <div className="flex flex-col items-end gap-4">
          <a
            href={`/q/sign/${recipientToken}/sent-pdf`}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground transition-all hover:bg-foreground/[0.02]"
          >
            <Download className="size-3" />
            Download PDF
          </a>
          <div>
            <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
              Total
            </p>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {formatMoneyCents(document.totalCents)}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-foreground-subtle">
            Line Items
          </h2>
          <div className="space-y-4">
            {document.lineItems.map((line) => (
              <div key={line.id} className="rounded-xl border border-border bg-surface p-4">
                <p className="font-semibold text-foreground">{line.lineTitle}</p>
                {line.lineDetail ? (
                  <p className="mt-1 text-sm text-foreground-muted">{line.lineDetail}</p>
                ) : null}
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-foreground-muted">
                    {line.quantityDisplay} @ {formatMoneyCents(line.unitAmountCents)}
                  </span>
                  <span className="font-bold tabular-nums text-foreground">
                    {formatMoneyCents(line.lineTotalCents)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {document.paymentSchedule.length > 0 ? (
          <section>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-foreground-subtle">
              Payment Schedule
            </h2>
            <div className="space-y-2">
              {document.paymentSchedule.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
                >
                  <span className="text-foreground">{m.title}</span>
                  <div className="text-right">
                    <span className="font-bold tabular-nums text-foreground">
                      {formatMoneyCents(m.amountCents)}
                    </span>
                    <p className="text-xs font-normal text-foreground-muted">
                      {formatPaymentAnchorLabel(m.anchorType, m.anchorStageName)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {!isApproved && !state.success ? (
        <div className="mt-12 rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <h2 className="mb-2 text-lg font-bold text-foreground">Accept electronically</h2>
          <p className="mb-6 text-sm text-foreground-muted">
            Review the proposal, agree to electronic records, and type your legal name.
          </p>

          <form action={formAction} className="space-y-5">
            <label className="flex items-start gap-3 rounded-lg border border-border bg-background p-4 text-sm">
              <input
                type="checkbox"
                name="consentChecked"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1"
                required
              />
              <span className="text-foreground-muted">{STANDARD_ACCEPTANCE_CONSENT_TEXT}</span>
            </label>

            <div>
              <label className="mb-2 block text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
                Type your full legal name
              </label>
              <input
                name="acceptedByName"
                type="text"
                required
                minLength={2}
                defaultValue={recipientName ?? ""}
                placeholder="Full legal name"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
              />
            </div>

            {state.error ? (
              <p className="rounded-lg border border-danger/10 bg-danger/5 px-3 py-2 text-xs font-medium text-danger">
                {state.error}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={isPending || !consentChecked}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-8 py-3 text-sm font-bold text-accent-contrast shadow-md transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Accept Proposal
                    <Check className="size-4" />
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowChangeRequest(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-3 text-sm font-bold text-foreground transition-all hover:bg-foreground/[0.02] active:scale-[0.98]"
              >
                Request Changes
              </button>
              <button
                type="button"
                onClick={() => setShowDecline(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-3 text-sm font-bold text-foreground-muted transition-all hover:bg-foreground/[0.02] active:scale-[0.98]"
              >
                Decline
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="mt-12 rounded-2xl border border-success/30 bg-success/5 p-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-success text-success-contrast">
            <Check className="size-6" />
          </div>
          <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground">Proposal Accepted</h2>
          <p className="mx-auto max-w-sm text-sm text-foreground-muted">
            Thank you! You have accepted this proposal electronically. The company has been notified.
          </p>
        </div>
      )}

      {showChangeRequest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-tight text-foreground">Request Changes</h3>
              <button
                type="button"
                onClick={() => setShowChangeRequest(false)}
                className="rounded-full p-1 text-foreground-subtle transition-colors hover:bg-foreground/10"
              >
                <X className="size-5" />
              </button>
            </div>
            <form action={changeFormAction} className="space-y-4">
              <textarea
                name="message"
                required
                rows={5}
                placeholder="Describe the changes you'd like..."
                className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground"
              />
              {changeState.error ? (
                <p className="text-xs text-danger">{changeState.error}</p>
              ) : null}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowChangeRequest(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isChangePending}
                  className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-accent-contrast"
                >
                  Send Request
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showDecline ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold text-foreground">Decline Proposal</h3>
            <form action={declineFormAction} className="space-y-4">
              <textarea
                name="reason"
                rows={3}
                placeholder="Optional reason..."
                className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm"
              />
              {declineState.error ? (
                <p className="text-xs text-danger">{declineState.error}</p>
              ) : null}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowDecline(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeclinePending}
                  className="rounded-xl border border-danger/30 px-6 py-2.5 text-sm font-bold text-danger"
                >
                  Decline
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <footer className="mt-20 flex flex-col items-center gap-4 border-t border-border pt-8 text-foreground-subtle">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]">
          <Lock className="size-3" />
          Secure electronic acceptance
        </div>
      </footer>
    </div>
  );
}
