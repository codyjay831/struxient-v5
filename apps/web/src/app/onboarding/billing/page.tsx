import { redirect } from "next/navigation";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { isStripeBillingEnabled } from "@/lib/billing/billing-config";
import { getOrganizationEntitlement } from "@/lib/billing/billing-entitlement";
import { BillingOnboardingClient } from "./billing-onboarding-client";

export default async function BillingOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; error?: string }>;
}) {
  if (!isStripeBillingEnabled()) {
    redirect("/workstation");
  }

  const ctx = await getRequestContextOrThrow();
  const entitlement = await getOrganizationEntitlement(ctx.organizationId);

  if (entitlement.canUseProduct) {
    redirect("/workstation");
  }

  const params = await searchParams;

  return (
    <BillingOnboardingClient
      canceled={params.canceled === "1"}
      errorCode={params.error ?? null}
    />
  );
}
