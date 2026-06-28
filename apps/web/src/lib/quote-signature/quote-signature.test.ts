import assert from "node:assert/strict";
import test from "node:test";
import { sha256Hex, sha256Json } from "@/lib/quote-signature/hash";
import {
  hashSignerToken,
  createSignerTokenPair,
} from "@/lib/quote-signature/recipient-token-service";
import {
  deriveRequestStatusLabel,
  isActiveSignatureRequestStatus,
} from "@/lib/quote-signature/status-service";
import { buildSignatureTimeline } from "@/lib/quote-signature/timeline-presenter";
import {
  canViewSignatureRawAuditFields,
  denyUnlessCanSendQuoteSignature,
} from "@/lib/quote-signature/permissions";
import { QuoteSignatureRequestStatus, StaffRole } from "@prisma/client";

test("sha256Hex is stable for same bytes", () => {
  const buf = Buffer.from("hello");
  assert.equal(sha256Hex(buf), sha256Hex(buf));
});

test("sha256Json is stable for same object", () => {
  const wire = { document: { totalCents: 100 } };
  assert.equal(sha256Json(wire), sha256Json({ document: { totalCents: 100 } }));
});

test("createSignerTokenPair returns raw token and hash", () => {
  const pair = createSignerTokenPair();
  assert.ok(pair.rawToken.length > 20);
  assert.equal(hashSignerToken(pair.rawToken), pair.tokenHash);
});

test("delivery failed is an active request status", () => {
  assert.equal(isActiveSignatureRequestStatus(QuoteSignatureRequestStatus.DELIVERY_FAILED), true);
});

test("deriveRequestStatusLabel for accepted", () => {
  assert.equal(deriveRequestStatusLabel(QuoteSignatureRequestStatus.ACCEPTED), "Accepted");
});

test("buildSignatureTimeline produces staff DTO", () => {
  const dto = buildSignatureTimeline({
    request: {
      id: "req1",
      status: QuoteSignatureRequestStatus.SENT,
      mode: "STANDARD_ACCEPTANCE",
      sentAt: new Date("2026-06-22T12:00:00Z"),
      acceptedAt: null,
      sentPdfSha256: "abc",
      finalPdfSha256: null,
      auditPacketSha256: null,
    },
    recipients: [
      {
        id: "rec1",
        recipientName: "Pat",
        recipientEmail: "pat@example.com",
        status: "SENT",
        acceptedByName: null,
        lastViewedAt: null,
        deliveries: [
          {
            channel: "EMAIL",
            status: "sent",
            attemptedAt: new Date("2026-06-22T12:00:01Z"),
          },
        ],
      },
    ],
    events: [
      {
        id: "ev1",
        organizationId: "org",
        quoteId: "q1",
        signatureRequestId: "req1",
        recipientId: "rec1",
        actorType: "SYSTEM",
        actorUserId: null,
        eventType: "SIGNATURE_REQUEST_SENT",
        occurredAt: new Date("2026-06-22T12:00:01Z"),
        ipAddress: null,
        userAgent: null,
        provider: null,
        providerEventId: null,
        metadataJson: null,
        createdAt: new Date("2026-06-22T12:00:01Z"),
      },
    ],
  });
  assert.equal(dto.statusLabel, "Sent");
  assert.equal(dto.recipients[0]?.email, "pat@example.com");
  assert.equal(dto.events[0]?.label, "Signature request sent");
});

test("buildSignatureTimeline labels change requests with signer context", () => {
  const dto = buildSignatureTimeline({
    request: {
      id: "req1",
      status: QuoteSignatureRequestStatus.SENT,
      mode: "STANDARD_ACCEPTANCE",
      sentAt: new Date("2026-06-22T12:00:00Z"),
      acceptedAt: null,
      sentPdfSha256: null,
      finalPdfSha256: null,
      auditPacketSha256: null,
    },
    recipients: [],
    events: [
      {
        id: "ev-change",
        organizationId: "org",
        quoteId: "q1",
        signatureRequestId: "req1",
        recipientId: "rec1",
        actorType: "CUSTOMER_SIGNER",
        actorUserId: null,
        eventType: "CHANGE_REQUESTED",
        occurredAt: new Date("2026-06-22T12:00:01Z"),
        ipAddress: null,
        userAgent: null,
        provider: null,
        providerEventId: null,
        metadataJson: {
          message: "Please adjust the deck size",
          signerEmail: "pat@example.com",
          changeRequestId: "cr1",
        },
        createdAt: new Date("2026-06-22T12:00:01Z"),
      },
    ],
  });
  assert.match(dto.events[0]?.label ?? "", /Change requested from pat@example.com/);
  assert.match(dto.events[0]?.label ?? "", /adjust the deck size/);
});

test("viewer cannot send quote signature", () => {
  assert.notEqual(denyUnlessCanSendQuoteSignature(StaffRole.VIEWER), null);
});

test("field and subcontractor cannot send quote signature", () => {
  assert.notEqual(denyUnlessCanSendQuoteSignature(StaffRole.FIELD), null);
  assert.notEqual(denyUnlessCanSendQuoteSignature(StaffRole.SUBCONTRACTOR), null);
});

test("office can send quote signature", () => {
  assert.equal(denyUnlessCanSendQuoteSignature(StaffRole.OFFICE), null);
});

test("raw audit visibility limited to owner/admin", () => {
  assert.equal(canViewSignatureRawAuditFields(StaffRole.ADMIN), true);
  assert.equal(canViewSignatureRawAuditFields(StaffRole.OFFICE), false);
});
