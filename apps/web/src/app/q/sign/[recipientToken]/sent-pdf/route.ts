import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { QuoteSignatureArtifactKind } from "@prisma/client";
import {
  isRecipientTokenValid,
  resolveQuoteSignatureRecipient,
} from "@/lib/quote-signature/recipient-token-service";
import { recordSignerPdfDownload } from "@/lib/quote-signature/accept-service";
import { getStorageProvider, LocalStorageProvider } from "@/lib/storage";
import { join } from "path";
import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ recipientToken: string }> },
) {
  const { recipientToken } = await context.params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const userAgent = request.headers.get("user-agent");

  const recipient = await resolveQuoteSignatureRecipient(recipientToken);
  if (!recipient) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tokenValid = isRecipientTokenValid(recipient);
  if (!tokenValid.ok && tokenValid.reason !== "accepted") {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  await recordSignerPdfDownload({ rawToken: recipientToken, ip, userAgent });

  const artifact = await db.quoteSignatureArtifact.findFirst({
    where: {
      signatureRequestId: recipient.signatureRequestId,
      kind: QuoteSignatureArtifactKind.SENT_PDF,
    },
  });
  if (!artifact) {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }

  const attachment = await db.attachment.findFirst({
    where: { id: artifact.attachmentId, organizationId: recipient.organizationId },
  });
  if (!attachment || attachment.status !== "READY") {
    return NextResponse.json({ error: "PDF not ready" }, { status: 404 });
  }

  const storage = getStorageProvider();
  let buffer: Buffer;
  if (storage instanceof LocalStorageProvider) {
    const filePath = join(process.cwd(), "public", "uploads", attachment.fileKey);
    buffer = await readFile(filePath);
  } else {
    return NextResponse.json({ error: "Download unavailable" }, { status: 501 });
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${attachment.fileName}"`,
    },
  });
}
