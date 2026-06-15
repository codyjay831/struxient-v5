import { BetaSignupInviteStatus } from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { appendSystemPlatformAuditEvent } from "@/lib/platform/platform-audit";

export async function createOrganizationBetaGrantFromInvite(
  tx: ExtendedTransactionClient,
  params: {
    inviteId: string;
    organizationId: string;
    userId: string;
    betaDays: number;
    aiEnabled: boolean;
    aiIncludedUnits: number;
    grantedByUserId: string;
  },
): Promise<void> {
  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + params.betaDays * 24 * 60 * 60 * 1000);

  await tx.organizationBetaGrant.create({
    data: {
      organizationId: params.organizationId,
      betaSignupInviteId: params.inviteId,
      startsAt,
      expiresAt,
      aiEnabled: params.aiEnabled,
      aiIncludedUnits: params.aiIncludedUnits,
      grantedByUserId: params.grantedByUserId,
    },
  });

  await tx.betaSignupInvite.update({
    where: { id: params.inviteId },
    data: {
      status: BetaSignupInviteStatus.ACCEPTED,
      acceptedAt: new Date(),
      acceptedByUserId: params.userId,
      organizationId: params.organizationId,
    },
  });

  await appendSystemPlatformAuditEvent(
    {
      action: "platform.beta.invite.accepted",
      targetType: "beta_signup_invite",
      targetId: params.inviteId,
      organizationId: params.organizationId,
      outcome: "SUCCESS",
      metadata: {
        organizationId: params.organizationId,
        method: "signup",
      },
    },
    tx,
  );
}

export async function getPostOnboardingPathForOrganization(
  organizationId: string,
): Promise<"/workstation" | "/onboarding/billing"> {
  const { getOrganizationEntitlement } = await import("@/lib/billing/billing-entitlement");
  const entitlement = await getOrganizationEntitlement(organizationId);
  if (entitlement.canUseProduct) {
    return "/workstation";
  }
  return "/onboarding/billing";
}

export async function organizationHasActiveProductAccess(organizationId: string): Promise<boolean> {
  const { getOrganizationEntitlement } = await import("@/lib/billing/billing-entitlement");
  const entitlement = await getOrganizationEntitlement(organizationId);
  return entitlement.canUseProduct;
}
