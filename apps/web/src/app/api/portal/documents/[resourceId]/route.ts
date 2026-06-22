import { NextRequest, NextResponse } from "next/server";
import {
  AttachmentStatus,
  CustomerVisibleResourceType,
  CustomerVisibleResourceVisibility,
  CustomerPortalEventType,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";
import {
  CustomerPortalAccessDeniedError,
  requireCustomerPortalAccess,
} from "@/lib/customer-portal/authorize";
import { accessLevelAllows } from "@/lib/customer-portal/visible-resource-service";
import { appendCustomerPortalEvent } from "@/lib/customer-portal/event-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  try {
    const { resourceId } = await params;
    const session = await requireCustomerPortalAccess();

    const visible = await db.customerVisibleResource.findFirst({
      where: {
        id: resourceId,
        organizationId: session.organizationId,
        customerId: session.customerId,
        jobId: session.jobId,
        revokedAt: null,
        visibility: CustomerVisibleResourceVisibility.CUSTOMER_VISIBLE,
        resourceType: {
          in: [CustomerVisibleResourceType.DOCUMENT, CustomerVisibleResourceType.PHOTO],
        },
      },
    });

    if (!visible || !accessLevelAllows(session.accessLevel, visible.visibleToAccessLevel)) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const attachment = await db.attachment.findFirst({
      where: {
        id: visible.resourceId,
        organizationId: session.organizationId,
        jobId: session.jobId,
        status: AttachmentStatus.READY,
      },
      select: {
        fileKey: true,
        fileName: true,
        contentType: true,
      },
    });

    if (!attachment) {
      return new NextResponse("Not Found", { status: 404 });
    }

    void appendCustomerPortalEvent({
      organizationId: session.organizationId,
      customerId: session.customerId,
      jobId: session.jobId,
      customerPortalAccessId: session.customerPortalAccessId,
      portalIdentityId: session.portalIdentityId,
      eventType: CustomerPortalEventType.DOCUMENT_VIEWED,
      resourceType: "ATTACHMENT",
      resourceId: visible.resourceId,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0] ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    const provider = getStorageProvider();
    const stream = await provider.readObject(attachment.fileKey);

    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Disposition": `inline; filename="${attachment.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof CustomerPortalAccessDeniedError) {
      return new NextResponse("Not Found", { status: 404 });
    }
    return new NextResponse("Not Found", { status: 404 });
  }
}
