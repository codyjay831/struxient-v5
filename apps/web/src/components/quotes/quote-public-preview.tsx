"use client";

import { useActionState, useState } from "react";
import type { QuoteCustomerPreviewDocument } from "@/lib/quote-customer-projection";
import { 
  formatMoneyCents, 
  formatPaymentAnchorLabel 
} from "@/lib/quote-display";
import { 
  acceptQuoteFromTokenAction, 
  requestQuoteChangesAction,
  type QuoteAcceptState,
  type QuoteRequestChangesState
} from "@/app/q/[token]/quote-share-actions";
import { Check, Loader2, Lock, MessageSquare, Printer, X } from "lucide-react";

export function QuotePublicPreview({
  token,
  document,
  isApproved,
}: {
  token: string;
  document: QuoteCustomerPreviewDocument;
  isApproved: boolean;
}) {
  const totalScheduledCents = document.paymentSchedule.reduce(
    (sum, m) => sum + m.amountCents,
    0,
  );
  const [showChangeRequest, setShowChangeRequest] = useState(false);
  const handlePrint = () => {
    window.print();
  };
  const boundAccept = acceptQuoteFromTokenAction.bind(null, token);
  const [state, formAction, isPending] = useActionState<QuoteAcceptState, FormData>(
    boundAccept,
    {},
  );

  const boundRequestChanges = requestQuoteChangesAction.bind(null, token);
  const [changeState, changeFormAction, isChangePending] = useActionState<QuoteRequestChangesState, FormData>(
    boundRequestChanges,
    {},
  );

  if (changeState.success) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent mb-4">
          <MessageSquare className="size-6" />
        </div>
        <h2 className="text-xl font-bold text-foreground tracking-tight mb-2">
          Change Request Sent
        </h2>
        <p className="text-sm text-foreground-muted max-w-sm mx-auto">
          Thank you! Your feedback has been sent to the company. They will review it and get back to you with an updated proposal.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 text-sm font-medium text-accent hover:underline"
        >
          Back to proposal
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle mb-1">
            Proposal from
          </p>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {document.organizationDisplayName}
          </h1>
          <p className="mt-4 text-sm text-foreground-muted">
            {document.documentTitle}
          </p>
        </div>
        <div className="text-right flex flex-col items-end gap-4">
          <div className="print:hidden">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground hover:bg-foreground/[0.02] transition-all"
            >
              <Printer className="size-3" />
              Print / PDF
            </button>
          </div>
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle mb-1">
              Total
            </p>
            <p className="text-3xl font-bold text-foreground tabular-nums">
              {formatMoneyCents(document.totalCents)}
            </p>
            <p className="mt-1 text-xs text-foreground-subtle">
              Updated {new Date(document.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12">
        {/* Line Items */}
        <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
          <div className="bg-foreground/[0.02] px-6 py-4 border-b border-border">
            <h2 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
              Scope of work
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {document.lineItems.map((line) => (
              <li key={line.id} className="px-6 py-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-foreground leading-tight">
                      {line.lineTitle}
                    </h3>
                    {line.lineDetail && (
                      <p className="mt-2 text-sm text-foreground-muted leading-relaxed whitespace-pre-wrap">
                        {line.lineDetail}
                      </p>
                    )}
                    {(line.includedNotes || line.excludedNotes) && (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {line.includedNotes && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-success-strong mb-1">
                              Included
                            </p>
                            <p className="text-xs text-foreground-muted leading-relaxed">
                              {line.includedNotes}
                            </p>
                          </div>
                        )}
                        {line.excludedNotes && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle mb-1">
                              Not included
                            </p>
                            <p className="text-xs text-foreground-muted leading-relaxed">
                              {line.excludedNotes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right shrink-0">
                    <p className="text-sm font-bold text-foreground">
                      {formatMoneyCents(line.lineTotalCents)}
                    </p>
                    <p className="text-[10px] text-foreground-subtle uppercase font-medium tracking-wider">
                      {line.quantityDisplay} @ {formatMoneyCents(line.unitAmountCents)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="bg-foreground/[0.02] px-6 py-6 border-t border-border flex justify-between items-center">
            <span className="text-sm font-bold text-foreground uppercase tracking-wider">Total</span>
            <span className="text-xl font-bold text-foreground tabular-nums">
              {formatMoneyCents(document.totalCents)}
            </span>
          </div>
        </div>

        {/* Payment Schedule */}
        {document.paymentSchedule.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
            <div className="bg-foreground/[0.02] px-6 py-4 border-b border-border">
              <h2 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                Payment schedule
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {document.paymentSchedule.map((milestone) => (
                <li key={milestone.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">
                        {milestone.title}
                      </h3>
                      <p className="text-xs text-foreground-muted">
                        {formatPaymentAnchorLabel(milestone.anchorType, milestone.anchorStageName)}
                      </p>
                    </div>
                    <div className="text-sm font-bold text-foreground tabular-nums">
                      {formatMoneyCents(milestone.amountCents)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="bg-foreground/[0.02] px-6 py-4 border-t border-border flex justify-between items-center">
              <span className="text-[10px] font-bold text-foreground-subtle uppercase tracking-wider">
                Total Scheduled
              </span>
              <div className="text-right">
                <span
                  className={`text-sm font-bold ${
                    totalScheduledCents !== document.totalCents
                      ? "text-warning"
                      : "text-foreground"
                  }`}
                >
                  {formatMoneyCents(totalScheduledCents)}
                </span>
                {totalScheduledCents !== document.totalCents && (
                  <p className="text-[9px] text-warning font-medium mt-0.5">
                    Does not match proposal total (
                    {formatMoneyCents(document.totalCents)})
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Accept / Decline */}
        {!isApproved ? (
          <div className="rounded-2xl border-2 border-accent bg-surface p-8 shadow-lg print:hidden">
            <div className="max-w-md">
              <h2 className="text-xl font-bold text-foreground tracking-tight mb-2">
                Ready to proceed?
              </h2>
              <p className="text-sm text-foreground-muted leading-relaxed mb-8">
                By accepting this proposal, you agree to the scope of work and pricing outlined above. 
                The company will be notified and will follow up with next steps.
              </p>

              <form action={formAction} className="space-y-6">
                <div className="max-w-md">
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle mb-2">
                      Your full name
                    </label>
                    <input
                      name="acceptedByName"
                      type="text"
                      required
                      placeholder="Type your name to sign"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10 transition-all"
                    />
                  </div>

                  <div className="mt-6 flex items-start gap-3">
                    <input
                      id="terms"
                      name="terms"
                      type="checkbox"
                      required
                      className="mt-1 size-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <label htmlFor="terms" className="text-xs text-foreground-muted leading-relaxed">
                      I agree to the scope of work, pricing, and terms outlined in this proposal. 
                      I understand that this electronic signature is legally binding.
                    </label>
                  </div>
                </div>

                {state.error && (
                  <p className="text-xs font-medium text-danger bg-danger/5 rounded-lg px-3 py-2 border border-danger/10">
                    {state.error}
                  </p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-8 py-3 text-sm font-bold text-accent-contrast hover:opacity-90 disabled:opacity-50 transition-all shadow-md active:scale-[0.98]"
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
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-3 text-sm font-bold text-foreground hover:bg-foreground/[0.02] transition-all active:scale-[0.98]"
                  >
                    Request Changes
                  </button>
                </div>
              </form>
            </div>

            {showChangeRequest && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-foreground tracking-tight">
                      Request Changes
                    </h3>
                    <button 
                      onClick={() => setShowChangeRequest(false)}
                      className="rounded-full p-1 text-foreground-subtle hover:bg-foreground/10 transition-colors"
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                  
                  <p className="text-sm text-foreground-muted mb-6 leading-relaxed">
                    Tell the company what you&apos;d like to change in this proposal. They will receive your message and can send you an updated version.
                  </p>

                  <form action={changeFormAction} className="space-y-6">
                    <div>
                      <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle mb-2">
                        Your message
                      </label>
                      <textarea
                        name="message"
                        required
                        rows={5}
                        placeholder="e.g. Can we move the start date? I'd like to add another room..."
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10 transition-all resize-none"
                      />
                    </div>

                    {changeState.error && (
                      <p className="text-xs font-medium text-danger bg-danger/5 rounded-lg px-3 py-2 border border-danger/10">
                        {changeState.error}
                      </p>
                    )}

                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setShowChangeRequest(false)}
                        className="rounded-xl px-6 py-2.5 text-sm font-bold text-foreground-muted hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isChangePending}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-8 py-2.5 text-sm font-bold text-accent-contrast hover:opacity-90 disabled:opacity-50 transition-all shadow-md active:scale-[0.98]"
                      >
                        {isChangePending ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            Send Request
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-success/30 bg-success/5 p-8 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success text-success-contrast mb-4">
              <Check className="size-6" />
            </div>
            <h2 className="text-xl font-bold text-foreground tracking-tight mb-2">
              Proposal Accepted
            </h2>
            <p className="text-sm text-foreground-muted max-w-sm mx-auto">
              Thank you! You have accepted this proposal. The company has been notified and will be in touch soon.
            </p>
          </div>
        )}
      </div>

      <footer className="mt-20 pt-8 border-t border-border flex flex-col items-center gap-4 text-foreground-subtle print:hidden">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]">
          <Lock className="size-3" />
          Secure Proposal
        </div>
        <p className="text-[10px]">
          &copy; {new Date().getFullYear()} {document.organizationDisplayName} · Powered by Struxient
        </p>
      </footer>
    </div>
  );
}
