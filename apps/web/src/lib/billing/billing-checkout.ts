import { getBaseStripePriceId, getTrialDays } from "./billing-config";
import { ensureStripeCustomer } from "./billing-entitlement";
import { getAppBaseUrl, getStripeClient } from "./billing-stripe";

export async function createTrialCheckoutSession(params: {
  organizationId: string;
  organizationName: string;
  email: string;
}): Promise<{ url: string }> {
  const priceId = getBaseStripePriceId();
  if (!priceId) {
    throw new Error("STRUXIENT_BASE_PRICE_ID is not configured.");
  }

  const { stripeCustomerId } = await ensureStripeCustomer(params);
  const stripe = getStripeClient();
  const baseUrl = getAppBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: getTrialDays(),
      metadata: {
        organizationId: params.organizationId,
      },
    },
    metadata: {
      organizationId: params.organizationId,
    },
    payment_method_collection: "always",
    success_url: `${baseUrl}/onboarding/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/onboarding/billing?canceled=1`,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("Stripe Checkout session did not return a URL.");
  }

  return { url: session.url };
}

export async function retrieveCheckoutSession(sessionId: string) {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
}
