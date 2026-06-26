/**
 * M1 Quote Signature smoke test — run: npx tsx scripts/smoke-quote-signature.ts
 * Requires: DATABASE_URL, dev seed, NODE_ENV=development
 */
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import {
  QuoteSignatureArtifactKind,
  QuoteSignatureRequestStatus,
  QuoteStatus,
} from "@prisma/client";
import { evaluateQuoteSendReadiness } from "../src/lib/quote/quote-send-readiness";
import {
  acceptQuoteViaSignatureToken,
  recordSignerView,
} from "../src/lib/quote-signature/accept-service";
import {
  recordManualSignerLinkDelivery,
  recordSignerLinkCopied,
  sendStandardAcceptanceQuoteWithActorContext,
} from "../src/lib/quote-signature/request-service";
import { DEV_ORGANIZATION_ID, DEV_ORGANIZATION_NAME, DEV_USER_ID } from "../src/lib/dev-organization";

const SMOKE_ACTOR = {
  organizationId: DEV_ORGANIZATION_ID,
  organizationName: DEV_ORGANIZATION_NAME,
  userId: DEV_USER_ID,
};

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

function pass(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string): never {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
}

async function ensureSendReadyDraftQuote(): Promise<string> {
  const existing = await findSendReadyDraftQuote();
  if (existing) return existing;

  const candidate = await db.quote.findFirst({
    where: {
      organizationId: DEV_ORGANIZATION_ID,
      status: QuoteStatus.DRAFT,
      lineItems: { some: {} },
    },
    select: {
      id: true,
      serviceLocationId: true,
      _count: { select: { paymentSchedule: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!candidate) {
    fail("No DRAFT quote with line items in dev org. Run: npx prisma db seed");
  }

  if (!candidate.serviceLocationId) {
    const sl = await db.customerServiceLocation.findFirst({
      where: { organizationId: DEV_ORGANIZATION_ID },
      select: { id: true },
    });
    if (!sl) fail("No customer service location in dev org. Run: npx prisma db seed");
    await db.quote.update({
      where: { id: candidate.id },
      data: { serviceLocationId: sl.id },
    });
    pass(`Attached service location to quote ${candidate.id}`);
  }

  if (candidate._count.paymentSchedule === 0) {
    await db.paymentScheduleItem.create({
      data: {
        quoteId: candidate.id,
        title: "Deposit (smoke test)",
        amountCents: 10_000,
        sortOrder: 0,
      },
    });
    pass(`Added payment schedule to quote ${candidate.id}`);
  }

  const ready = await findSendReadyDraftQuote();
  if (!ready) fail("Could not prepare send-ready quote");
  return ready;
}

async function findSendReadyDraftQuote(): Promise<string | null> {
  const quotes = await db.quote.findMany({
    where: { organizationId: DEV_ORGANIZATION_ID, status: QuoteStatus.DRAFT },
    select: {
      id: true,
      status: true,
      serviceLocationId: true,
      _count: { select: { lineItems: true, paymentSchedule: true, scopeDecisions: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  for (const q of quotes) {
    const scopeDecisions = await db.quoteScopeDecision.findMany({
      where: {
        quoteId: q.id,
        organizationId: DEV_ORGANIZATION_ID,
      },
      select: {
        id: true,
        quoteLineItemId: true,
        status: true,
        quoteImpact: true,
        resolutionTiming: true,
        title: true,
      },
    });
    const readiness = evaluateQuoteSendReadiness({
      status: q.status,
      lineItemCount: q._count.lineItems,
      serviceLocationId: q.serviceLocationId,
      paymentScheduleItemCount: q._count.paymentSchedule,
      scopeDecisions,
    });
    if (readiness.ok) return q.id;
  }
  return null;
}

async function main() {
  console.log("Quote Signature M1 smoke test\n");

  const quoteId = await ensureSendReadyDraftQuote();
  pass(`Found send-ready draft quote: ${quoteId}`);

  const sendResult = await sendStandardAcceptanceQuoteWithActorContext(
    quoteId,
    {
      recipients: [{ email: "signature-smoke@test.local", name: "Smoke Tester" }],
      expiresInDays: 30,
      customMessage: "Automated smoke test",
    },
    SMOKE_ACTOR,
  );

  if (!sendResult.ok || !sendResult.signatureRequestId) {
    fail(`Send failed: ${sendResult.error ?? "unknown"}`);
  }
  pass(`Send completed: outcome=${sendResult.outcome}, request=${sendResult.signatureRequestId}`);

  const request = await db.quoteSignatureRequest.findUnique({
    where: { id: sendResult.signatureRequestId },
    include: { recipients: true, artifacts: true },
  });
  if (!request) fail("Signature request not found after send");
  if (
    request.status !== QuoteSignatureRequestStatus.SENT &&
    request.status !== QuoteSignatureRequestStatus.DELIVERY_FAILED
  ) {
    fail(`Unexpected request status: ${request.status}`);
  }
  pass(`Request status: ${request.status}`);
  if (!request.sentPdfSha256) fail("Missing sentPdfSha256");
  pass("Sent PDF hash stored");

  const sentArtifact = request.artifacts.find((a) => a.kind === QuoteSignatureArtifactKind.SENT_PDF);
  if (!sentArtifact) fail("SENT_PDF artifact missing");
  pass("SENT_PDF artifact created");

  const quoteAfterSend = await db.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
  if (quoteAfterSend?.status !== QuoteStatus.SENT) {
    fail(`Quote should be SENT after send, got ${quoteAfterSend?.status}`);
  }
  pass("Quote status → SENT");

  const rawToken = sendResult.recipientTokens?.[0]?.rawToken;
  const recipientId = sendResult.recipientTokens?.[0]?.recipientId;
  if (!rawToken || !recipientId) fail("Missing recipient token from send result");
  pass("Recipient token returned from send");

  await recordSignerView({ rawToken, ip: "127.0.0.1", userAgent: "smoke-test" });
  pass("Signer view recorded");

  const pageRes = await fetch(`${BASE_URL}/q/sign/${rawToken}`);
  if (!pageRes.ok) fail(`Signer page HTTP ${pageRes.status}`);
  pass(`Signer page HTTP ${pageRes.status}`);

  const pdfRes = await fetch(`${BASE_URL}/q/sign/${rawToken}/sent-pdf`);
  if (!pdfRes.ok) fail(`Sent PDF HTTP ${pdfRes.status}`);
  const pdfCt = pdfRes.headers.get("content-type") ?? "";
  if (!pdfCt.includes("pdf")) fail(`Sent PDF wrong content-type: ${pdfCt}`);
  pass("Sent PDF download OK");

  if (
    sendResult.outcome === "delivery_failed" ||
    request.status === QuoteSignatureRequestStatus.DELIVERY_FAILED
  ) {
    const copyResult = await recordSignerLinkCopied(sendResult.signatureRequestId, recipientId);
    if (!copyResult.ok) fail(`Copy link failed: ${copyResult.error}`);
    pass("Copy signer link recorded");
    await recordManualSignerLinkDelivery(sendResult.signatureRequestId, recipientId);
    pass("Manual delivery recorded (delivery_failed path)");
  } else {
    pass("Email delivery path — skipping manual delivery / copy-link checks");
  }

  const accept1 = await acceptQuoteViaSignatureToken({
    rawToken,
    acceptedByName: "Smoke Tester",
    consentChecked: true,
    ip: "127.0.0.1",
    userAgent: "smoke-test",
  });
  if (!accept1.ok) fail(`Accept failed: ${accept1.error}`);
  pass("Accept succeeded");

  const accept2 = await acceptQuoteViaSignatureToken({
    rawToken,
    acceptedByName: "Smoke Tester",
    consentChecked: true,
    ip: "127.0.0.1",
    userAgent: "smoke-test",
  });
  if (!accept2.ok || !accept2.alreadyAccepted) {
    fail("Second accept should be idempotent (alreadyAccepted)");
  }
  pass("Accept idempotent on retry");

  const quoteApproved = await db.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
  if (quoteApproved?.status !== QuoteStatus.APPROVED) {
    fail(`Quote should be APPROVED, got ${quoteApproved?.status}`);
  }
  pass("Quote status → APPROVED");

  const requestAccepted = await db.quoteSignatureRequest.findUnique({
    where: { id: sendResult.signatureRequestId },
    include: { artifacts: true, events: true },
  });
  if (requestAccepted?.status !== QuoteSignatureRequestStatus.ACCEPTED) {
    fail(`Request should be ACCEPTED, got ${requestAccepted?.status}`);
  }
  const finalPdf = requestAccepted?.artifacts.find(
    (a) => a.kind === QuoteSignatureArtifactKind.FINAL_SIGNED_PDF,
  );
  const auditPacket = requestAccepted?.artifacts.find(
    (a) => a.kind === QuoteSignatureArtifactKind.FINAL_AUDIT_PACKET,
  );
  if (!finalPdf || !auditPacket) fail("Final signed PDF or audit packet missing");
  pass("Final artifacts stored");

  const hasAcceptedEvent = requestAccepted.events.some((e) => e.eventType === "QUOTE_ACCEPTED");
  if (!hasAcceptedEvent) fail("QUOTE_ACCEPTED event missing");
  pass("QUOTE_ACCEPTED event recorded");

  console.log("\nSmoke test PASSED");
}

main()
  .catch((e) => {
    console.error("\nSmoke test FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
