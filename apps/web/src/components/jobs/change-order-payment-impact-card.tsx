"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  CHANGE_ORDER_PAYMENT_STRATEGY_LABELS,
  parseChangeOrderPaymentImpact,
  type ChangeOrderPaymentImpact,
  type ChangeOrderPaymentStrategy,
} from "@/lib/change-order/payment-impact-schema";
import {
  buildPaymentImpactForStrategy,
  derivePaymentImpactWarnings,
  getStaffPaymentAfterApplySummary,
  STAFF_DUE_BEFORE_ADDED_WORK_TASK_NOTE,
  suggestDefaultPaymentStrategy,
  sumUnsettledPaymentBalanceCents,
  type JobPaymentRequirementForResolver,
} from "@/lib/change-order/payment-impact-resolver";
import { formatCents } from "@/lib/job-payment-display";

const STRATEGY_OPTIONS: ChangeOrderPaymentStrategy[] = [
  "DUE_BEFORE_ADDED_WORK",
  "ADD_TO_NEXT_UNPAID_PAYMENT",
  "ADD_TO_FINAL_PAYMENT",
  "CREDIT_REMAINING_BALANCE",
];

function strategyOptionsForDelta(priceDeltaCents: number): ChangeOrderPaymentStrategy[] {
  if (priceDeltaCents < 0) {
    return ["CREDIT_REMAINING_BALANCE"];
  }
  if (priceDeltaCents > 0) {
    return STRATEGY_OPTIONS.filter((strategy) => strategy !== "CREDIT_REMAINING_BALANCE");
  }
  return [];
}

