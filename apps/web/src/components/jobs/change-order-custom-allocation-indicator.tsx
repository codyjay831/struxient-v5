"use client";

import type { ChangeOrderPaymentImpactV2 } from "@/lib/change-order/payment-impact-schema";
import { getCustomAllocationStaffNote } from "@/lib/change-order/payment-impact-allocation";

export function ChangeOrderCustomAllocationIndicator({
  impact,
}: {
  impact: ChangeOrderPaymentImpactV2;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
      <span className="inline-flex rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
        Custom allocation
      </span>
      <p className="mt-2 text-xs text-foreground-muted">{getCustomAllocationStaffNote(impact)}</p>
    </div>
  );
}
