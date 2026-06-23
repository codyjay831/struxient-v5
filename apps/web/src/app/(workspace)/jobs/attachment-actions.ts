"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { JobActivityType, AttachmentStatus } from "@prisma/client";
import { getStorageProvider, LocalStorageProvider } from "@/lib/storage";
import { authorizeStaffAction, STAFF_ACTIONS } from "@/lib/authz/staff-actions";

export type UploadAttachmentState = {
  error?: string;
  success?: boolean;
  attachmentId?: string;
  uploadUrl?: string;
  storageProvider?: "local" | "gcs";
};

/**
 * Legacy direct upload action for local development.
 * Uses the storage provider abstraction but handles the buffer directly.
 */
export async function uploadTaskAttachmentAction(
  taskId: string,
  formData: FormData,
): Promise<UploadAttachmentState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const provider = getStorageProvider();
  
  // Production guard: Local filesystem storage is for development only.
  if (process.env.NODE_ENV === "production" && provider instanceof LocalStorageProvider) {
    console.error("Local filesystem upload attempted in production. This is forbidden.");
    return { error: "Upload failed: Storage misconfiguration." };
  }

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

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.TASK_PROOF_UPLOAD_COMPLETE,
    resourceType: "jobTask",
    resourceId: taskId,
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  try {
    const task = await db.jobTask.findFirst({
      where: { id: taskId, job: { organizationId } },
      select: { id: true, jobId: true },
    });

    if (!task) {
      return { error: "Task not found or access denied." };
    }

    const attachmentId = `att_${Math.random().toString(36).substring(2, 15)}`; // Temporary ID for key generation if not using real DB ID yet
    
    // In local dev, we still use the provider to get the key
    const fileKey = provider.createObjectKey({
      organizationId,
      jobId: task.jobId,
      taskId: task.id,
      attachmentId,
      fileName: file.name,
    });
    
    if (provider instanceof LocalStorageProvider) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await provider.writeObject(fileKey, buffer);
    } else {
      return { error: "Direct upload is only supported for local storage. Use signed URL flow for GCS." };
    }

    const attachment = await db.$transaction(async (tx) => {
      const att = await tx.attachment.create({
        data: {
          organizationId,
          jobTaskId: taskId,
          jobId: task.jobId,
          fileName: file.name,
          fileKey: fileKey,
          contentType: file.type,
          fileSize: file.size,
          uploadedByUserId: session.userId,
          status: AttachmentStatus.READY,
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
    revalidatePath("/workstation/tasks");

    return { success: true, attachmentId: attachment.id };
  } catch (e) {
    console.error("Failed to upload attachment", e);
    return { error: "Failed to upload file. Please try again." };
  }
}

/**
 * Step 1: Request a signed upload URL for GCS.
 * Creates a PENDING attachment record and returns the signed URL.
 */
export async function getTaskAttachmentUploadUrlAction(
  taskId: string,
  fileName: string,
  contentType: string,
  fileSize: number,
): Promise<UploadAttachmentState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const provider = getStorageProvider();

  // Basic validation
  if (fileSize > 10 * 1024 * 1024) {
    return { error: "File size exceeds 10MB limit." };
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowedTypes.includes(contentType)) {
    return { error: "File type not supported." };
  }

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.TASK_PROOF_UPLOAD_PREPARE,
    resourceType: "jobTask",
    resourceId: taskId,
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  try {
    const task = await db.jobTask.findFirst({
      where: { id: taskId, job: { organizationId } },
      select: { id: true, jobId: true },
    });

    if (!task) {
      return { error: "Task not found or access denied." };
    }

    // Create the attachment record first to get a real ID
    const attachment = await db.attachment.create({
      data: {
        organizationId,
        jobTaskId: taskId,
        jobId: task.jobId,
        fileName,
        fileKey: "pending", // Placeholder until key is generated
        contentType,
        fileSize,
        uploadedByUserId: session.userId,
        status: AttachmentStatus.PENDING,
      },
    });

    const fileKey = provider.createObjectKey({
      organizationId,
      jobId: task.jobId,
      taskId: task.id,
      attachmentId: attachment.id,
      fileName,
    });

    // Update the record with the real key
    await db.attachment.update({
      where: { id: attachment.id },
      data: { fileKey },
    });

    const uploadUrl = await provider.createSignedUploadUrl({
      fileKey,
      contentType,
      expiresInSeconds: 300, // 5 minutes
    });

    return {
      success: true,
      attachmentId: attachment.id,
      uploadUrl,
      storageProvider: provider instanceof LocalStorageProvider ? "local" : "gcs",
    };
  } catch (e) {
    console.error("Failed to generate upload URL", e);
    return { error: "Failed to prepare upload. Please try again." };
  }
}

/**
 * Step 2: Finalize the upload after the browser has PUT the file to GCS.
 * Verifies the object exists and marks the attachment as READY.
 */
export async function completeTaskAttachmentUploadAction(
  attachmentId: string,
): Promise<UploadAttachmentState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const provider = getStorageProvider();

  try {
    const attachment = await db.attachment.findFirst({
      where: { id: attachmentId, organizationId },
    });

    if (!attachment) {
      return { error: "Attachment not found." };
    }

    if (!attachment.jobTaskId) {
      return { error: "Attachment is not linked to a task." };
    }

    const authorization = await authorizeStaffAction(session, {
      action: STAFF_ACTIONS.TASK_PROOF_UPLOAD_COMPLETE,
      resourceType: "jobTask",
      resourceId: attachment.jobTaskId,
    });
    if (!authorization.ok) {
      return { error: authorization.message };
    }

    if (attachment.status === AttachmentStatus.READY) {
      return { success: true, attachmentId };
    }

    // Verify object exists in storage
    const exists = await provider.confirmObjectExists(attachment.fileKey);
    if (!exists) {
      return { error: "File upload could not be verified in storage." };
    }

    await db.$transaction(async (tx) => {
      await tx.attachment.update({
        where: { id: attachmentId },
        data: { status: AttachmentStatus.READY },
      });

      await recordJobActivity(
        {
          organizationId,
          jobId: attachment.jobId!,
          type: JobActivityType.ATTACHMENT_UPLOADED,
          title: `Proof uploaded: ${attachment.fileName}`,
          details: `Attached to task: ${attachment.jobTaskId}`,
          entityType: "Attachment",
          entityId: attachment.id,
          actorUserId: session.userId,
        },
        tx
      );
    });

    revalidatePath(`/jobs/${attachment.jobId}`);
    revalidatePath("/workstation");
    revalidatePath("/workstation/tasks");

    return { success: true, attachmentId };
  } catch (e) {
    console.error("Failed to complete attachment upload", e);
    return { error: "Failed to finalize upload. Please try again." };
  }
}
