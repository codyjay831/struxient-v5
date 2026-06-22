import type { QuoteSignatureEvent, QuoteSignatureDelivery } from "@prisma/client";
import { deriveRequestStatusLabel, deriveRecipientStatusLabel } from "./status-service";

export type SignatureTimelineEvent = {
  id: string;
  occurredAt: string;
  eventType: string;
  label: string;
  actorType: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SignatureTimelineRecipient = {
  id: string;
  name: string | null;
  email: string | null;
  status: string;
  statusLabel: string;
  acceptedByName: string | null;
  lastViewedAt: string | null;
  deliveries: { channel: string; status: string; attemptedAt: string }[];
};

export type SignatureTimelineDto = {
  requestId: string;
  status: string;
  statusLabel: string;
  mode: string;
  sentAt: string | null;
  acceptedAt: string | null;
  sentPdfSha256: string | null;
  finalPdfSha256: string | null;
  auditPacketSha256: string | null;
  recipients: SignatureTimelineRecipient[];
  events: SignatureTimelineEvent[];
};

const EVENT_LABELS: Record<string, string> = {
  SIGNATURE_REQUEST_CREATED: "Signature request created",
  SIGNATURE_REQUEST_SENT: "Signature request sent",
  SIGNATURE_REQUEST_RESENT: "Signature request resent",
  SIGNATURE_REQUEST_REVOKED: "Signature request revoked",
  QUOTE_SENT_EMAIL: "Email sent",
  EMAIL_FAILED: "Email failed",
  SIGNER_LINK_COPIED: "Staff copied signer link",
  SIGNER_LINK_MANUALLY_DELIVERED: "Staff manually delivered link",
  SIGNER_LINK_OPENED: "Signer opened link",
  QUOTE_VIEWED: "Quote viewed",
  PDF_DOWNLOADED: "PDF downloaded",
  CHANGE_REQUESTED: "Change requested",
  CONSENT_CHECKED: "Consent checked",
  TYPED_NAME_SUBMITTED: "Typed name submitted",
  QUOTE_ACCEPTED: "Quote accepted",
  QUOTE_DECLINED: "Quote declined",
  FINAL_PDF_GENERATED: "Final packet generated",
};

function eventLabel(eventType: string, metadata?: Record<string, unknown> | null): string {
  if (eventType === "CHANGE_REQUESTED") {
    const message =
      typeof metadata?.message === "string" ? metadata.message.trim() : "";
    const signer =
      typeof metadata?.signerEmail === "string"
        ? metadata.signerEmail
        : typeof metadata?.signerName === "string"
          ? metadata.signerName
          : null;
    const parts = ["Change requested"];
    if (signer) parts.push(`from ${signer}`);
    if (message) {
      const snippet = message.length > 80 ? `${message.slice(0, 77)}…` : message;
      parts.push(`— ${snippet}`);
    }
    return parts.join(" ");
  }
  return EVENT_LABELS[eventType] ?? eventType.replaceAll("_", " ").toLowerCase();
}

export function buildSignatureTimeline(params: {
  request: {
    id: string;
    status: Parameters<typeof deriveRequestStatusLabel>[0];
    mode: string;
    sentAt: Date | null;
    acceptedAt: Date | null;
    sentPdfSha256: string | null;
    finalPdfSha256: string | null;
    auditPacketSha256: string | null;
  };
  recipients: Array<{
    id: string;
    recipientName: string | null;
    recipientEmail: string | null;
    status: Parameters<typeof deriveRecipientStatusLabel>[0];
    acceptedByName: string | null;
    lastViewedAt: Date | null;
    deliveries: Pick<QuoteSignatureDelivery, "channel" | "status" | "attemptedAt">[];
  }>;
  events: QuoteSignatureEvent[];
}): SignatureTimelineDto {
  return {
    requestId: params.request.id,
    status: params.request.status,
    statusLabel: deriveRequestStatusLabel(params.request.status),
    mode: params.request.mode,
    sentAt: params.request.sentAt?.toISOString() ?? null,
    acceptedAt: params.request.acceptedAt?.toISOString() ?? null,
    sentPdfSha256: params.request.sentPdfSha256,
    finalPdfSha256: params.request.finalPdfSha256,
    auditPacketSha256: params.request.auditPacketSha256,
    recipients: params.recipients.map((r) => ({
      id: r.id,
      name: r.recipientName,
      email: r.recipientEmail,
      status: r.status,
      statusLabel: deriveRecipientStatusLabel(r.status),
      acceptedByName: r.acceptedByName,
      lastViewedAt: r.lastViewedAt?.toISOString() ?? null,
      deliveries: r.deliveries.map((d) => ({
        channel: d.channel,
        status: d.status,
        attemptedAt: d.attemptedAt.toISOString(),
      })),
    })),
    events: params.events.map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt.toISOString(),
      eventType: e.eventType,
      label:
        e.metadataJson && typeof e.metadataJson === "object"
          ? eventLabel(e.eventType, e.metadataJson as Record<string, unknown>)
          : eventLabel(e.eventType),
      actorType: e.actorType,
      ipAddress: e.ipAddress,
      metadata:
        e.metadataJson && typeof e.metadataJson === "object"
          ? (e.metadataJson as Record<string, unknown>)
          : null,
    })),
  };
}
