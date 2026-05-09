"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { JobActivityType } from "@prisma/client";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

export type UploadAttachmentState = {
  error?: string;
  success?: boolean;
  attachmentId?: string;
};

/**
 * Minimal dev-only local storage for attachments.
 * IMPORTANT: public/uploads is publicly accessible. 
 * In production, this MUST use private object storage (S3/R2) 
 * and a protected media route for access control.
 */
export async function uploadTaskAttachmentAction(
  taskId: string,
  formData: FormData,
): Promise<UploadAttachmentState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const file = formData.get("file") as File;
  if (!file) {
    return { error: "No file provided." };
  }

  // Basic validation
  if (file.size > 10 * 1024 * 1024) {
    return { error: "File size exceeds 10MB limit." };
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowedTypes.includes(file.type)) {
    return { error: "File type not supported. Please upload an image or PDF." };
  }

  try {
    const task = await db.jobTask.findFirst({
      where: { id: taskId, job: { organizationId } },
      select: { id: true, jobId: true },
    });

    if (!task) {
      return { error: "Task not found or access denied." };
    }

    // Storage path (dev only)
    const uploadDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const fileKey = `${uuidv4()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filePath = join(uploadDir, fileKey);
    
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    const attachment = await db.$transaction(async (tx) => {
      const att = await tx.attachment.create({
        data: {
          organizationId,
          jobTaskId: taskId,
          jobId: task.jobId,
          fileName: file.name,
          fileKey: `/uploads/${fileKey}`, // Public URL for dev
          contentType: file.type,
          fileSize: file.size,
          uploadedByUserId: session.userId,
        },
      });

      await recordJobActivity(
        {
          organizationId,
          jobId: task.jobId,
          type: JobActivityType.ATTACHMENT_UPLOADED,
          title: `Proof uploaded: ${file.name}`,
          details: `Attached to task: ${taskId}`,
          entityType: "Attachment",
          entityId: att.id,
          actorUserId: session.userId,
        },
        tx
      );

      return att;
    });

    revalidatePath(`/jobs/${task.jobId}`);
    revalidatePath("/workstation");

    return { success: true, attachmentId: attachment.id };
  } catch (e) {
    console.error("Failed to upload attachment", e);
    return { error: "Failed to upload file. Please try again." };
  }
}
