"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  CHANGE_ORDER_PAYMENT_STRATEGY_LABELS,
  parseChangeOrderPaymentImpact,
  isPaymentImpactV2,
  type ChangeOrderPaymentImpactAny,
} from "@/lib/change-order/payment-impact-schema";
import { reviewModelFromImpact } from "@/lib/change-order/payment-impact-allocation";
import {
  derivePaymentImpactWarnings,
  getStaffPaymentAfterApplySummary,
  type JobPaymentRequirementForResolver,
} from "@/lib/change-order/payment-impact-resolver";
import { formatCents, formatJobPaymentStatus } from "@/lib/job-payment-display";
import { ChangeOrderPaymentPlanReviewDrawer } from "@/components/jobs/change-order-payment-plan-review-drawer";

export function ChangeOrderPaymentImpactCard({
  priceDeltaCents,
  paymentImpactJson,
  paymentRequirements,
  jobPlanVersion,
  changeOrderNumber,
  editable,
  paymentImpactSaved = true,
  paymentImpactChanged = false,
  paymentImpactReady = true,
  sendBlockedReason = null,
  onChange,
}: {
  priceDeltaCents: number;
  paymentImpactJson: unknown;
  paymentRequirements: JobPaymentRequirementForResolver[];
  jobPlanVersion: number;
  changeOrderNumber?: number;
  editable: boolean;
  paymentImpactSaved?: boolean;
  paymentImpactChanged?: boolean;
  paymentImpactReady?: boolean;
  sendBlockedReason?: string | null;
  onChange: (impact: ChangeOrderPaymentImpactAny | null) => void;
}) {
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const parsedStored = useMemo(
    () => parseChangeOrderPaymentImpact(paymentImpactJson),
    [paymentImpactJson],
  );

  const activeImpact = parsedStored.ok ? parsedStored.impact : null;
  const preview = activeImpact?.resolvedPreview ?? null;

  const reviewModel = useMemo(
    () =>
      reviewModelFromImpact({
        priceDeltaCents,
        requirements: paymentRequirements,
        impact: activeImpact,
      }),
    [priceDeltaCents, paymentRequirements, activeImpact],
  );

  const warnings = derivePaymentImpactWarnings({
    priceDeltaCents,
    strategy: activeImpact?.strategy ?? null,
    requirements: paymentRequirements,
    targetPaymentRequirementId: preview?.targetPaymentRequirementId ?? null,
  });

  const adjustedRows = reviewModel.rows.filter((row) => row.adjustmentCents !== 0);
  const isCredit = activeImpact?.strategy === "CREDIT_REMAINING_BALANCE" || priceDeltaCents < 0;

  if (priceDeltaCents === 0) {
    return (
      <div className="rounded-lg border border-border bg-foreground/[0.02] p-4">
        <h3 className="text-sm font-semibold text-foreground">Payment terms</h3>
        <p className="mt-1 text-xs text-foreground-muted">
          Zero-dollar Change Orders do not require payment terms.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-foreground/[0.02] p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Payment terms</h3>
            <p className="mt-1 text-xs text-foreground-muted">
              Review how this Change Order fits into the job payment plan. Saved with commercial
              changes.
            </p>
          </div>
          {editable ? (
            paymentImpactChanged ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
                <AlertTriangle className="size-3.5" />
                Unsaved
              </span>
            ) : paymentImpactSaved && paymentImpactReady ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-1 text-xs font-medium text-success">
                <CheckCircle2 className="size-3.5" />
                Saved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
                <AlertTriangle className="size-3.5" />
                Not ready to send
              </span>
            )
          ) : null}
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-foreground-muted">Change Order amount</dt>
            <dd className="font-medium text-foreground">{formatCents(priceDeltaCents)}</dd>
          </div>
          <div>
            <dt className="text-foreground-muted">Payment approach</dt>
            <dd className="font-medium text-foreground">
              {preview?.strategyLabel ??
                (activeImpact
                  ? CHANGE_ORDER_PAYMENT_STRATEGY_LABELS[activeImpact.strategy]
                  : "Not configured")}
            </dd>
          </div>
        </dl>

        {editable ? (
          <button
            ref={reviewButtonRef}
            type="button"
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-foreground/[0.04]"
            onClick={() => setDrawerOpen(true)}
          >
            {activeImpact ? "Review payment plan" : "Choose payment plan"}
          </button>
        ) : null}

        {activeImpact ? (
          <>
            <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Customer payment terms
              </p>
              <p className="mt-1 text-foreground">{activeImpact.customerTermsText}</p>
            </div>

            {preview?.depositAmountCents ? (
              <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  Deposit due now
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {formatCents(preview.depositAmountCents)} — {preview.depositDueLabel}
                </p>
              </div>
            ) : null}

            {adjustedRows.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-foreground/[0.02] text-left text-xs uppercase tracking-wide text-foreground-muted">
                      <th className="px-3 py-2 font-medium">Payment</th>
                      <th className="px-3 py-2 font-medium text-right">Current</th>
                      <th className="px-3 py-2 font-medium text-right">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustedRows.map((row) => (
                      <tr key={row.paymentRequirementId} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground">{row.title}</p>
                          <p className="text-xs text-foreground-muted">
                            {formatJobPaymentStatus(row.status)}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right text-foreground-muted">
                          {formatCents(row.currentAmountCents)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">
                          {formatCents(row.newAmountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : isCredit ? (
              <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  Credit preview
                </p>
                <p className="mt-1 text-foreground-muted">
                  Credit of {formatCents(Math.abs(priceDeltaCents))} reduces remaining unpaid
                  balances, starting with final payment.
                </p>
              </div>
            ) : activeImpact.strategy === "DUE_BEFORE_ADDED_WORK" ? (
              <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  New due payment
                </p>
                <p className="mt-1 text-foreground-muted">
                  {formatCents(priceDeltaCents)} due before added work starts.
                </p>
              </div>
            ) : null}

            <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                After approval and apply
              </p>
              <p className="mt-1 text-foreground-muted">
                {getStaffPaymentAfterApplySummary({
                  strategy: activeImpact.strategy,
                  priceDeltaCents,
                  targetTitle: preview?.targetPaymentTitle ?? null,
                  allocationCount:
                    isPaymentImpactV2(activeImpact) ? activeImpact.allocations?.length : undefined,
                })}
              </p>
            </div>
          </>
        ) : editable ? (
          <p className="text-sm text-foreground-muted">
            Open payment plan review to choose how the customer pays for this Change Order.
          </p>
        ) : null}

        {warnings.length > 0 ? (
          <div className="space-y-2">
            {warnings.map((warning) => (
              <div
                key={warning.code}
                className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>{warning.message}</p>
              </div>
            ))}
          </div>
        ) : null}

        {!paymentImpactReady && sendBlockedReason ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{sendBlockedReason}</p>
          </div>
        ) : null}

        {editable && paymentImpactChanged ? (
          <p className="text-xs text-foreground-muted">
            Save commercial changes to store payment terms before sending.
          </p>
        ) : null}
      </div>

      {editable ? (
        <ChangeOrderPaymentPlanReviewDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          priceDeltaCents={priceDeltaCents}
          paymentImpactJson={paymentImpactJson}
          paymentRequirements={paymentRequirements}
          jobPlanVersion={jobPlanVersion}
          changeOrderNumber={changeOrderNumber}
          onApply={onChange}
        />
      ) : null}
    </>
  );
}
