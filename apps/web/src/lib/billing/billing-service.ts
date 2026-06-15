import { db } from "@/lib/db";
import {
  resolveOrganizationIdFromStripeCustomer,
  upsertSubscriptionFromStripe,
} from "./billing-entitlement";
import type Stripe from "stripe";

export async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  const existing = await db.stripeWebhookEvent.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  return Boolean(existing);
}

export async function markWebhookEventProcessed(event: Stripe.Event): Promise<void> {
  await db.stripeWebhookEvent.create({
    data: {
      id: event.id,
      type: event.type,
    },
  });
}

async function resolveOrgIdFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.organizationId?.trim();
  if (fromMetadata) return fromMetadata;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return null;
  return resolveOrganizationIdFromStripeCustomer(customerId);
}

export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = session.metadata?.organizationId?.trim();
      if (!organizationId || !session.subscription) break;

      const stripe = getStripeClient();
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await upsertSubscriptionFromStripe(subscription, organizationId);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const organizationId = await resolveOrgIdFromSubscription(subscription);
      if (!organizationId) break;
      await upsertSubscriptionFromStripe(subscription, organizationId);
      break;
    }
    default:
      break;
  }
}

export type BillingSummary = {
  hasBillingAccount: boolean;
  subscription: {
    status: string;
    trialEndsAt: Date | null;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    stripePriceId: string;
  } | null;
  currentPeriod: {
    includedAllowanceUnits: number;
    usedUnits: number;
    overageUnits: number;
    overageAmountCents: number;
    invoiceStatus: string;
  } | null;
  recentUsageByFeature: Array<{ feature: string; count: number; billableUnits: number }>;
};

export async function getBillingSummary(organizationId: string): Promise<BillingSummary> {
  const [account, subscription, period, usageGroups] = await Promise.all([
    db.organizationBillingAccount.findUnique({
      where: { organizationId },
      select: { id: true },
    }),
    db.organizationSubscription.findUnique({ where: { organizationId } }),
    db.aiBillingPeriod.findFirst({
      where: { organizationId },
      orderBy: { periodStart: "desc" },
    }),
    db.aiUsageLog.groupBy({
      by: ["feature"],
      where: {
        organizationId,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
        status: "success",
      },
      _count: { _all: true },
      _sum: { billableUnits: true },
    }),
  ]);

  return {
    hasBillingAccount: Boolean(account),
    subscription: subscription
      ? {
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          stripePriceId: subscription.stripePriceId,
        }
      : null,
    currentPeriod: period
      ? {
          includedAllowanceUnits: period.includedAllowanceUnits,
          usedUnits: period.usedUnits,
          overageUnits: period.overageUnits,
          overageAmountCents: period.overageAmountCents,
          invoiceStatus: period.invoiceStatus,
        }
      : null,
    recentUsageByFeature: usageGroups.map((g) => ({
      feature: g.feature,
      count: g._count._all,
      billableUnits: g._sum.billableUnits ?? 0,
    })),
  };
}

export async function listRecentAiUsage(organizationId: string, limit = 25) {
  return db.aiUsageLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      feature: true,
      status: true,
      billableUnits: true,
      billableStatus: true,
      inputTokens: true,
      outputTokens: true,
      createdAt: true,
      errorMessage: true,
    },
  });
}
