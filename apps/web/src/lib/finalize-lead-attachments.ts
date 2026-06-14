import { AttachmentStatus } from "@prisma/client";
import { db } from "./db";
import { getStorageProvider } from "./storage";
import { verifyPublicAttachmentUploadToken } from "./attachment-upload-token";

export type FinalizeLeadAttachmentOptions = {
  organizationId: string;
  leadId: string;
  attachmentIds: string[];
  /** Staff uploads must match the uploader's user id. */
  uploadedByUserId?: string;
  /** Public intake uploads must present a valid IP-bound token per attachment. */
  publicUploadTokensById?: Record<string, string>;
  clientIp?: string;
};

/**
 * Associates orphan PENDING lead attachments after verifying storage and uploader binding.
 */
export async function finalizeLeadAttachments(
  options: FinalizeLeadAttachmentOptions,
): Promise<void> {
  const {
    organizationId,
    leadId,
    attachmentIds,
    uploadedByUserId,
    publicUploadTokensById,
    clientIp,
  } = options;

  if (attachmentIds.length === 0) return;

  const provider = getStorageProvider();

  for (const attachmentId of attachmentIds) {
    const attachment = await db.attachment.findFirst({
      where: {
        id: attachmentId,
        organizationId,
        leadId: null,
        status: AttachmentStatus.PENDING,
      },
      select: {
        id: true,
        fileKey: true,
        uploadedByUserId: true,
      },
    });

    if (!attachment || attachment.fileKey === "pending") {
      continue;
    }

    if (uploadedByUserId) {
      if (attachment.uploadedByUserId !== uploadedByUserId) {
        continue;
      }
    } else if (publicUploadTokensById && clientIp) {
      const token = publicUploadTokensById[attachmentId];
      if (
        !token ||
        !verifyPublicAttachmentUploadToken({
          token,
          attachmentId,
          organizationId,
          clientIp,
        })
      ) {
        continue;
      }
    } else {
      continue;
    }

    const exists = await provider.confirmObjectExists(attachment.fileKey);
    if (!exists) {
      continue;
    }

    await db.attachment.update({
      where: { id: attachmentId },
      data: {
        leadId,
        status: AttachmentStatus.READY,
      },
    });
  }
}
