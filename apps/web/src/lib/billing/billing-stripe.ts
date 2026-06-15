import Stripe from "stripe";
import { isStripeBillingEnabled } from "./billing-config";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!isStripeBillingEnabled()) {
    throw new Error("Stripe billing is not configured.");
  }
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY!.trim();
    stripeClient = new Stripe(secretKey, {
      typescript: true,
    });
  }
  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  return secret;
}

export function getAppBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  }
  return url.replace(/\/$/, "");
}
