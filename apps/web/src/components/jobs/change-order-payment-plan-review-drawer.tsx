"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ChangeOrderPaymentAllocationBasis } from "@/lib/change-order/payment-impact-schema";
import {
  isPaymentImpactV2,
  changeOrderPaymentImpactToJson,
  parseChangeOrderPaymentImpact,
  type ChangeOrderPaymentImpactAny,
} from "@/lib/change-order/payment-impact-schema";
import {
  buildImpactForPreset,
  buildPaymentPlanReviewModel,
  PAYMENT_PLAN_PRESET_LABELS,
  presetNeedsBasis,
  presetNeedsDeposit,
  presetsForPriceDelta,
  type PaymentPlanPreset,
} from "@/lib/change-order/payment-impact-allocation";
import {
  getStaffPaymentAfterApplySummary,
  STAFF_DUE_BEFORE_ADDED_WORK_TASK_NOTE,
  type JobPaymentRequirementForResolver,
} from "@/lib/change-order/payment-impact-resolver";
import { formatCents, formatJobPaymentStatus } from "@/lib/job-payment-display";
import { Drawer } from "@/components/ui/drawer";

function defaultDepositCents(priceDeltaCents: number): number {
  return Math.min(Math.max(Math.round(priceDeltaCents * 0.25), 100), priceDeltaCents - 100);
}

function inferPresetFromImpact(
  impact: ChangeOrderPaymentImpactAny | null,
  priceDeltaCents: number,
): PaymentPlanPreset {
  if (!impact) {
    return priceDeltaCents < 0 ? "CREDIT_REMAINING_BALANCE" : "ADD_TO_NEXT_UNPAID_PAYMENT";
  }
  if (impact.strategy in PAYMENT_PLAN_PRESET_LABELS) {
    return impact.strategy as PaymentPlanPreset;
  }
  return "DUE_BEFORE_ADDED_WORK";
}

