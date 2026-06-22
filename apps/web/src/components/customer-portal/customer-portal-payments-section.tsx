"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { recordCustomerPaymentViewedAction } from "@/app/portal/portal-actions";

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type PaymentItem = {
  id: string;
  title: string;
  amountCents: number;
  paymentUrl: string | null;
  paymentUrlLabel: string | null;
};

export function CustomerPortalPaymentsSection({
  accessId,
  payments,
  companyName,
}: {
  accessId: string;
  payments: {
    hasAmountDue: boolean;
    totalDueCents: number;
    items: PaymentItem[];
  };
  companyName: string;
}) {
  const [pending, startTransition] = useTransition();

  if (!payments.hasAmountDue) {
    return <p className="text-sm text-foreground-muted">No payment is due right now.</p>;
  }

  const hasPayLinks = payments.items.some((item) => item.paymentUrl);

  function acknowledge() {
    startTransition(async () => {
      await recordCustomerPaymentViewedAction(accessId);
    });
  }

  function openPaymentLink(item: PaymentItem) {
    if (!item.paymentUrl) return;
    startTransition(async () => {
      await recordCustomerPaymentViewedAction(accessId, item.id);
      window.open(item.paymentUrl!, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium text-foreground">
        Amount due: {formatMoney(payments.totalDueCents)}
      </p>
      <ul className="space-y-2 text-foreground-muted">
        {payments.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {item.title}: {formatMoney(item.amountCents)}
            </span>
            {item.paymentUrl ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => openPaymentLink(item)}
              >
                {pending ? "Opening…" : item.paymentUrlLabel?.trim() || "Pay now"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {!hasPayLinks ? (
        <>
          <p className="text-foreground-muted">
            Contact {companyName} for payment instructions or a secure payment link.
          </p>
          <Button type="button" variant="secondary" disabled={pending} onClick={acknowledge}>
            {pending ? "Saving…" : "I understand payment is due"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
