"use server";

import { redirect } from "next/navigation";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { createTrialCheckoutSession } from "@/lib/billing/billing-checkout";
import { isStripeBillingEnabled } from "@/lib/billing/billing-config";
import { getOrganizationEntitlement } from "@/lib/billing/billing-entitlement";

export type BillingOnboardingActionResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function startTrialCheckoutAction(): Promise<BillingOnboardingActionResult> {
  if (!isStripeBillingEnabled()) {
    redirect("/workstation");
  }

  const ctx = await getSettingsRequestContextOrThrow();
  const entitlement = await getOrganizationEntitlement(ctx.organizationId);
  if (entitlement.canUseProduct) {
    redirect("/workstation");
  }

  const organization = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { id: true, name: true },
  });

  const user = await db.user.findUniqueOrThrow({
    where: { id: ctx.userId },
    select: { email: true },
  });

  if (!user.email) {
    return { ok: false, error: "Your account must have an email address to start billing." };
  }

  try {
    const { url } = await createTrialCheckoutSession({
      organizationId: organization.id,
      organizationName: organization.name,
      email: user.email,
    });
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not start checkout.",
    };
  }
}

export async function skipBillingWhenDisabledAction() {
  if (!isStripeBillingEnabled()) {
    redirect("/workstation");
  }
}

export async function completeBillingReturnAction(sessionId: string) {
  if (!isStripeBillingEnabled()) {
    redirect("/workstation");
  }

  const ctx = await getSettingsRequestContextOrThrow();
  const { retrieveCheckoutSession } = await import("@/lib/billing/billing-checkout");
  const { upsertSubscriptionFromStripe } = await import("@/lib/billing/billing-entitlement");

  try {
    const session = await retrieveCheckoutSession(sessionId);
    const organizationId = session.metadata?.organizationId?.trim();
    if (organizationId !== ctx.organizationId) {
      redirect("/onboarding/billing?error=session_mismatch");
    }

    const subscriptionRef = session.subscription;
    if (subscriptionRef && typeof subscriptionRef === "object" && "id" in subscriptionRef) {
      await upsertSubscriptionFromStripe(subscriptionRef, organizationId);
    } else if (typeof subscriptionRef === "string") {
      const stripe = (await import("@/lib/billing/billing-stripe")).getStripeClient();
      const subscription = await stripe.subscriptions.retrieve(subscriptionRef);
      await upsertSubscriptionFromStripe(subscription, organizationId);
    }
  } catch {
    redirect("/onboarding/billing?error=return_failed");
  }

  redirect("/workstation");
}
