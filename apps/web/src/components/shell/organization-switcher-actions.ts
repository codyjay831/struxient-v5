"use server";

import { revalidatePath } from "next/cache";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";

export async function switchActiveOrganizationAction(
  organizationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getRequestContextOrThrow();
  const nextOrgId = organizationId.trim();
  if (!nextOrgId) {
    return { ok: false, error: "Organization is required." };
  }

  const membership = await db.membership.findFirst({
    where: {
      organizationId: nextOrgId,
      userId: ctx.userId,
    },
    select: { id: true },
  });
  if (!membership) {
    return { ok: false, error: "You are not a member of that organization." };
  }

  await db.user.update({
    where: { id: ctx.userId },
    data: { lastActiveOrganizationId: nextOrgId },
  });

  revalidatePath("/workstation");
  revalidatePath("/jobs");
  revalidatePath("/schedule");
  revalidatePath("/settings");
  return { ok: true };
}

