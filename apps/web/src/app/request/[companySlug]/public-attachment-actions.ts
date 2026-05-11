"use server";

import { db } from "@/lib/db";
import { AttachmentStatus } from "@prisma/client";
import { getStorageProvider, LocalStorageProvider } from "@/lib/storage";
import { isValidPublicCompanySlugSegment } from "@/lib/public-request-slug";

export type PublicUploadAttachmentState = {
  error?: string;
  success?: boolean;
  attachmentId?: string;
  uploadUrl?: string;
  storageProvider?: "local" | "gcs";
};

export async function getPublicSalesIntakeAttachmentUploadUrlAction(
  companySlug: string,
  fileName: string,
  contentType: string,
  fileSize: number,
): Promise<PublicUploadAttachmentState> {
  const normalizedSlug = companySlug.trim().toLowerCase();
  if (!isValidPublicCompanySlugSegment(normalizedSlug)) {
    return { error: "Invalid request." };
  }

  const org = await db.organization.findFirst({
    where: { slug: normalizedSlug },
    select: { id: true },
  });

  if (!org) {
    return { error: "Invalid request." };
  }

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
    // Note: No salesIntakeId yet, it will be associated during sales intake submission
    const attachment = await db.attachment.create({
      data: {
        organizationId: org.id,
        fileName,
        fileKey: "pending", // Placeholder until key is generated
        contentType,
        fileSize,
        status: AttachmentStatus.PENDING,
      },
    });

    const fileKey = provider.createObjectKey({
      organizationId: org.id,
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
      expiresInSeconds: 600, // 10 minutes for public intake
    });

    return {
      success: true,
      attachmentId: attachment.id,
      uploadUrl,
      storageProvider: provider instanceof LocalStorageProvider ? "local" : "gcs",
    };
  } catch (e) {
    console.error("Failed to generate public upload URL", e);
    return { error: "Failed to prepare upload. Please try again." };
  }
}
