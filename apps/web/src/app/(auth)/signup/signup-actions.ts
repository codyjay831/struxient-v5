"use server";

import { OrganizationInviteStatus, StaffRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { isBetaSignupEnabled } from "@/lib/env-validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashOrganizationInviteToken } from "@/lib/invite-token";
import { BILLING_TERMS_VERSION } from "@/lib/billing/billing-config";
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
  if (!isBetaSignupEnabled()) {
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

  const passwordHash = await hash(parsed.data.password, 10);

  const inviteTokenRaw = (input as { inviteToken?: unknown })?.inviteToken;
  const requestedInviteToken =
    typeof inviteTokenRaw === "string" ? inviteTokenRaw.trim() : "";

  await db.$transaction(async (tx) => {
    // #region agent log
    fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2d4ee2" },
      body: JSON.stringify({
        sessionId: "2d4ee2",
        runId: "post-fix",
        hypothesisId: "A",
        location: "signup-actions.ts:user.create:before",
        message: "Creating user with terms fields",
        data: {
          hasTermsAcceptedAtField: "termsAcceptedAt" in (tx.user as object),
          termsVersion: BILLING_TERMS_VERSION,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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
  });

  // #region agent log
  fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2d4ee2" },
    body: JSON.stringify({
      sessionId: "2d4ee2",
      runId: "post-fix",
      hypothesisId: "A",
      location: "signup-actions.ts:transaction:success",
      message: "Signup transaction completed",
      data: { ok: true },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return {
    ok: true,
    email,
  };
}
