import { db, type ExtendedTransactionClient } from "@/lib/db";
import {
  AttachmentStatus,
  QuoteSignatureArtifactKind,
  type Prisma,
} from "@prisma/client";
import {
  renderQuoteAcceptancePdf,
  renderQuoteAuditPacketPdf,
  renderQuoteProposalPdf,
  type AuditPacketMetadata,
} from "@/lib/quote-pdf";
import type { QuoteCustomerPreviewDocument } from "@/lib/quote-customer-projection";
import { getStorageProvider } from "@/lib/storage";
import { sha256Hex } from "./hash";

type DbClient = ExtendedTransactionClient | typeof db;

export async function storeSignaturePdfArtifact(
  client: DbClient,
  params: {
    organizationId: string;
    quoteId: string;
    signatureRequestId: string;
    recipientId?: string | null;
    kind: QuoteSignatureArtifactKind;
    fileName: string;
    pdfBuffer: Buffer;
    customerId?: string | null;
    leadId?: string | null;
    metadataJson?: Prisma.InputJsonValue;
  },
): Promise<{ attachmentId: string; artifactId: string; sha256: string }> {
  const sha256 = sha256Hex(params.pdfBuffer);

  const attachment = await client.attachment.create({
    data: {
      organizationId: params.organizationId,
      quoteId: params.quoteId,
      customerId: params.customerId ?? undefined,
      leadId: params.leadId ?? undefined,
      fileName: params.fileName,
      fileKey: "PENDING",
      contentType: "application/pdf",
      fileSize: params.pdfBuffer.length,
      description: params.kind,
      status: AttachmentStatus.PENDING,
    },
  });

  const storage = getStorageProvider();
  const fileKey = storage.createObjectKey({
    organizationId: params.organizationId,
    attachmentId: attachment.id,
    fileName: params.fileName,
  });

  await storage.writeObject(fileKey, params.pdfBuffer, "application/pdf");
  await client.attachment.update({
    where: { id: attachment.id },
    data: { fileKey, status: AttachmentStatus.READY },
  });

  const artifact = await client.quoteSignatureArtifact.create({
    data: {
      organizationId: params.organizationId,
      quoteId: params.quoteId,
      signatureRequestId: params.signatureRequestId,
      recipientId: params.recipientId ?? undefined,
      attachmentId: attachment.id,
      kind: params.kind,
      sha256,
      metadataJson: params.metadataJson,
    },
  });

  return { attachmentId: attachment.id, artifactId: artifact.id, sha256 };
}

export async function generateAndStoreSentPdf(
  client: DbClient,
  params: {
    organizationId: string;
    quoteId: string;
    signatureRequestId: string;
    document: QuoteCustomerPreviewDocument;
    customerId?: string | null;
    leadId?: string | null;
  },
): Promise<{ sha256: string; artifactId: string }> {
  const pdfBuffer = await renderQuoteProposalPdf(params.document);
  const result = await storeSignaturePdfArtifact(client, {
    organizationId: params.organizationId,
    quoteId: params.quoteId,
    signatureRequestId: params.signatureRequestId,
    kind: QuoteSignatureArtifactKind.SENT_PDF,
    fileName: `quote_sent_${params.quoteId}.pdf`,
    pdfBuffer,
    customerId: params.customerId,
    leadId: params.leadId,
  });
  return { sha256: result.sha256, artifactId: result.artifactId };
}

export async function generateAndStoreFinalPacket(
  client: DbClient,
  params: {
    organizationId: string;
    quoteId: string;
    signatureRequestId: string;
    recipientId: string;
    document: QuoteCustomerPreviewDocument;
    acceptance: {
      acceptedByName: string;
      acceptedAtIso: string;
      ip?: string;
      userAgent?: string | null;
    };
    auditMetadata: AuditPacketMetadata;
    customerId?: string | null;
    leadId?: string | null;
  },
): Promise<{
  finalPdfSha256: string;
  auditPacketSha256: string;
  finalPdfArtifactId: string;
  auditPacketArtifactId: string;
}> {
  const signedPdf = await renderQuoteAcceptancePdf(params.document, params.acceptance);
  const signedResult = await storeSignaturePdfArtifact(client, {
    organizationId: params.organizationId,
    quoteId: params.quoteId,
    signatureRequestId: params.signatureRequestId,
    recipientId: params.recipientId,
    kind: QuoteSignatureArtifactKind.FINAL_SIGNED_PDF,
    fileName: `quote_signed_${params.quoteId}.pdf`,
    pdfBuffer: signedPdf,
    customerId: params.customerId,
    leadId: params.leadId,
  });

  const auditMetadata: AuditPacketMetadata = {
    ...params.auditMetadata,
    finalPdfSha256: signedResult.sha256,
  };

  const auditPdf = await renderQuoteAuditPacketPdf(params.document, auditMetadata);
  const auditResult = await storeSignaturePdfArtifact(client, {
    organizationId: params.organizationId,
    quoteId: params.quoteId,
    signatureRequestId: params.signatureRequestId,
    recipientId: params.recipientId,
    kind: QuoteSignatureArtifactKind.FINAL_AUDIT_PACKET,
    fileName: `quote_audit_${params.quoteId}.pdf`,
    pdfBuffer: auditPdf,
    customerId: params.customerId,
    leadId: params.leadId,
  });

  return {
    finalPdfSha256: signedResult.sha256,
    auditPacketSha256: auditResult.sha256,
    finalPdfArtifactId: signedResult.artifactId,
    auditPacketArtifactId: auditResult.artifactId,
  };
}
