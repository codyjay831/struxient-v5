"use server";

import { StaffRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { isBetaSignupEnabled } from "@/lib/env-validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const SIGNUP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_MAX_ATTEMPTS_PER_WINDOW = 5;

const signupSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(120),
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

  const organizationSlug = await resolveUniqueOrganizationSlug(parsed.data.companyName);
  const passwordHash = await hash(parsed.data.password, 10);

  await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: parsed.data.companyName,
        slug: organizationSlug,
      },
      select: { id: true },
    });

    const user = await tx.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
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

  return {
    ok: true,
    email,
  };
}
