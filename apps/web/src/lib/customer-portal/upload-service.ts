import {
  AttachmentStatus,
  CustomerPortalEventType,
  CustomerRequestStatus,
  CustomerRequestType,
  CustomerVisibleResourceType,
  CustomerVisibleResourceVisibility,
} from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { getStorageProvider, LocalStorageProvider } from "@/lib/storage";
import type { CustomerPortalAuthContext } from "./authorize";
import { appendCustomerPortalEvent } from "./event-service";
import { accessLevelAllows } from "./visible-resource-service";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export type PreparePortalUploadResult =
  | {
      ok: true;
      attachmentId: string;
      uploadUrl: string;
      storageProvider: "local" | "gcs";
    }
  | { ok: false; error: string };

export async function prepareCustomerPortalUpload(input: {
  session: CustomerPortalAuthContext;
  visibleResourceId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}): Promise<PreparePortalUploadResult> {
  const provider = getStorageProvider();
  if (process.env.NODE_ENV === "production" && provider instanceof LocalStorageProvider) {
    return { ok: false, error: "Upload is not available right now." };
  }

  if (input.fileSize > MAX_FILE_SIZE) {
    return { ok: false, error: "File size exceeds 10MB limit." };
  }
  if (!ALLOWED_TYPES.includes(input.contentType)) {
    return { ok: false, error: "File type not supported. Please upload an image or PDF." };
  }

  const slot = await db.customerVisibleResource.findFirst({
    where: {
      id: input.visibleResourceId,
      organizationId: input.session.organizationId,
      customerId: input.session.customerId,
      jobId: input.session.jobId,
      revokedAt: null,
      visibility: CustomerVisibleResourceVisibility.CUSTOMER_ACTION_REQUIRED,
      resourceType: { in: [CustomerVisibleResourceType.DOCUMENT, CustomerVisibleResourceType.PHOTO] },
    },
  });
  if (!slot) {
    return { ok: false, error: "Upload is not requested for this item." };
  }
  if (!accessLevelAllows(input.session.accessLevel, slot.visibleToAccessLevel)) {
    return { ok: false, error: "You do not have access to upload this file." };
  }

  try {
    const attachment = await db.attachment.create({
      data: {
        organizationId: input.session.organizationId,
        jobId: input.session.jobId,
        customerId: input.session.customerId,
        fileName: input.fileName,
        fileKey: "pending",
        contentType: input.contentType,
        fileSize: input.fileSize,
        status: AttachmentStatus.PENDING,
        description: slot.title ?? undefined,
      },
    });

    const fileKey = provider.createObjectKey({
      organizationId: input.session.organizationId,
      jobId: input.session.jobId,
      attachmentId: attachment.id,
      fileName: input.fileName,
    });

    await db.attachment.update({
      where: { id: attachment.id },
      data: { fileKey },
    });

    const uploadUrl = await provider.createSignedUploadUrl({
      fileKey,
      contentType: input.contentType,
      expiresInSeconds: 600,
    });

    return {
      ok: true,
      attachmentId: attachment.id,
      uploadUrl,
      storageProvider: provider instanceof LocalStorageProvider ? "local" : "gcs",
    };
  } catch {
    return { ok: false, error: "Could not prepare upload." };
  }
}

export async function completeCustomerPortalUpload(input: {
  session: CustomerPortalAuthContext;
  visibleResourceId: string;
  attachmentId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const provider = getStorageProvider();

  const slot = await db.customerVisibleResource.findFirst({
    where: {
      id: input.visibleResourceId,
      organizationId: input.session.organizationId,
      customerId: input.session.customerId,
      jobId: input.session.jobId,
      revokedAt: null,
      visibility: CustomerVisibleResourceVisibility.CUSTOMER_ACTION_REQUIRED,
    },
  });
  if (!slot) {
    return { ok: false, error: "Upload slot not found." };
  }

  const attachment = await db.attachment.findFirst({
    where: {
      id: input.attachmentId,
      organizationId: input.session.organizationId,
      jobId: input.session.jobId,
      customerId: input.session.customerId,
      status: AttachmentStatus.PENDING,
    },
  });
  if (!attachment) {
    return { ok: false, error: "Upload not found." };
  }

  const exists = await provider.confirmObjectExists(attachment.fileKey);
  if (!exists) {
    return { ok: false, error: "Upload could not be verified." };
  }

  const requestType =
    slot.resourceType === CustomerVisibleResourceType.PHOTO
      ? CustomerRequestType.UPLOAD_PHOTO
      : CustomerRequestType.UPLOAD_DOCUMENT;
  const eventType =
    slot.resourceType === CustomerVisibleResourceType.PHOTO
      ? CustomerPortalEventType.PHOTO_UPLOADED
      : CustomerPortalEventType.DOCUMENT_UPLOADED;

  try {
    await db.$transaction(async (tx: ExtendedTransactionClient) => {
      await tx.attachment.update({
        where: { id: attachment.id },
        data: { status: AttachmentStatus.READY },
      });

      const request = await tx.customerRequest.create({
        data: {
          organizationId: input.session.organizationId,
          customerId: input.session.customerId,
          jobId: input.session.jobId,
          customerPortalAccessId: input.session.customerPortalAccessId,
          type: requestType,
          status: CustomerRequestStatus.NEEDS_REVIEW,
          title: slot.title ?? "Customer upload",
          message: `Customer uploaded ${attachment.fileName} for review.`,
          linkedDocumentId: attachment.id,
          metadataJson: { visibleResourceId: slot.id },
        },
      });

      await appendCustomerPortalEvent(
        {
          organizationId: input.session.organizationId,
          customerId: input.session.customerId,
          jobId: input.session.jobId,
          customerPortalAccessId: input.session.customerPortalAccessId,
          portalIdentityId: input.session.portalIdentityId,
          eventType,
          resourceType: "ATTACHMENT",
          resourceId: attachment.id,
          metadataJson: { customerRequestId: request.id, visibleResourceId: slot.id },
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
        tx,
      );

      await tx.customerVisibleResource.update({
        where: { id: slot.id },
        data: {
          visibility: CustomerVisibleResourceVisibility.REVOKED,
          revokedAt: new Date(),
        },
      });
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "Could not finalize upload." };
  }
}
