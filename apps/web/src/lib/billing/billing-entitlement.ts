import type { OrganizationSubscription } from "@prisma/client";
import { db } from "@/lib/db";
import { getIncludedAiUnits } from "./billing-config";
import {
  isAiAllowedSubscriptionStatus,
  isProductAccessSubscriptionStatus,
  normalizeStripeSubscriptionStatus,
} from "./billing-subscription-status";
import { ensureAiBillingPeriodForSubscription } from "./billing-periods";
import { getStripeClient } from "./billing-stripe";
import type Stripe from "stripe";

export type OrgEntitlement = {
  billingEnabled: boolean;
  hasSubscription: boolean;
  canUseProduct: boolean;
  canUseAi: boolean;
  aiOverageAllowed: boolean;
  subscriptionStatus: OrganizationSubscription["status"] | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  includedAiUnits: number;
  usedAiUnits: number;
  remainingAiUnits: number;
  overageUnits: number;
  reason?: string;
  billingSetupPath: string;
};

export async function getOrganizationEntitlement(
  organizationId: string,
): Promise<OrgEntitlement> {
  const { isStripeBillingEnabled } = await import("./billing-config");
  const billingEnabled = isStripeBillingEnabled();

  if (!billingEnabled) {
    return {
      billingEnabled: false,
      hasSubscription: false,
      canUseProduct: true,
      canUseAi: true,
      aiOverageAllowed: true,
      subscriptionStatus: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      includedAiUnits: getIncludedAiUnits(),
      usedAiUnits: 0,
      remainingAiUnits: getIncludedAiUnits(),
      overageUnits: 0,
      billingSetupPath: "/onboarding/billing",
    };
  }

  const subscription = await db.organizationSubscription.findUnique({
    where: { organizationId },
  });

  if (!subscription) {
    return {
      billingEnabled: true,
      hasSubscription: false,
      canUseProduct: false,
      canUseAi: false,
      aiOverageAllowed: false,
      subscriptionStatus: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      includedAiUnits: getIncludedAiUnits(),
      usedAiUnits: 0,
      remainingAiUnits: 0,
      overageUnits: 0,
      reason: "Start your 14-day trial to use Struxient.",
      billingSetupPath: "/onboarding/billing",
    };
  }

  const period = await ensureAiBillingPeriodForSubscription(subscription);
  const canUseProduct = isProductAccessSubscriptionStatus(subscription.status);
  const canUseAi = isAiAllowedSubscriptionStatus(subscription.status);
  const remaining = Math.max(0, period.includedAllowanceUnits - period.usedUnits);

  let reason: string | undefined;
  if (!canUseProduct) {
    reason = "Your subscription is inactive. Update billing to continue.";
  } else if (!canUseAi) {
    reason = "AI is paused until your payment method is updated.";
  }

  return {
    billingEnabled: true,
    hasSubscription: true,
    canUseProduct,
    canUseAi,
    aiOverageAllowed: canUseAi,
    subscriptionStatus: subscription.status,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    includedAiUnits: period.includedAllowanceUnits,
    usedAiUnits: period.usedUnits,
    remainingAiUnits: remaining,
    overageUnits: period.overageUnits,
    reason,
    billingSetupPath: "/onboarding/billing",
  };
}

export class BillingEntitlementError extends Error {
  readonly code: "BILLING_REQUIRED" | "AI_BLOCKED" | "PAST_DUE";
  readonly billingPath: string;

  constructor(message: string, code: BillingEntitlementError["code"], billingPath: string) {
    super(message);
    this.name = "BillingEntitlementError";
    this.code = code;
    this.billingPath = billingPath;
  }
}

export async function assertCanUseProduct(organizationId: string): Promise<OrgEntitlement> {
  const entitlement = await getOrganizationEntitlement(organizationId);
  if (!entitlement.canUseProduct) {
    throw new BillingEntitlementError(
      entitlement.reason ?? "Billing setup is required.",
      "BILLING_REQUIRED",
      entitlement.billingSetupPath,
    );
  }
  return entitlement;
}

export async function assertCanUseAi(
  organizationId: string,
  feature: string,
): Promise<OrgEntitlement> {
  void feature;
  const entitlement = await assertCanUseProduct(organizationId);
  if (!entitlement.canUseAi) {
    throw new BillingEntitlementError(
      entitlement.reason ?? "AI usage requires an active subscription.",
      entitlement.subscriptionStatus === "PAST_DUE" ? "PAST_DUE" : "AI_BLOCKED",
      entitlement.billingSetupPath,
    );
  }
  return entitlement;
}

export async function upsertSubscriptionFromStripe(
  stripeSubscription: Stripe.Subscription,
  organizationId: string,
): Promise<void> {
  const status = normalizeStripeSubscriptionStatus(stripeSubscription.status);
  const firstItem = stripeSubscription.items.data[0];
  const priceId = firstItem?.price?.id ?? firstItem?.plan?.id ?? "";

  const periodStartSeconds =
    firstItem?.current_period_start ?? stripeSubscription.billing_cycle_anchor;
  const periodEndSeconds =
    firstItem?.current_period_end ??
    periodStartSeconds + 30 * 24 * 60 * 60;

  const currentPeriodStart = new Date(periodStartSeconds * 1000);
  const currentPeriodEnd = new Date(periodEndSeconds * 1000);
  const trialEndsAt = stripeSubscription.trial_end
    ? new Date(stripeSubscription.trial_end * 1000)
    : null;

  const subscription = await db.organizationSubscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId: priceId,
      status,
      trialEndsAt,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    },
    update: {
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId: priceId,
      status,
      trialEndsAt,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    },
  });

  await ensureAiBillingPeriodForSubscription(subscription);
}

export async function resolveOrganizationIdFromStripeCustomer(
  stripeCustomerId: string,
): Promise<string | null> {
  const account = await db.organizationBillingAccount.findUnique({
    where: { stripeCustomerId },
    select: { organizationId: true },
  });
  return account?.organizationId ?? null;
}

export async function ensureStripeCustomer(params: {
  organizationId: string;
  organizationName: string;
  email: string;
}): Promise<{ stripeCustomerId: string }> {
  const existing = await db.organizationBillingAccount.findUnique({
    where: { organizationId: params.organizationId },
  });
  if (existing) {
    return { stripeCustomerId: existing.stripeCustomerId };
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: params.email,
    name: params.organizationName,
    metadata: {
      organizationId: params.organizationId,
    },
  });

  await db.organizationBillingAccount.create({
    data: {
      organizationId: params.organizationId,
      stripeCustomerId: customer.id,
      billingEmail: params.email,
    },
  });

  return { stripeCustomerId: customer.id };
}
