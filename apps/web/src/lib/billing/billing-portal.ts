import { db } from "@/lib/db";
import { getAppBaseUrl, getStripeClient } from "./billing-stripe";

export async function createBillingPortalSession(params: {
  organizationId: string;
  returnPath?: string;
}): Promise<{ url: string }> {
  const account = await db.organizationBillingAccount.findUnique({
    where: { organizationId: params.organizationId },
  });
  if (!account) {
    throw new Error("No billing account found for this organization.");
  }

  const stripe = getStripeClient();
  const baseUrl = getAppBaseUrl();
  const returnPath = params.returnPath ?? "/settings/billing";

  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: `${baseUrl}${returnPath.startsWith("/") ? returnPath : `/${returnPath}`}`,
  });

  return { url: session.url };
}