export function ChangeOrderPaymentPlanReviewDrawer({
  open,
  onClose,
  priceDeltaCents,
  paymentImpactJson,
  paymentRequirements,
  jobPlanVersion,
  changeOrderNumber,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  priceDeltaCents: number;
  paymentImpactJson: unknown;
  paymentRequirements: JobPaymentRequirementForResolver[];
  jobPlanVersion: number;
  changeOrderNumber?: number;
  onApply: (impact: ChangeOrderPaymentImpactAny | null) => void;
}) {
  const parsedStored = useMemo(
    () => parseChangeOrderPaymentImpact(paymentImpactJson),
    [paymentImpactJson],
  );

  const availablePresets = presetsForPriceDelta(priceDeltaCents);
  const [preset, setPreset] = useState<PaymentPlanPreset>(
    inferPresetFromImpact(parsedStored.ok ? parsedStored.impact : null, priceDeltaCents),
  );
  const [depositDollars, setDepositDollars] = useState(() => {
    const stored = parsedStored.ok ? parsedStored.impact : null;
    if (stored && "initialPayment" in stored && stored.initialPayment) {
      return (stored.initialPayment.amountCents / 100).toFixed(2);
    }
    return (defaultDepositCents(priceDeltaCents) / 100).toFixed(2);
  });
  const [basis, setBasis] = useState<ChangeOrderPaymentAllocationBasis>(
    parsedStored.ok && parsedStored.impact && "allocationBasis" in parsedStored.impact
      ? (parsedStored.impact.allocationBasis ?? "ORIGINAL_PAYMENT_PERCENTAGES")
      : "ORIGINAL_PAYMENT_PERCENTAGES",
  );

  const depositCents = Math.round(Number.parseFloat(depositDollars) * 100);

  const built = useMemo(() => {
    if (priceDeltaCents === 0) return null;
    return buildImpactForPreset({
      preset,
      priceDeltaCents,
      requirements: paymentRequirements,
      jobPlanVersion,
      depositCents: presetNeedsDeposit(preset) ? depositCents : undefined,
      allocationBasis: presetNeedsBasis(preset) ? basis : undefined,
      changeOrderNumber,
    });
  }, [
    preset,
    priceDeltaCents,
    paymentRequirements,
    jobPlanVersion,
    depositCents,
    basis,
    changeOrderNumber,
  ]);

  const reviewModel = useMemo(() => {
    const adjustments = new Map<string, number>();
    if (built?.ok && built.impact.allocations) {
      for (const row of built.impact.allocations) {
        adjustments.set(row.paymentRequirementId, row.adjustmentCents);
      }
    }
    return buildPaymentPlanReviewModel({
      priceDeltaCents,
      requirements: paymentRequirements,
      adjustments,
    });
  }, [built, priceDeltaCents, paymentRequirements]);

  const impact = built?.ok ? built.impact : null;
  const preview = impact?.resolvedPreview ?? null;

  function handleConfirm() {
    if (built?.ok) {
      onApply(built.impact);
      onClose();
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Payment plan review"
      ariaLabel="Change Order payment plan review"
      widthClass="w-full sm:w-[640px] md:w-[780px] lg:w-[900px]"
    >
      <div className="space-y-5 p-4 sm:p-6">
        <div className="rounded-lg border border-border bg-foreground/[0.02] p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-foreground-muted">Change Order amount</dt>
              <dd className="font-semibold text-foreground">{formatCents(priceDeltaCents)}</dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Eligible payments</dt>
              <dd className="font-medium text-foreground">{reviewModel.eligibleCount}</dd>
            </div>
          </dl>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground-muted">How to apply this amount</span>
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={preset}
            onChange={(event) => setPreset(event.target.value as PaymentPlanPreset)}
          >
            {availablePresets.map((option) => (
              <option key={option} value={option}>
                {PAYMENT_PLAN_PRESET_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        {presetNeedsDeposit(preset) ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-muted">Deposit amount (due now)</span>
            <input
              type="number"
              min={0.01}
              max={priceDeltaCents / 100}
              step={0.01}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={depositDollars}
              onChange={(event) => setDepositDollars(event.target.value)}
            />
            <p className="text-xs text-foreground-muted">
              Must be greater than $0 and not exceed {formatCents(priceDeltaCents)}.
            </p>
          </label>
        ) : null}

        {presetNeedsBasis(preset) ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-muted">Split remainder by</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={basis}
              onChange={(event) =>
                setBasis(event.target.value as ChangeOrderPaymentAllocationBasis)
              }
            >
              <option value="ORIGINAL_PAYMENT_PERCENTAGES">Original contract percentages</option>
              <option value="CURRENT_REMAINING_AMOUNTS">Current unpaid amounts</option>
              <option value="EQUAL_SPLIT">Equal split</option>
            </select>
            {impact && "allocationBasisFallback" in impact && impact.allocationBasisFallback ? (
              <p className="text-xs text-warning">
                Original percentages unavailable — using current unpaid amounts.
              </p>
            ) : null}
          </label>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-foreground/[0.02] text-left text-xs uppercase tracking-wide text-foreground-muted">
                <th className="px-3 py-2 font-medium">Payment</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Current</th>
                <th className="px-3 py-2 font-medium text-right">CO change</th>
                <th className="px-3 py-2 font-medium text-right">New</th>
                <th className="px-3 py-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {reviewModel.rows.map((row) => (
                <tr
                  key={row.paymentRequirementId}
                  className={`border-b border-border last:border-0 ${
                    row.eligible ? "" : "opacity-50"
                  }`}
                >
                  <td className="px-3 py-2 font-medium text-foreground">{row.title}</td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {formatJobPaymentStatus(row.status)}
                    {!row.eligible && row.ineligibleReason ? (
                      <span className="block text-xs">{row.ineligibleReason}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground-muted">
                    {formatCents(row.currentAmountCents)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">
                    {row.adjustmentCents !== 0
                      ? row.adjustmentCents > 0
                        ? `+${formatCents(row.adjustmentCents)}`
                        : formatCents(row.adjustmentCents)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">
                    {row.adjustmentCents !== 0 ? formatCents(row.newAmountCents) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-foreground-muted">
                    {row.dueAnchorLabel ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {impact && isPaymentImpactV2(impact) && impact.initialPayment ? (
          <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              New deposit payment
            </p>
            <p className="mt-1 font-medium text-foreground">
              {impact.initialPayment.title}: {formatCents(impact.initialPayment.amountCents)} (due
              before added work)
            </p>
          </div>
        ) : preset === "DUE_BEFORE_ADDED_WORK" ? (
          <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              New due payment
            </p>
            <p className="mt-1 text-foreground-muted">
              {formatCents(priceDeltaCents)} due before added work starts.
            </p>
            <p className="mt-2 text-xs text-foreground-muted">{STAFF_DUE_BEFORE_ADDED_WORK_TASK_NOTE}</p>
          </div>
        ) : null}

        {impact ? (
          <>
            <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Customer payment terms (generated)
              </p>
              <p className="mt-1 text-foreground">{impact.customerTermsText}</p>
            </div>

            <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                After approval and apply
              </p>
              <p className="mt-1 text-foreground-muted">
                {getStaffPaymentAfterApplySummary({
                  strategy: impact.strategy,
                  priceDeltaCents,
                  targetTitle: preview?.targetPaymentTitle ?? null,
                  allocationCount:
                    isPaymentImpactV2(impact) ? impact.allocations?.length : undefined,
                })}
              </p>
            </div>
          </>
        ) : null}

        {built && !built.ok ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <ul className="space-y-1">
              {built.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {reviewModel.eligibleCount === 0 && priceDeltaCents > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>No unpaid payments remain. Collect before added work is the only option.</p>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!built?.ok}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            onClick={handleConfirm}
          >
            Use this payment plan
          </button>
        </div>
      </div>
    </Drawer>
  );
}

export { changeOrderPaymentImpactToJson };
