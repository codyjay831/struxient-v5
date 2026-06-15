import type { OrganizationSubscriptionStatus } from "@prisma/client";
import type Stripe from "stripe";

const STATUS_MAP: Record<string, OrganizationSubscriptionStatus> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  unpaid: "UNPAID",
  paused: "PAUSED",
};

export function normalizeStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): OrganizationSubscriptionStatus {
  return STATUS_MAP[status] ?? "INCOMPLETE";
}

export function isProductAccessSubscriptionStatus(
  status: OrganizationSubscriptionStatus,
): boolean {
  return status === "TRIALING" || status === "ACTIVE" || status === "PAST_DUE";
}

export function isAiAllowedSubscriptionStatus(
  status: OrganizationSubscriptionStatus,
): boolean {
  return status === "TRIALING" || status === "ACTIVE";
}

export function subscriptionStatusLabel(status: OrganizationSubscriptionStatus): string {
  switch (status) {
    case "TRIALING":
      return "Trial";
    case "ACTIVE":
      return "Active";
    case "PAST_DUE":
      return "Past due";
    case "CANCELED":
      return "Canceled";
    case "INCOMPLETE":
      return "Incomplete";
    case "INCOMPLETE_EXPIRED":
      return "Incomplete (expired)";
    case "UNPAID":
      return "Unpaid";
    case "PAUSED":
      return "Paused";
    default:
      return status;
  }
}
