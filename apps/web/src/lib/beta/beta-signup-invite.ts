import { BetaSignupInviteStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { hashBetaSignupInviteToken } from "@/lib/invite-token";

export type BetaSignupInvitePreview = {
  normalizedEmail: string;
  betaDays: number;
  aiEnabled: boolean;
  aiIncludedUnits: number;
  expiresAt: Date;
};

export type BetaSignupInviteValidation =
  | { ok: true; invite: BetaSignupInvitePreview & { id: string } }
  | { ok: false; error: string };

export async function getBetaSignupInvitePreview(
  token: string,
): Promise<BetaSignupInvitePreview | null> {
  const result = await validateBetaSignupInviteToken(token);
  if (!result.ok) return null;
  return {
    normalizedEmail: result.invite.normalizedEmail,
    betaDays: result.invite.betaDays,
    aiEnabled: result.invite.aiEnabled,
    aiIncludedUnits: result.invite.aiIncludedUnits,
    expiresAt: result.invite.expiresAt,
  };
}

export async function validateBetaSignupInviteToken(
  token: string,
): Promise<BetaSignupInviteValidation> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "Beta invite is required." };
  }

  const invite = await db.betaSignupInvite.findFirst({
    where: { tokenHash: hashBetaSignupInviteToken(trimmed) },
    select: {
      id: true,
      normalizedEmail: true,
      status: true,
      betaDays: true,
      aiEnabled: true,
      aiIncludedUnits: true,
      expiresAt: true,
    },
  });

  if (!invite) {
    return { ok: false, error: "Beta invite not found." };
  }

  if (invite.status === BetaSignupInviteStatus.REVOKED) {
    return { ok: false, error: "This beta invite has been revoked." };
  }

  if (invite.status === BetaSignupInviteStatus.ACCEPTED) {
    return { ok: false, error: "This beta invite has already been used." };
  }

  if (invite.expiresAt <= new Date()) {
    return { ok: false, error: "This beta invite has expired." };
  }

  return { ok: true, invite };
}

export function betaInviteMatchesEmail(
  invite: Pick<BetaSignupInvitePreview, "normalizedEmail">,
  email: string,
): boolean {
  return invite.normalizedEmail === email.trim().toLowerCase();
}
