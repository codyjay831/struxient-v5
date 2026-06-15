import type { AiBillingPeriod, OrganizationSubscription } from "@prisma/client";
import { db } from "@/lib/db";
import {
  getAiOveragePricePerUnitCents,
  getIncludedAiUnits,
  MIN_BILLABLE_UNITS_PER_REQUEST,
  TOKENS_PER_BILLABLE_UNIT,
} from "./billing-config";

export async function ensureAiBillingPeriodForSubscription(
  subscription: OrganizationSubscription,
): Promise<AiBillingPeriod> {
  const includedAllowanceUnits = getIncludedAiUnits();

  return db.aiBillingPeriod.upsert({
    where: {
      organizationId_periodStart: {
        organizationId: subscription.organizationId,
        periodStart: subscription.currentPeriodStart,
      },
    },
    create: {
      organizationId: subscription.organizationId,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      includedAllowanceUnits,
    },
    update: {
      periodEnd: subscription.currentPeriodEnd,
      includedAllowanceUnits,
    },
  });
}

export async function getCurrentAiBillingPeriod(
  organizationId: string,
): Promise<AiBillingPeriod | null> {
  const subscription = await db.organizationSubscription.findUnique({
    where: { organizationId },
  });
  if (!subscription) return null;
  return ensureAiBillingPeriodForSubscription(subscription);
}

export function computeBillableUnits(inputTokens: number, outputTokens: number): number {
  const totalTokens = Math.max(0, inputTokens) + Math.max(0, outputTokens);
  if (totalTokens === 0) {
    return MIN_BILLABLE_UNITS_PER_REQUEST;
  }
  return Math.max(
    MIN_BILLABLE_UNITS_PER_REQUEST,
    Math.ceil(totalTokens / TOKENS_PER_BILLABLE_UNIT),
  );
}

export async function recordAiUsageAgainstPeriod(params: {
  aiBillingPeriodId: string;
  billableUnits: number;
}): Promise<{ billableStatus: "INCLUDED" | "OVERAGE"; overageUnitsAdded: number }> {
  const period = await db.aiBillingPeriod.findUniqueOrThrow({
    where: { id: params.aiBillingPeriodId },
  });

  const previousUsed = period.usedUnits;
  const newUsed = previousUsed + params.billableUnits;
  const includedRemaining = Math.max(0, period.includedAllowanceUnits - previousUsed);
  const includedApplied = Math.min(params.billableUnits, includedRemaining);
  const overageAdded = params.billableUnits - includedApplied;

  const overageAmountCents =
    period.overageAmountCents + overageAdded * getAiOveragePricePerUnitCents();

  await db.aiBillingPeriod.update({
    where: { id: params.aiBillingPeriodId },
    data: {
      usedUnits: newUsed,
      overageUnits: period.overageUnits + overageAdded,
      overageAmountCents,
    },
  });

  return {
    billableStatus: overageAdded > 0 ? "OVERAGE" : "INCLUDED",
    overageUnitsAdded: overageAdded,
  };
}
