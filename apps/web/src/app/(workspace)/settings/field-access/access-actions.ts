"use server";

import { JobCollaboratorStatus, StaffRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";

function normalize(raw: string) {
  return raw.trim().toLowerCase();
}

export async function createCrewAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSettingsRequestContextOrThrow();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { ok: false, error: "Crew name must be at least 2 characters." };
  }

  try {
    await db.crew.create({
      data: {
        organizationId: ctx.organizationId,
        name,
      },
    });
  } catch {
    return { ok: false, error: "Crew already exists or could not be created." };
  }

  revalidatePath("/settings/field-access");
  return { ok: true };
}

export async function addCrewMemberAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSettingsRequestContextOrThrow();
  const crewId = String(formData.get("crewId") ?? "");
  const email = normalize(String(formData.get("email") ?? ""));
  if (!crewId || !email.includes("@")) {
    return { ok: false, error: "Select a crew and valid member email." };
  }

  const membership = await db.membership.findFirst({
    where: {
      organizationId: ctx.organizationId,
      user: { email },
    },
    select: { userId: true },
  });
  if (!membership) {
    return { ok: false, error: "No matching organization member found for this email." };
  }

  const crew = await db.crew.findFirst({
    where: {
      id: crewId,
      organizationId: ctx.organizationId,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!crew) {
    return { ok: false, error: "Crew not found or already archived." };
  }

  const existing = await db.crewMember.findFirst({
    where: {
      organizationId: ctx.organizationId,
      crewId,
      userId: membership.userId,
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "Member is already active in this crew." };
  }

  await db.crewMember.create({
    data: {
      organizationId: ctx.organizationId,
      crewId,
      userId: membership.userId,
      startsAt: new Date(),
    },
  });

  revalidatePath("/settings/field-access");
  return { ok: true };
}

export async function archiveCrewAction(crewId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSettingsRequestContextOrThrow();
  const result = await db.crew.updateMany({
    where: {
      id: crewId,
      organizationId: ctx.organizationId,
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Crew not found." };
  }

  await db.crewMember.updateMany({
    where: {
      organizationId: ctx.organizationId,
      crewId,
      endsAt: null,
    },
    data: { endsAt: new Date() },
  });

  revalidatePath("/settings/field-access");
  return { ok: true };
}

export async function grantJobCollaboratorAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSettingsRequestContextOrThrow();
  const jobId = String(formData.get("jobId") ?? "");
  const email = normalize(String(formData.get("email") ?? ""));
  if (!jobId || !email.includes("@")) {
    return { ok: false, error: "Select a job and valid subcontractor email." };
  }

  const membership = await db.membership.findFirst({
    where: {
      organizationId: ctx.organizationId,
      user: { email },
      role: StaffRole.SUBCONTRACTOR,
    },
    select: { userId: true },
  });
  if (!membership) {
    return { ok: false, error: "Subcontractor membership required before granting access." };
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!job) {
    return { ok: false, error: "Job not found." };
  }

  await db.jobCollaborator.upsert({
    where: {
      jobId_userId: {
        jobId,
        userId: membership.userId,
      },
    },
    create: {
      organizationId: ctx.organizationId,
      jobId,
      userId: membership.userId,
      permissionsJson: { view: true, upload: true },
      status: JobCollaboratorStatus.ACTIVE,
      grantedAt: new Date(),
    },
    update: {
      status: JobCollaboratorStatus.ACTIVE,
      revokedAt: null,
      expiresAt: null,
      permissionsJson: { view: true, upload: true },
      grantedAt: new Date(),
    },
  });

  console.info("[job-collaborator] granted", {
    organizationId: ctx.organizationId,
    jobId,
    userId: membership.userId,
  });

  revalidatePath("/settings/field-access");
  return { ok: true };
}

export async function revokeJobCollaboratorAction(
  collaboratorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSettingsRequestContextOrThrow();
  const result = await db.jobCollaborator.updateMany({
    where: {
      id: collaboratorId,
      organizationId: ctx.organizationId,
      status: JobCollaboratorStatus.ACTIVE,
    },
    data: {
      status: JobCollaboratorStatus.REVOKED,
      revokedAt: new Date(),
    },
  });
  if (result.count === 0) {
    return { ok: false, error: "Grant not found." };
  }

  console.info("[job-collaborator] revoked", {
    organizationId: ctx.organizationId,
    collaboratorId,
  });

  revalidatePath("/settings/field-access");
  return { ok: true };
}