export function ChangeOrderPaymentImpactCard({
  priceDeltaCents,
  paymentImpactJson,
  paymentRequirements,
  jobPlanVersion,
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
  editable: boolean;
  paymentImpactSaved?: boolean;
  paymentImpactChanged?: boolean;
  paymentImpactReady?: boolean;
  sendBlockedReason?: string | null;
  onChange: (impact: ChangeOrderPaymentImpact | null) => void;
}) {
  const parsedStored = useMemo(
    () => parseChangeOrderPaymentImpact(paymentImpactJson),
    [paymentImpactJson],
  );
  const initialStrategy =
    parsedStored.ok && parsedStored.impact
      ? parsedStored.impact.strategy
      : suggestDefaultPaymentStrategy({ priceDeltaCents, requirements: paymentRequirements });

  const [strategy, setStrategy] = useState<ChangeOrderPaymentStrategy>(initialStrategy);
  const [customerTermsText, setCustomerTermsText] = useState(
    parsedStored.ok && parsedStored.impact ? parsedStored.impact.customerTermsText : "",
  );

  const builtImpact = useMemo(() => {
    if (priceDeltaCents === 0) return null;
    return buildPaymentImpactForStrategy({
      strategy,
      priceDeltaCents,
      requirements: paymentRequirements,
      jobPlanVersion,
      customerTermsTextOverride: customerTermsText,
    });
  }, [strategy, priceDeltaCents, paymentRequirements, jobPlanVersion, customerTermsText]);

  function emitDraftImpact(nextStrategy: ChangeOrderPaymentStrategy, nextTerms: string) {
    if (priceDeltaCents === 0) {
      onChange(null);
      return;
    }
    const built = buildPaymentImpactForStrategy({
      strategy: nextStrategy,
      priceDeltaCents,
      requirements: paymentRequirements,
      jobPlanVersion,
      customerTermsTextOverride: nextTerms,
    });
    onChange(built.ok ? built.impact : null);
  }

  function handleStrategyChange(nextStrategy: ChangeOrderPaymentStrategy) {
    setStrategy(nextStrategy);
    emitDraftImpact(nextStrategy, customerTermsText);
  }

  function handleTermsChange(nextTerms: string) {
    setCustomerTermsText(nextTerms);
    emitDraftImpact(strategy, nextTerms);
  }

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

  const activeImpact = builtImpact?.ok ? builtImpact.impact : parsedStored.ok ? parsedStored.impact : null;
  const preview = activeImpact?.resolvedPreview ?? null;

  const warnings = derivePaymentImpactWarnings({
    priceDeltaCents,
    strategy,
    requirements: paymentRequirements,
    targetPaymentRequirementId: preview?.targetPaymentRequirementId ?? null,
  });

  const availableStrategies = strategyOptionsForDelta(priceDeltaCents);
  const isCredit = strategy === "CREDIT_REMAINING_BALANCE" || priceDeltaCents < 0;
  const unsettledBalance = sumUnsettledPaymentBalanceCents(paymentRequirements);

  return (
    <div className="rounded-lg border border-border bg-foreground/[0.02] p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Payment terms</h3>
          <p className="mt-1 text-xs text-foreground-muted">
            How the customer pays for this Change Order. Saved with commercial changes.
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
          <dt className="text-foreground-muted">How customer pays</dt>
          <dd className="font-medium text-foreground">
            {preview?.strategyLabel ?? CHANGE_ORDER_PAYMENT_STRATEGY_LABELS[strategy]}
          </dd>
        </div>
        {preview?.dueTimingLabel ? (
          <div className="sm:col-span-2">
            <dt className="text-foreground-muted">When it is due</dt>
            <dd className="font-medium text-foreground">{preview.dueTimingLabel}</dd>
          </div>
        ) : null}
      </dl>

      {editable ? (
        <>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-muted">Payment approach</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={strategy}
              onChange={(event) =>
                handleStrategyChange(event.target.value as ChangeOrderPaymentStrategy)
              }
            >
              {availableStrategies.map((option) => (
                <option key={option} value={option}>
                  {CHANGE_ORDER_PAYMENT_STRATEGY_LABELS[option]}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-muted">
              Customer-facing payment terms
            </span>
            <textarea
              className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={customerTermsText}
              onChange={(event) => handleTermsChange(event.target.value)}
              placeholder="Plain-English payment terms shown on the customer Change Order page"
            />
          </label>
        </>
      ) : activeImpact ? (
        <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Saved payment terms
          </p>
          <p className="mt-1 font-medium text-foreground">{activeImpact.resolvedPreview.strategyLabel}</p>
          <p className="mt-1 text-foreground-muted">{activeImpact.customerTermsText}</p>
        </div>
      ) : null}

      {isCredit ? (
        <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Credit preview
          </p>
          <p className="mt-1 text-foreground-muted">
            Credit of {formatCents(Math.abs(priceDeltaCents))} reduces remaining unpaid balances (
            {formatCents(unsettledBalance)} available), starting with final payment.
          </p>
        </div>
      ) : preview?.targetPaymentTitle ? (
        <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Affected payment
          </p>
          <p className="mt-1 font-medium text-foreground">{preview.targetPaymentTitle}</p>
          {preview.targetAmountBeforeCents != null && preview.targetAmountAfterCents != null ? (
            <p className="mt-1 text-foreground-muted">
              {formatCents(preview.targetAmountBeforeCents)} →{" "}
              {formatCents(preview.targetAmountAfterCents)}
            </p>
          ) : null}
        </div>
      ) : strategy === "DUE_BEFORE_ADDED_WORK" ? (
        <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            New due payment
          </p>
          <p className="mt-1 text-foreground-muted">
            A separate {formatCents(priceDeltaCents)} due payment is created for this Change Order.
          </p>
        </div>
      ) : null}

      {strategy === "DUE_BEFORE_ADDED_WORK" ? (
        <p className="text-xs text-foreground-muted">{STAFF_DUE_BEFORE_ADDED_WORK_TASK_NOTE}</p>
      ) : null}

      {activeImpact ? (
        <>
          <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              What the customer will see
            </p>
            <p className="mt-1 text-foreground">{activeImpact.resolvedPreview.customerSummary}</p>
            <p className="mt-2 text-foreground-muted">{activeImpact.customerTermsText}</p>
          </div>

          <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              After approval and apply
            </p>
            <p className="mt-1 text-foreground-muted">
              {getStaffPaymentAfterApplySummary({
                strategy: activeImpact.strategy,
                priceDeltaCents,
                targetTitle: preview?.targetPaymentTitle ?? null,
              })}
            </p>
          </div>
        </>
      ) : null}

      {builtImpact && !builtImpact.ok ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <ul className="space-y-1">
            {builtImpact.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
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
  );
}
