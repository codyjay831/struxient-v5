"use server";

import { db } from "@/lib/db";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";
import { revalidatePath } from "next/cache";

export type StageFormState = {
  error?: string;
};

export async function createStageAction(
  _prevState: StageFormState,
  formData: FormData,
): Promise<StageFormState> {
  const name = formData.get("name")?.toString().trim();
  if (!name) return { error: "Name is required." };

  const ctx = await getSettingsRequestContextOrThrow();

  const maxSortOrder = await db.stage.aggregate({
    where: { organizationId: ctx.organizationId },
    _max: { sortOrder: true },
  });

  await db.stage.create({
    data: {
      organizationId: ctx.organizationId,
      name,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/settings/scope-library/stages");
  return {};
}

export async function updateStageAction(
  stageId: string,
  _prevState: StageFormState,
  formData: FormData,
): Promise<StageFormState> {
  const name = formData.get("name")?.toString().trim();
  if (!name) return { error: "Name is required." };

  const ctx = await getSettingsRequestContextOrThrow();

  await db.stage.update({
    where: { id: stageId, organizationId: ctx.organizationId },
    data: { name },
  });

  revalidatePath("/settings/scope-library/stages");
  return {};
}

export async function archiveStageAction(
  stageId: string,
): Promise<StageFormState> {
  const ctx = await getSettingsRequestContextOrThrow();

  // Check if stage is in use
  const inUse = await db.taskTemplate.findFirst({
    where: { stageId, organizationId: ctx.organizationId, archivedAt: null },
  });

  if (inUse) {
    return { error: "Cannot hide a stage that is still used by reusable tasks." };
  }

  await db.stage.update({
    where: { id: stageId, organizationId: ctx.organizationId },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/settings/scope-library/stages");
  return {};
}

export async function moveStageAction(
  stageId: string,
  direction: "up" | "down",
): Promise<StageFormState> {
  const ctx = await getSettingsRequestContextOrThrow();

  await db.$transaction(async (tx) => {
    const stages = await tx.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
    });

    const idx = stages.findIndex((s) => s.id === stageId);
    if (idx < 0) return;

    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= stages.length) return;

    const a = stages[idx];
    const b = stages[swapWith];

    await tx.stage.update({
      where: { id: a.id },
      data: { sortOrder: b.sortOrder },
    });
    await tx.stage.update({
      where: { id: b.id },
      data: { sortOrder: a.sortOrder },
    });
  });

  revalidatePath("/settings/scope-library/stages");
  return {};
}
