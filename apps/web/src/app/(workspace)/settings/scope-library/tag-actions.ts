"use server";

import { TagStatus, TagSource } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";

export type TagActionState = {
  error?: string;
  success?: boolean;
};

export async function createTagAction(
  _prevState: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  const ctx = await getRequestContextOrThrow();
  const name = formData.get("name") as string;
  const color = formData.get("color") as string;

  if (!name) return { error: "Name is required" };

  try {
    await db.tag.create({
      data: {
        organizationId: ctx.organizationId,
        name: name.toLowerCase().trim(),
        color: color || null,
        source: "USER_CREATED",
        status: "ACTIVE",
      },
    });
    revalidatePath("/settings/scope-library/tags");
    return { success: true };
  } catch (e) {
    return { error: "Tag already exists or invalid data" };
  }
}

export async function updateTagAction(
  tagId: string,
  _prevState: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  const ctx = await getRequestContextOrThrow();
  const name = formData.get("name") as string;
  const color = formData.get("color") as string;
  const status = formData.get("status") as TagStatus;

  if (!name) return { error: "Name is required" };

  try {
    await db.tag.update({
      where: { id: tagId, organizationId: ctx.organizationId },
      data: {
        name: name.toLowerCase().trim(),
        color: color || null,
        status: status || "ACTIVE",
      },
    });
    revalidatePath("/settings/scope-library/tags");
    return { success: true };
  } catch (e) {
    return { error: "Failed to update tag" };
  }
}

export async function archiveTagAction(tagId: string): Promise<TagActionState> {
  const ctx = await getRequestContextOrThrow();
  try {
    await db.tag.update({
      where: { id: tagId, organizationId: ctx.organizationId },
      data: { status: "ARCHIVED" },
    });
    revalidatePath("/settings/scope-library/tags");
    return { success: true };
  } catch (e) {
    return { error: "Failed to archive tag" };
  }
}

export async function mergeTagsAction(
  sourceTagId: string,
  targetTagId: string,
): Promise<TagActionState> {
  const ctx = await getRequestContextOrThrow();

  if (sourceTagId === targetTagId) return { error: "Cannot merge a tag into itself" };

  try {
    await db.$transaction(async (tx) => {
      const sourceTag = await tx.tag.findUnique({
        where: { id: sourceTagId, organizationId: ctx.organizationId },
        include: { lineItemTemplates: true, taskTemplates: true },
      });

      const targetTag = await tx.tag.findUnique({
        where: { id: targetTagId, organizationId: ctx.organizationId },
      });

      if (!sourceTag || !targetTag) throw new Error("Tag not found");

      // Update all line item templates
      await tx.lineItemTemplate.updateMany({
        where: { tags: { some: { id: sourceTagId } } },
        data: {}, // This is tricky in Prisma for many-to-many
      });

      // Actually, for many-to-many, we need to use disconnect/connect on each record
      // or use raw SQL if it's too many. But let's do it properly.
      
      for (const lt of sourceTag.lineItemTemplates) {
        await tx.lineItemTemplate.update({
          where: { id: lt.id },
          data: {
            tags: {
              disconnect: { id: sourceTagId },
              connect: { id: targetTagId },
            },
          },
        });
      }

      for (const tt of sourceTag.taskTemplates) {
        await tx.taskTemplate.update({
          where: { id: tt.id },
          data: {
            tags: {
              disconnect: { id: sourceTagId },
              connect: { id: targetTagId },
            },
          },
        });
      }

      // Add source name to target aliases
      const newAliases = Array.from(new Set([...targetTag.aliases, sourceTag.name, ...sourceTag.aliases]));
      
      // Update target tag
      const existingHistory = (targetTag.mergeHistory as any[]) || [];
      const newHistory = [
        ...existingHistory,
        {
          from: sourceTag.name,
          at: new Date().toISOString(),
        },
      ];

      await tx.tag.update({
        where: { id: targetTagId },
        data: {
          aliases: newAliases,
          mergeHistory: newHistory as any,
        },
      });

      // Mark source tag as merged
      await tx.tag.update({
        where: { id: sourceTagId },
        data: { status: "MERGED" },
      });
    });

    revalidatePath("/settings/scope-library/tags");
    return { success: true };
  } catch (e) {
    console.error(e);
    return { error: "Failed to merge tags" };
  }
}
