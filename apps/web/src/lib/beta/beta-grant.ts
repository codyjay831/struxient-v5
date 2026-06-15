import type { OrganizationBetaGrant } from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { computeBillableUnits } from "@/lib/billing/billing-periods";

export function isBetaGrantActive(grant: Pick<OrganizationBetaGrant, "expiresAt" | "revokedAt">): boolean {
  if (grant.revokedAt) return false;
  return grant.expiresAt > new Date();
}

export async function getActiveOrganizationBetaGrant(
  organizationId: string,
): Promise<OrganizationBetaGrant | null> {
  const grant = await db.organizationBetaGrant.findUnique({
    where: { organizationId },
  });
  if (!grant || !isBetaGrantActive(grant)) return null;
  return grant;
}

export function getBetaGrantRemainingAiUnits(
  grant: Pick<OrganizationBetaGrant, "aiEnabled" | "aiIncludedUnits" | "usedAiUnits">,
): number {
  if (!grant.aiEnabled) return 0;
  return Math.max(0, grant.aiIncludedUnits - grant.usedAiUnits);
}

export function canBetaGrantUseAi(
  grant: Pick<OrganizationBetaGrant, "aiEnabled" | "aiIncludedUnits" | "usedAiUnits">,
): boolean {
  return grant.aiEnabled && getBetaGrantRemainingAiUnits(grant) > 0;
}

export async function recordBetaGrantAiUsage(params: {
  organizationId: string;
  billableUnits: number;
  tx?: ExtendedTransactionClient;
}): Promise<{ billableStatus: "INCLUDED" | "BLOCKED"; remainingUnits: number; appliedUnits: number }> {
  const client = params.tx ?? db;

  if (params.billableUnits <= 0) {
    return { billableStatus: "BLOCKED", remainingUnits: 0, appliedUnits: 0 };
  }

  const grant = await client.organizationBetaGrant.findUnique({
    where: { organizationId: params.organizationId },
  });

  if (!grant || !isBetaGrantActive(grant) || !grant.aiEnabled) {
    return { billableStatus: "BLOCKED", remainingUnits: 0, appliedUnits: 0 };
  }

  const remainingBefore = getBetaGrantRemainingAiUnits(grant);
  if (remainingBefore <= 0) {
    return { billableStatus: "BLOCKED", remainingUnits: 0, appliedUnits: 0 };
  }

  const appliedUnits = Math.min(params.billableUnits, remainingBefore);

  const updated = await client.organizationBetaGrant.updateMany({
    where: {
      id: grant.id,
      usedAiUnits: grant.usedAiUnits,
      aiEnabled: true,
    },
    data: {
      usedAiUnits: grant.usedAiUnits + appliedUnits,
    },
  });

  if (updated.count !== 1) {
    const refreshed = await client.organizationBetaGrant.findUniqueOrThrow({
      where: { id: grant.id },
    });
    const refreshedRemaining = getBetaGrantRemainingAiUnits(refreshed);
    if (refreshedRemaining <= 0) {
      return { billableStatus: "BLOCKED", remainingUnits: 0, appliedUnits: 0 };
    }
    const retryApplied = Math.min(params.billableUnits, refreshedRemaining);
    const retry = await client.organizationBetaGrant.updateMany({
      where: {
        id: grant.id,
        usedAiUnits: refreshed.usedAiUnits,
        aiEnabled: true,
      },
      data: {
        usedAiUnits: refreshed.usedAiUnits + retryApplied,
      },
    });
    if (retry.count !== 1) {
      return { billableStatus: "BLOCKED", remainingUnits: refreshedRemaining, appliedUnits: 0 };
    }
    const remainingAfterRetry = Math.max(0, refreshed.aiIncludedUnits - (refreshed.usedAiUnits + retryApplied));
    const blocked = retryApplied < params.billableUnits;
    return {
      billableStatus: blocked ? "BLOCKED" : "INCLUDED",
      remainingUnits: remainingAfterRetry,
      appliedUnits: retryApplied,
    };
  }

  const remainingAfter = Math.max(0, grant.aiIncludedUnits - (grant.usedAiUnits + appliedUnits));
  const blocked = appliedUnits < params.billableUnits;

  return {
    billableStatus: blocked ? "BLOCKED" : "INCLUDED",
    remainingUnits: remainingAfter,
    appliedUnits,
  };
}

export { computeBillableUnits };
