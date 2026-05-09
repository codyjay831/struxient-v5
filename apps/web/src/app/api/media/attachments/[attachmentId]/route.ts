import { NextRequest, NextResponse } from "next/server";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { readFile } from "fs/promises";
import { join } from "path";

/**
 * Protected media route for task proof attachments.
 * Verifies tenant access before streaming the file from local storage.
 * Local storage is dev-only; this will be swapped for GCS/S3 in production.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const { attachmentId } = await params;
    const ctx = await getRequestContextOrThrow();

    // Production guard: Local filesystem storage is for development only.
    // In production, this route should be updated to fetch from GCS/S3.
    if (process.env.NODE_ENV === "production") {
      console.error("Local filesystem storage accessed in production. This is forbidden.");
      return new NextResponse("Internal Server Error: Storage Misconfiguration", { status: 500 });
    }

    const attachment = await db.attachment.findFirst({
      where: {
        id: attachmentId,
        organizationId: ctx.organizationId,
      },
    });

    if (!attachment) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Harden fileKey: ensure it doesn't contain path traversal.
    // We normalize it to just the filename within the uploads directory.
    const fileName = attachment.fileKey.replace(/^\/?uploads\//, "");
    
    // Safety check: no path traversal
    if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
      console.error("Potential path traversal attempt detected in fileKey:", attachment.fileKey);
      return new NextResponse("Forbidden", { status: 403 });
    }

    const uploadDir = join(process.cwd(), "public", "uploads");
    const filePath = join(uploadDir, fileName);

    try {
      const fileBuffer = await readFile(filePath);
      
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": attachment.contentType,
          "Content-Disposition": `inline; filename="${attachment.fileName}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (e) {
      console.error("Failed to read attachment file:", filePath, e);
      return new NextResponse("File Not Found on Disk", { status: 404 });
    }
  } catch (e) {
    console.error("Error in attachment media route:", e);
    return new NextResponse("Unauthorized", { status: 401 });
  }
}
