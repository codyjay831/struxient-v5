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
}): Promise<{ billableStatus: "INCLUDED" | "BLOCKED"; remainingUnits: number }> {
  const client = params.tx ?? db;
  const grant = await client.organizationBetaGrant.findUniqueOrThrow({
    where: { organizationId: params.organizationId },
  });

  if (!isBetaGrantActive(grant)) {
    return { billableStatus: "BLOCKED", remainingUnits: 0 };
  }

  if (!grant.aiEnabled) {
    return { billableStatus: "BLOCKED", remainingUnits: 0 };
  }

  const remainingBefore = getBetaGrantRemainingAiUnits(grant);
  if (remainingBefore <= 0) {
    return { billableStatus: "BLOCKED", remainingUnits: 0 };
  }

  const appliedUnits = Math.min(params.billableUnits, remainingBefore);
  const updated = await client.organizationBetaGrant.update({
    where: { id: grant.id },
    data: {
      usedAiUnits: grant.usedAiUnits + appliedUnits,
    },
  });

  const remainingAfter = getBetaGrantRemainingAiUnits(updated);
  const blocked = appliedUnits < params.billableUnits || remainingAfter <= 0;

  return {
    billableStatus: blocked ? "BLOCKED" : "INCLUDED",
    remainingUnits: remainingAfter,
  };
}

export { computeBillableUnits };
