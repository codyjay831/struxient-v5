import { NextResponse } from "next/server";
import { join } from "path";
import { readFile } from "fs/promises";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrNull } from "@/lib/auth-context";
import { denyUnlessCanViewSignatureAudit } from "@/lib/quote-signature/permissions";
import { getStorageProvider, LocalStorageProvider } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ artifactId: string }> },
) {
  const ctx = await getCommercialRequestContextOrNull();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = denyUnlessCanViewSignatureAudit(ctx.role);
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 403 });
  }

  const { artifactId } = await context.params;
  const artifact = await db.quoteSignatureArtifact.findFirst({
    where: { id: artifactId, organizationId: ctx.organizationId },
  });
  if (!artifact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = await db.attachment.findFirst({
    where: { id: artifact.attachmentId, organizationId: ctx.organizationId },
  });
  if (!attachment || attachment.status !== "READY") {
    return NextResponse.json({ error: "Not ready" }, { status: 404 });
  }

  const storage = getStorageProvider();
  if (!(storage instanceof LocalStorageProvider)) {
    return NextResponse.json({ error: "Download unavailable" }, { status: 501 });
  }

  const buffer = await readFile(join(process.cwd(), "public", "uploads", attachment.fileKey));
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${attachment.fileName}"`,
    },
  });
}
