import { NextResponse } from "next/server";
import {
  handleStripeWebhookEvent,
  isWebhookEventProcessed,
  markWebhookEventProcessed,
} from "@/lib/billing/billing-service";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/billing/billing-stripe";
import { isStripeBillingEnabled } from "@/lib/billing/billing-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isStripeBillingEnabled()) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const body = await request.text();

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (await isWebhookEventProcessed(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleStripeWebhookEvent(event);
    await markWebhookEventProcessed(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook handler failed.";
    console.error("[stripe-webhook]", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
