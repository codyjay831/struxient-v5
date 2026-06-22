import { db } from "@/lib/db";
import { buildSignatureTimeline, type SignatureTimelineDto } from "./timeline-presenter";

export async function loadSignatureTimelineForQuote(
  quoteId: string,
  organizationId: string,
): Promise<SignatureTimelineDto | null> {
  const request = await db.quoteSignatureRequest.findFirst({
    where: { quoteId, organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      recipients: {
        include: {
          deliveries: { orderBy: { attemptedAt: "desc" }, take: 5 },
        },
      },
      events: { orderBy: { occurredAt: "asc" } },
    },
  });

  if (!request) return null;

  return buildSignatureTimeline({
    request: {
      id: request.id,
      status: request.status,
      mode: request.mode,
      sentAt: request.sentAt,
      acceptedAt: request.acceptedAt,
      sentPdfSha256: request.sentPdfSha256,
      finalPdfSha256: request.finalPdfSha256,
      auditPacketSha256: request.auditPacketSha256,
    },
    recipients: request.recipients.map((r) => ({
      id: r.id,
      recipientName: r.recipientName,
      recipientEmail: r.recipientEmail,
      status: r.status,
      acceptedByName: r.acceptedByName,
      lastViewedAt: r.lastViewedAt,
      deliveries: r.deliveries,
    })),
    events: request.events,
  });
}

export async function loadSignatureArtifactsForQuote(
  quoteId: string,
  organizationId: string,
): Promise<
  Array<{
    id: string;
    kind: string;
    sha256: string;
    attachmentId: string;
    generatedAt: string;
  }>
> {
  const artifacts = await db.quoteSignatureArtifact.findMany({
    where: { quoteId, organizationId },
    orderBy: { generatedAt: "asc" },
  });
  return artifacts.map((a) => ({
    id: a.id,
    kind: a.kind,
    sha256: a.sha256,
    attachmentId: a.attachmentId,
    generatedAt: a.generatedAt.toISOString(),
  }));
}
