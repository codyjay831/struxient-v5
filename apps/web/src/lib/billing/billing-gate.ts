import { redirect } from "next/navigation";
import { isStripeBillingEnabled } from "./billing-config";
import { getOrganizationEntitlement } from "./billing-entitlement";

export async function requireProductEntitlementOrRedirect(
  organizationId: string,
  allowedPrefixes: string[] = [],
): Promise<void> {
  if (!isStripeBillingEnabled()) return;

  const entitlement = await getOrganizationEntitlement(organizationId);
  if (entitlement.canUseProduct) return;

  for (const prefix of allowedPrefixes) {
    if (prefix.startsWith("/onboarding") || prefix.startsWith("/settings/billing")) {
      return;
    }
  }

  redirect(entitlement.billingSetupPath);
}
