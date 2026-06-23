"use server";

import { OrganizationInviteStatus, StaffRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createOrganizationBetaGrantFromInvite } from "@/lib/beta/beta-onboarding";
import {
  betaInviteMatchesEmail,
  validateBetaSignupInviteToken,
} from "@/lib/beta/beta-signup-invite";
import { isBetaSignupEnabled } from "@/lib/env-validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashOrganizationInviteToken } from "@/lib/invite-token";
import { BILLING_TERMS_VERSION } from "@/lib/billing/billing-config";
import { provisionDefaultPublicIntakeFormForOrganization } from "@/lib/intake/ensure-default-public-intake-form";
import { z } from "zod";

const SIGNUP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_MAX_ATTEMPTS_PER_WINDOW = 5;

const signupSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(120),
  acceptTerms: z
    .boolean()
    .refine((value) => value === true, "You must accept the terms to create an account."),
});

function slugifyCompanyName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function resolveUniqueOrganizationSlug(companyName: string) {
  const base = slugifyCompanyName(companyName) || "contractor";
  let slug = base;
  let suffix = 1;

  while (true) {
    const existing = await db.organization.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) return slug;

    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

export type SignupActionResult =
  | {
      ok: true;
      email: string;
    }
  | {
      ok: false;
      error: string;
    };

export async function createAccountAction(input: unknown): Promise<SignupActionResult> {
  const betaTokenRaw = (input as { betaToken?: unknown })?.betaToken;
  const betaToken = typeof betaTokenRaw === "string" ? betaTokenRaw.trim() : "";

  const betaInviteValidation = betaToken
    ? await validateBetaSignupInviteToken(betaToken)
    : null;

  if (!isBetaSignupEnabled() && (!betaInviteValidation || !betaInviteValidation.ok)) {
    return {
      ok: false,
      error: "Sign-up is currently invite-only. Contact support for access.",
    };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (
    !(await checkRateLimit(ip, {
      windowMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
      max: SIGNUP_MAX_ATTEMPTS_PER_WINDOW,
      keyPrefix: "auth-signup",
    }))
  ) {
    return { ok: false, error: "Too many sign-up attempts. Please try again later." };
  }

  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const email = parsed.data.email.toLowerCase();
  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return { ok: false, error: "An account with this email already exists." };
  }

  if (betaInviteValidation) {
    if (!betaInviteValidation.ok) {
      return { ok: false, error: betaInviteValidation.error };
    }
    if (!betaInviteMatchesEmail(betaInviteValidation.invite, email)) {
      return { ok: false, error: "This beta invite is for a different email address." };
    }
  }

  const passwordHash = await hash(parsed.data.password, 10);

  const inviteTokenRaw = (input as { inviteToken?: unknown })?.inviteToken;
  const requestedInviteToken =
    typeof inviteTokenRaw === "string" ? inviteTokenRaw.trim() : "";

  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        termsAcceptedAt: new Date(),
        termsVersion: BILLING_TERMS_VERSION,
      },
      select: { id: true },
    });

    if (requestedInviteToken) {
      const inviteHash = hashOrganizationInviteToken(requestedInviteToken);
      const invite = await tx.organizationInvite.findFirst({
        where: {
          tokenHash: inviteHash,
          normalizedEmail: email,
          status: OrganizationInviteStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
      });
      if (invite) {
        await tx.membership.create({
          data: {
            userId: user.id,
            organizationId: invite.organizationId,
            role: invite.role,
          },
        });
        await tx.organizationInvite.update({
          where: { id: invite.id },
          data: {
            status: OrganizationInviteStatus.ACCEPTED,
            acceptedByUserId: user.id,
            acceptedAt: new Date(),
          },
        });
        return;
      }
    }

    const organizationSlug = await resolveUniqueOrganizationSlug(parsed.data.companyName);
    const organization = await tx.organization.create({
      data: {
        name: parsed.data.companyName,
        slug: organizationSlug,
      },
      select: { id: true },
    });

    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: StaffRole.OWNER,
      },
    });

    await provisionDefaultPublicIntakeFormForOrganization(organization.id, tx);

    if (betaInviteValidation?.ok) {
      const inviteRecord = await tx.betaSignupInvite.findUniqueOrThrow({
        where: { id: betaInviteValidation.invite.id },
        select: {
          id: true,
          betaDays: true,
          aiEnabled: true,
          aiIncludedUnits: true,
          createdByUserId: true,
        },
      });

      await createOrganizationBetaGrantFromInvite(tx, {
        inviteId: inviteRecord.id,
        organizationId: organization.id,
        userId: user.id,
        betaDays: inviteRecord.betaDays,
        aiEnabled: inviteRecord.aiEnabled,
        aiIncludedUnits: inviteRecord.aiIncludedUnits,
        grantedByUserId: inviteRecord.createdByUserId,
      });
    }
  });

  return {
    ok: true,
    email,
  };
}
