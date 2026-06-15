import { getSettingsRequestContextOrNull } from "@/lib/auth-context";
import {
  BASE_PLAN_NAME,
  getBasePlanDisplayAmountCents,
  isStripeBillingEnabled,
} from "@/lib/billing/billing-config";
import { getBillingSummary, listRecentAiUsage } from "@/lib/billing/billing-service";
import { BillingSettingsClient } from "./billing-settings-client";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getSettingsRequestContextOrNull();
  const params = await searchParams;

  if (!ctx) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-foreground-muted">
          Only organization owners and admins can manage billing.
        </p>
        <Link href="/settings" className="mt-4 inline-block text-sm text-foreground underline">
          Back to settings
        </Link>
      </div>
    );
  }

  const billingEnabled = isStripeBillingEnabled();
  const summary = billingEnabled ? await getBillingSummary(ctx.organizationId) : null;
  const recentUsage = billingEnabled ? await listRecentAiUsage(ctx.organizationId) : [];

  return (
    <BillingSettingsClient
      billingEnabled={billingEnabled}
      planName={BASE_PLAN_NAME}
      displayPriceCents={getBasePlanDisplayAmountCents()}
      subscription={
        summary?.subscription
          ? {
              status: summary.subscription.status as import("@prisma/client").OrganizationSubscriptionStatus,
              trialEndsAt: summary.subscription.trialEndsAt?.toISOString() ?? null,
              currentPeriodStart: summary.subscription.currentPeriodStart.toISOString(),
              currentPeriodEnd: summary.subscription.currentPeriodEnd.toISOString(),
              cancelAtPeriodEnd: summary.subscription.cancelAtPeriodEnd,
            }
          : null
      }
      usage={
        summary?.currentPeriod
          ? {
              includedAllowanceUnits: summary.currentPeriod.includedAllowanceUnits,
              usedUnits: summary.currentPeriod.usedUnits,
              overageUnits: summary.currentPeriod.overageUnits,
              overageAmountCents: summary.currentPeriod.overageAmountCents,
            }
          : null
      }
      recentUsage={recentUsage.map((row) => ({
        id: row.id,
        feature: row.feature,
        status: row.status,
        billableUnits: row.billableUnits,
        billableStatus: row.billableStatus,
        createdAt: row.createdAt.toISOString(),
      }))}
      portalError={params.error ? decodeURIComponent(params.error) : null}
    />
  );
}
