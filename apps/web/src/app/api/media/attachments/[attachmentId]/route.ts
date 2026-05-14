import { NextRequest, NextResponse } from "next/server";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";
import { AttachmentStatus } from "@prisma/client";

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
    });

    if (!attachment || attachment.status !== AttachmentStatus.READY) {
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
