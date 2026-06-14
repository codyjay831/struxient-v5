"use server";

import { db } from "@/lib/db";
import { AttachmentStatus } from "@prisma/client";
import { getStorageProvider, LocalStorageProvider } from "@/lib/storage";
import { denyUnlessCanMutate } from "@/lib/staff-authz";
import { requireCurrentSession } from "@/lib/session";

export type LeadUploadAttachmentState = {
  error?: string;
  success?: boolean;
  attachmentId?: string;
  uploadUrl?: string;
  storageProvider?: "local" | "gcs";
};

export async function getLeadAttachmentUploadUrlAction(
  fileName: string,
  contentType: string,
  fileSize: number,
): Promise<LeadUploadAttachmentState> {
  const session = await requireCurrentSession();
  const denied = denyUnlessCanMutate(session.role);
  if (denied) {
    return { error: denied };
  }
  const organizationId = session.organizationId;

  const provider = getStorageProvider();

  // Basic validation
  if (fileSize > 10 * 1024 * 1024) {
    return { error: "File size exceeds 10MB limit." };
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowedTypes.includes(contentType)) {
    return { error: "File type not supported. Please upload an image or PDF." };
  }

  try {
    // Create the attachment record first to get a real ID
    const attachment = await db.attachment.create({
      data: {
        organizationId,
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
    console.error("Failed to generate opportunity upload URL", e);
    return { error: "Failed to prepare upload. Please try again." };
  }
}
