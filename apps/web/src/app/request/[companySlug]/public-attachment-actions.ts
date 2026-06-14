"use server";

import { db } from "@/lib/db";
import { AttachmentStatus } from "@prisma/client";
import { getStorageProvider, LocalStorageProvider } from "@/lib/storage";
import { isValidPublicCompanySlugSegment } from "@/lib/public-request-slug";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { createPublicAttachmentUploadToken } from "@/lib/attachment-upload-token";

export type PublicUploadAttachmentState = {
  error?: string;
  success?: boolean;
  attachmentId?: string;
  uploadUrl?: string;
  uploadToken?: string;
  storageProvider?: "local" | "gcs";
};

const ATTACHMENT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const ATTACHMENT_MAX_REQUESTS_PER_WINDOW = 15;

export async function getPublicLeadAttachmentUploadUrlAction(
  companySlug: string,
  fileName: string,
  contentType: string,
  fileSize: number,
): Promise<PublicUploadAttachmentState> {
  const normalizedSlug = companySlug.trim().toLowerCase();
  if (!isValidPublicCompanySlugSegment(normalizedSlug)) {
    return { error: "Invalid request." };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limiterKey = `${normalizedSlug}:${ip}`;
  if (
    !(await checkRateLimit(limiterKey, {
      windowMs: ATTACHMENT_RATE_LIMIT_WINDOW_MS,
      max: ATTACHMENT_MAX_REQUESTS_PER_WINDOW,
      keyPrefix: "public-intake-attachments",
    }))
  ) {
    return { error: "Too many upload attempts. Please try again in a little while." };
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
    // Follow-up policy: stale PENDING public attachments should be cleaned by a
    // scheduled maintenance task once a repo-level maintenance runner exists.
    // Create the attachment record first to get a real ID
    // Note: No leadId yet, it will be associated during lead submission
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

    const uploadToken = createPublicAttachmentUploadToken({
      attachmentId: attachment.id,
      organizationId: org.id,
      clientIp: ip,
    });

    return {
      success: true,
      attachmentId: attachment.id,
      uploadUrl,
      uploadToken,
      storageProvider: provider instanceof LocalStorageProvider ? "local" : "gcs",
    };
  } catch (e) {
    console.error("Failed to generate public upload URL", e);
    return { error: "Failed to prepare upload. Please try again." };
  }
}
