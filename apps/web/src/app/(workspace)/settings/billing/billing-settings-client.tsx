"use client";

import { useTransition } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import {
  BASE_PLAN_NAME,
  formatUsdFromCents,
  getAiOveragePricePerUnitCents,
  getBasePlanDisplayAmountCents,
} from "@/lib/billing/billing-config";
import { subscriptionStatusLabel } from "@/lib/billing/billing-subscription-status";
import type { OrganizationSubscriptionStatus } from "@prisma/client";
import { openBillingPortalAction } from "./billing-actions";

type BillingSettingsClientProps = {
  billingEnabled: boolean;
  planName: string;
  displayPriceCents: number;
  subscription: {
    status: OrganizationSubscriptionStatus;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  usage: {
    includedAllowanceUnits: number;
    usedUnits: number;
    overageUnits: number;
    overageAmountCents: number;
  } | null;
  recentUsage: Array<{
    id: string;
    feature: string;
    status: string;
    billableUnits: number | null;
    billableStatus: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    createdAt: string;
  }>;
  portalError?: string | null;
};

export function BillingSettingsClient(props: BillingSettingsClientProps) {
  const [isPending, startTransition] = useTransition();

  const openPortal = () => {
    startTransition(async () => {
      const result = await openBillingPortalAction();
      if (result.ok) {
        window.location.assign(result.url);
      }
    });
  };

  const used = props.usage?.usedUnits ?? 0;
  const included = props.usage?.includedAllowanceUnits ?? 0;
  const usagePct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Manage your Struxient subscription and AI usage."
      />

      {props.portalError ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {props.portalError}
        </p>
      ) : null}

      <WorkspacePanel>
        <SectionHeading title="Plan" />
        {!props.billingEnabled ? (
          <p className="text-sm text-foreground-muted">
            Billing is not configured in this environment. All features are available without a
            subscription.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-foreground">{props.planName}</p>
                <p className="text-sm text-foreground-muted">
                  {formatUsdFromCents(props.displayPriceCents)}/month
                </p>
                {props.subscription ? (
                  <p className="mt-2 text-sm text-foreground-muted">
                    Status: {subscriptionStatusLabel(props.subscription.status)}
                    {props.subscription.trialEndsAt
                      ? ` · Trial ends ${new Date(props.subscription.trialEndsAt).toLocaleDateString()}`
                      : null}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-foreground-muted">
                    No active subscription. Complete billing setup to continue after onboarding.
                  </p>
                )}
              </div>
              {props.subscription ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={openPortal}
                >
                  <CreditCard className="size-4" />
                  {isPending ? "Opening..." : "Manage in Stripe"}
                  <ExternalLink className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </WorkspacePanel>

      {props.billingEnabled && props.usage ? (
        <WorkspacePanel>
          <SectionHeading title="AI usage this period" />
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground-muted">
                {used.toLocaleString()} / {included.toLocaleString()} units used
              </span>
              <span className="font-medium text-foreground">{usagePct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {props.usage.overageUnits > 0 ? (
              <p className="text-sm text-foreground-muted">
                Overage: {props.usage.overageUnits.toLocaleString()} units (
                {formatUsdFromCents(props.usage.overageAmountCents)}) · billed at period end at{" "}
                {formatUsdFromCents(getAiOveragePricePerUnitCents())}/unit
              </p>
            ) : (
              <p className="text-sm text-foreground-muted">
                Additional usage beyond your included allowance is billed at{" "}
                {formatUsdFromCents(getAiOveragePricePerUnitCents())}/unit at period end.
              </p>
            )}
          </div>
        </WorkspacePanel>
      ) : null}

      {props.recentUsage.length > 0 ? (
        <WorkspacePanel>
          <SectionHeading title="Recent AI activity" />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-foreground-muted">
                  <th className="py-2 pr-4 font-medium">Feature</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Units</th>
                  <th className="py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {props.recentUsage.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="py-2 pr-4 text-foreground">{row.feature}</td>
                    <td className="py-2 pr-4 text-foreground-muted">{row.status}</td>
                    <td className="py-2 pr-4 text-foreground-muted">
                      {row.billableUnits ?? "—"}
                      {row.billableStatus ? ` (${row.billableStatus.toLowerCase()})` : ""}
                      {row.inputTokens != null && row.outputTokens != null
                        ? ` · ${row.inputTokens + row.outputTokens} tokens`
                        : ""}
                    </td>
                    <td className="py-2 text-foreground-muted">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspacePanel>
      ) : null}
    </div>
  );
}
