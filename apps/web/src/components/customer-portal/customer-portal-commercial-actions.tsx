"use client";

import { useTransition } from "react";
import { ChangeOrderStatus, QuoteStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import type { CustomerProjectPortalDocument } from "@/lib/customer-portal/presenter";
import {
  openChangeOrderFromPortalAction,
  openQuoteFromPortalAction,
  recordCustomerPaymentViewedAction,
} from "@/app/portal/portal-actions";

export function CustomerPortalNextActionButton({
  accessId,
  nextAction,
}: {
  accessId: string;
  nextAction: CustomerProjectPortalDocument["nextAction"];
}) {
  const [pending, startTransition] = useTransition();

  if (nextAction.action === "OPEN_QUOTE") {
    return (
      <Button
        type="button"
        variant="primary"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await openQuoteFromPortalAction(accessId);
          })
        }
      >
        {pending ? "Opening…" : "Review quote"}
      </Button>
    );
  }

  if (nextAction.action === "OPEN_CHANGE_ORDER" && nextAction.changeOrderId) {
    return (
      <Button
        type="button"
        variant="primary"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await openChangeOrderFromPortalAction(accessId, nextAction.changeOrderId!);
          })
        }
      >
        {pending ? "Opening…" : "Review change order"}
      </Button>
    );
  }

  if (nextAction.href) {
    const isExternal = nextAction.href.startsWith("http");
    if (isExternal) {
      return (
        <Button
          type="button"
          variant="primary"
          className="w-full"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await recordCustomerPaymentViewedAction(accessId);
              window.open(nextAction.href!, "_blank", "noopener,noreferrer");
            });
          }}
        >
          {pending ? "Opening…" : "Pay now"}
        </Button>
      );
    }
    return (
      <a
        href={nextAction.href}
        className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Continue
      </a>
    );
  }

  return null;
}

export function CustomerPortalQuoteChangeOrderSection({
  accessId,
  quotes,
  changeOrders,
}: {
  accessId: string;
  quotes: CustomerProjectPortalDocument["quotes"];
  changeOrders: CustomerProjectPortalDocument["changeOrders"];
}) {
  const [pendingQuote, startQuote] = useTransition();
  const [pendingCoId, setPendingCoId] = useTransition();

  return (
    <>
      {quotes ? (
        <p className="text-sm text-foreground-muted">
          Quote status: <span className="text-foreground">{quotes.status.toLowerCase()}</span>
          {quotes.acceptedAt
            ? ` · accepted ${quotes.acceptedAt.toLocaleDateString()}`
            : ""}
        </p>
      ) : (
        <p className="text-sm text-foreground-muted">No quote is linked to this project yet.</p>
      )}
      {quotes?.status === QuoteStatus.SENT ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            disabled={pendingQuote}
            onClick={() => startQuote(async () => openQuoteFromPortalAction(accessId))}
          >
            {pendingQuote ? "Opening…" : "Review quote"}
          </Button>
        </div>
      ) : null}
      {changeOrders.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {changeOrders.map((co) => (
            <li
              key={co.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="text-foreground-muted">
                CO #{co.number}: {co.title} ({co.status.toLowerCase()})
              </span>
              {co.status === ChangeOrderStatus.SENT && co.canReview ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pendingCoId}
                  onClick={() =>
                    setPendingCoId(async () => openChangeOrderFromPortalAction(accessId, co.id))
                  }
                >
                  Review
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
