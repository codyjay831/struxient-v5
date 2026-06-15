"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CreditCard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BASE_PLAN_NAME,
  formatUsdFromCents,
  getBasePlanDisplayAmountCents,
  getIncludedAiUnits,
  getTrialDays,
} from "@/lib/billing/billing-config";
import { startTrialCheckoutAction } from "./actions";

export function BillingOnboardingClient({
  canceled,
  errorCode,
}: {
  canceled?: boolean;
  errorCode?: string | null;
}) {
  const [error, setError] = useState<string | null>(
    canceled ? "Checkout was canceled. You can try again when ready." : null,
  );
  const [isPending, startTransition] = useTransition();

  const trialDays = getTrialDays();
  const displayPrice = formatUsdFromCents(getBasePlanDisplayAmountCents());
  const includedUnits = getIncludedAiUnits();

  const onStartTrial = () => {
    setError(null);
    startTransition(async () => {
      const result = await startTrialCheckoutAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.assign(result.url);
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full max-w-lg">
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-elevated)]">
          <div className="inline-flex size-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <CreditCard className="size-6" />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Start your trial
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {BASE_PLAN_NAME}
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">
            {trialDays}-day free trial, then {displayPrice}/month. Card required today — you will
            not be charged until the trial ends.
          </p>

          <div className="mt-6 rounded-xl border border-border bg-background p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-4 text-accent" />
              <div>
                <p className="text-sm font-medium text-foreground">AI included</p>
                <p className="mt-1 text-sm text-foreground-muted">
                  {includedUnits.toLocaleString()} AI units per month included. Additional usage is
                  billed at the end of each billing period.
                </p>
              </div>
            </div>
          </div>

          {(error || errorCode) && (
            <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error ??
                (errorCode === "session_mismatch"
                  ? "Checkout session did not match your organization."
                  : "Could not confirm billing setup. Please try again.")}
            </p>
          )}

          <Button
            type="button"
            variant="primary"
            className="mt-6 w-full py-2.5 text-sm"
            disabled={isPending}
            onClick={onStartTrial}
          >
            {isPending ? "Redirecting to checkout..." : "Start free trial"}
            {!isPending && <ArrowRight className="size-4" />}
          </Button>

          <p className="mt-4 text-center text-xs text-foreground-muted">
            Manage payment methods and invoices anytime from Settings → Billing.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-foreground-muted">
          Need help?{" "}
          <Link href="/workstation" className="text-foreground underline-offset-4 hover:underline">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
