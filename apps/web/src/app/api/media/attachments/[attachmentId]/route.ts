import { NextRequest, NextResponse } from "next/server";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";
import { AttachmentStatus } from "@prisma/client";
import { canReadCommercial } from "@/lib/authz/capabilities";
import {
  getJobVisibilityWhere,
  getTaskVisibilityWhere,
} from "@/lib/authz/resource-access";

/**
 * Protected media route for task proof attachments.
 * Verifies tenant access before streaming the file from the configured storage provider.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const { attachmentId } = await params;
    const ctx = await getRequestContextOrThrow();

    const attachment = await db.attachment.findFirst({
      where: {
        id: attachmentId,
        organizationId: ctx.organizationId,
      },
      select: {
        id: true,
        status: true,
        fileKey: true,
        fileName: true,
        contentType: true,
        organizationId: true,
        jobId: true,
        jobTaskId: true,
        quoteId: true,
        leadId: true,
        customerId: true,
      },
    });

    if (!attachment || attachment.status !== AttachmentStatus.READY) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const jobVisibilityWhere = getJobVisibilityWhere(ctx.role, ctx.userId);
    const taskVisibilityWhere = getTaskVisibilityWhere(ctx.role, ctx.userId);
    const commercialReadable = canReadCommercial(ctx.role);

    let canAccess = false;
    if (attachment.jobTaskId) {
      const task = await db.jobTask.findFirst({
        where: {
          id: attachment.jobTaskId,
          ...taskVisibilityWhere,
          job: {
            organizationId: ctx.organizationId,
            ...jobVisibilityWhere,
          },
        },
        select: { id: true },
      });
      canAccess = Boolean(task);
    } else if (attachment.jobId) {
      const job = await db.job.findFirst({
        where: {
          id: attachment.jobId,
          organizationId: ctx.organizationId,
          ...jobVisibilityWhere,
        },
        select: { id: true },
      });
      canAccess = Boolean(job);
    } else if (attachment.quoteId || attachment.leadId || attachment.customerId) {
      canAccess = commercialReadable;
    } else {
      canAccess = commercialReadable;
    }

    if (!canAccess) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const provider = getStorageProvider();

    try {
      const stream = await provider.readObject(attachment.fileKey);
      
      // Convert Node.js Readable stream to Web ReadableStream for NextResponse
      const webStream = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk) => controller.enqueue(chunk));
          stream.on("end", () => controller.close());
          stream.on("error", (err) => controller.error(err));
        },
        cancel() {
          stream.destroy();
        }
      });

      return new NextResponse(webStream, {
        headers: {
          "Content-Type": attachment.contentType,
          "Content-Disposition": `inline; filename="${attachment.fileName}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (e) {
      console.error("Failed to read attachment from storage:", attachment.fileKey, e);
      return new NextResponse("File Not Found in Storage", { status: 404 });
    }
  } catch (e) {
    console.error("Error in attachment media route:", e);
    return new NextResponse("Unauthorized", { status: 401 });
  }
}
