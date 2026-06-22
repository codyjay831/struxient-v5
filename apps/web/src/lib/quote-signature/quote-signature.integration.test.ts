/**
 * DB integration tests for Quote Signature M1.
 * Requires DATABASE_URL and dev seed (dev-org-id).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteSignatureArtifactKind,
  QuoteSignatureEventType,
  QuoteSignatureRequestStatus,
  QuoteStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { DEV_ORGANIZATION_ID, DEV_ORGANIZATION_NAME, DEV_USER_ID } from "@/lib/dev-organization";
import {
  acceptQuoteViaSignatureToken,
  declineQuoteViaSignatureToken,
  submitQuoteChangeRequestViaSignatureToken,
} from "@/lib/quote-signature/accept-service";
import {
  isRecipientTokenValid,
  resolveQuoteSignatureRecipient,
} from "@/lib/quote-signature/recipient-token-service";
import {
  revokeActiveSignatureRequestsForQuoteInTx,
  sendStandardAcceptanceQuoteWithActorContext,
} from "@/lib/quote-signature/request-service";
import { resetResendClientForTests } from "@/lib/resend-from";

const ACTOR = {
  organizationId: DEV_ORGANIZATION_ID,
  organizationName: DEV_ORGANIZATION_NAME,
  userId: DEV_USER_ID,
};

async function requireDevOrg(): Promise<boolean> {
  const org = await db.organization.findUnique({ where: { id: DEV_ORGANIZATION_ID } });
  return Boolean(org);
}

async function createSendReadyDraftQuote(label: string): Promise<string> {
  const serviceLocation = await db.customerServiceLocation.findFirst({
    where: { organizationId: DEV_ORGANIZATION_ID },
    select: { id: true },
  });
  if (!serviceLocation) {
    throw new Error("Dev org missing service location — run prisma db seed");
  }

  const quote = await db.quote.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      title: `Signature integration ${label}`,
      status: QuoteStatus.DRAFT,
      serviceLocationId: serviceLocation.id,
      subtotalCents: 100_000,
      totalCents: 100_000,
      lineItems: {
        create: {
          sortOrder: 0,
          description: "Integration test line",
          quantity: 1,
          unitAmountCents: 100_000,
          lineTotalCents: 100_000,
        },
      },
      paymentSchedule: {
        create: {
          title: "Deposit",
          amountCents: 100_000,
          sortOrder: 0,
        },
      },
    },
    select: { id: true },
  });

  return quote.id;
}

test("integration: send draft quote creates signature request and SENT quote", async (t) => {
  if (!(await requireDevOrg())) {
    t.skip("dev org not seeded");
    return;
  }

  const quoteId = await createSendReadyDraftQuote("send");
  const sendResult = await sendStandardAcceptanceQuoteWithActorContext(
    quoteId,
    { recipients: [{ email: "sig-int-send@test.local", name: "Integration" }], expiresInDays: 7 },
    ACTOR,
  );

  assert.equal(sendResult.ok, true);
  assert.ok(sendResult.signatureRequestId);

  const request = await db.quoteSignatureRequest.findUnique({
    where: { id: sendResult.signatureRequestId! },
    include: { artifacts: true, recipients: true },
  });
  assert.ok(request);
  assert.ok(
    request.status === QuoteSignatureRequestStatus.SENT ||
      request.status === QuoteSignatureRequestStatus.DELIVERY_FAILED,
  );
  assert.ok(request.sentPdfSha256);
  assert.ok(request.artifacts.some((a) => a.kind === QuoteSignatureArtifactKind.SENT_PDF));

  const quote = await db.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
  assert.equal(quote?.status, QuoteStatus.SENT);
  assert.ok(sendResult.recipientTokens?.[0]?.rawToken);
});

test("integration: delivery failure when RESEND_API_KEY is unset", async (t) => {
  if (!(await requireDevOrg())) {
    t.skip("dev org not seeded");
    return;
  }

  const prevKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  resetResendClientForTests();
  try {
    const quoteId = await createSendReadyDraftQuote("delivery-fail");
    const sendResult = await sendStandardAcceptanceQuoteWithActorContext(
      quoteId,
      { recipients: [{ email: "sig-int-fail@test.local" }], expiresInDays: 7 },
      ACTOR,
    );
    assert.equal(sendResult.ok, true);
    assert.equal(sendResult.outcome, "delivery_failed");

    const request = await db.quoteSignatureRequest.findUnique({
      where: { id: sendResult.signatureRequestId! },
    });
    assert.equal(request?.status, QuoteSignatureRequestStatus.DELIVERY_FAILED);
  } finally {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    resetResendClientForTests();
  }
});

test("integration: accept is idempotent and creates approval artifacts", async (t) => {
  if (!(await requireDevOrg())) {
    t.skip("dev org not seeded");
    return;
  }

  const quoteId = await createSendReadyDraftQuote("accept");
  const sendResult = await sendStandardAcceptanceQuoteWithActorContext(
    quoteId,
    { recipients: [{ email: "sig-int-accept@test.local" }], expiresInDays: 7 },
    ACTOR,
  );
  const rawToken = sendResult.recipientTokens?.[0]?.rawToken;
  assert.ok(rawToken);

  const accept1 = await acceptQuoteViaSignatureToken({
    rawToken,
    acceptedByName: "Integration Tester",
    consentChecked: true,
    ip: "127.0.0.1",
    userAgent: "integration-test",
  });
  assert.equal(accept1.ok, true);

  const accept2 = await acceptQuoteViaSignatureToken({
    rawToken,
    acceptedByName: "Integration Tester",
    consentChecked: true,
    ip: "127.0.0.1",
    userAgent: "integration-test",
  });
  assert.equal(accept2.ok, true);
  assert.equal(accept2.alreadyAccepted, true);

  const quote = await db.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
  assert.equal(quote?.status, QuoteStatus.APPROVED);

  const events = await db.quoteSignatureEvent.count({
    where: {
      signatureRequestId: sendResult.signatureRequestId!,
      eventType: QuoteSignatureEventType.QUOTE_ACCEPTED,
    },
  });
  assert.equal(events, 1);
});

test("integration: expired and revoked tokens reject accept", async (t) => {
  if (!(await requireDevOrg())) {
    t.skip("dev org not seeded");
    return;
  }

  const quoteId = await createSendReadyDraftQuote("token-guards");
  const sendResult = await sendStandardAcceptanceQuoteWithActorContext(
    quoteId,
    { recipients: [{ email: "sig-int-guards@test.local" }], expiresInDays: 7 },
    ACTOR,
  );
  const rawToken = sendResult.recipientTokens?.[0]?.rawToken;
  assert.ok(rawToken);

  const recipient = await resolveQuoteSignatureRecipient(rawToken);
  assert.ok(recipient);

  await db.quoteSignatureRecipient.update({
    where: { id: recipient.id },
    data: { tokenExpiresAt: new Date(Date.now() - 60_000) },
  });

  const expired = await acceptQuoteViaSignatureToken({
    rawToken,
    acceptedByName: "Integration Tester",
    consentChecked: true,
    ip: "127.0.0.1",
    userAgent: "integration-test",
  });
  assert.equal(expired.ok, false);

  await db.quoteSignatureRecipient.update({
    where: { id: recipient.id },
    data: {
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      tokenRevokedAt: new Date(),
      status: "REVOKED",
    },
  });
  await db.quoteSignatureRequest.update({
    where: { id: recipient.signatureRequestId },
    data: { status: QuoteSignatureRequestStatus.REVOKED, revokedAt: new Date() },
  });

  const tokenCheck = isRecipientTokenValid(
    await resolveQuoteSignatureRecipient(rawToken).then((r) => r!),
  );
  assert.equal(tokenCheck.ok, false);

  const revoked = await acceptQuoteViaSignatureToken({
    rawToken,
    acceptedByName: "Integration Tester",
    consentChecked: true,
    ip: "127.0.0.1",
    userAgent: "integration-test",
  });
  assert.equal(revoked.ok, false);
});

test("integration: decline keeps quote SENT", async (t) => {
  if (!(await requireDevOrg())) {
    t.skip("dev org not seeded");
    return;
  }

  const quoteId = await createSendReadyDraftQuote("decline");
  const sendResult = await sendStandardAcceptanceQuoteWithActorContext(
    quoteId,
    { recipients: [{ email: "sig-int-decline@test.local" }], expiresInDays: 7 },
    ACTOR,
  );
  const rawToken = sendResult.recipientTokens?.[0]?.rawToken;
  assert.ok(rawToken);

  const decline = await declineQuoteViaSignatureToken({
    rawToken,
    reason: "Too expensive",
    ip: "127.0.0.1",
    userAgent: "integration-test",
  });
  assert.equal(decline.ok, true);

  const quote = await db.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
  assert.equal(quote?.status, QuoteStatus.SENT);

  const request = await db.quoteSignatureRequest.findUnique({
    where: { id: sendResult.signatureRequestId! },
  });
  assert.equal(request?.status, QuoteSignatureRequestStatus.DECLINED);
});

test("integration: change request creates row and correlated signature event", async (t) => {
  if (!(await requireDevOrg())) {
    t.skip("dev org not seeded");
    return;
  }

  const quoteId = await createSendReadyDraftQuote("change");
  const sendResult = await sendStandardAcceptanceQuoteWithActorContext(
    quoteId,
    { recipients: [{ email: "sig-int-change@test.local", name: "Change Tester" }], expiresInDays: 7 },
    ACTOR,
  );
  const rawToken = sendResult.recipientTokens?.[0]?.rawToken;
  assert.ok(rawToken);

  const result = await submitQuoteChangeRequestViaSignatureToken({
    rawToken,
    message: "Please adjust the deck size",
    ip: "127.0.0.1",
    userAgent: "integration-test",
  });
  assert.equal(result.ok, true);

  const changeRequest = await db.quoteChangeRequest.findUnique({
    where: { id: result.changeRequestId },
  });
  assert.ok(changeRequest);
  assert.equal(changeRequest.quoteId, quoteId);

  const event = await db.quoteSignatureEvent.findFirst({
    where: {
      signatureRequestId: sendResult.signatureRequestId!,
      eventType: QuoteSignatureEventType.CHANGE_REQUESTED,
    },
  });
  assert.ok(event);
  const metadata = event.metadataJson as Record<string, unknown>;
  assert.equal(metadata.changeRequestId, result.changeRequestId);
  assert.equal(metadata.signerEmail, "sig-int-change@test.local");
});

test("integration: revoke active signature requests invalidates signer tokens", async (t) => {
  if (!(await requireDevOrg())) {
    t.skip("dev org not seeded");
    return;
  }

  const quoteId = await createSendReadyDraftQuote("revoke");
  const sendResult = await sendStandardAcceptanceQuoteWithActorContext(
    quoteId,
    { recipients: [{ email: "sig-int-revoke@test.local" }], expiresInDays: 7 },
    ACTOR,
  );
  const rawToken = sendResult.recipientTokens?.[0]?.rawToken;
  assert.ok(rawToken);

  await db.$transaction(async (tx) => {
    const { revokedCount } = await revokeActiveSignatureRequestsForQuoteInTx(tx, {
      quoteId,
      organizationId: DEV_ORGANIZATION_ID,
      actorUserId: DEV_USER_ID,
      reason: "quote_revision",
      metadata: { resultingQuoteId: "draft-revision-placeholder" },
    });
    assert.equal(revokedCount, 1);
  });

  const request = await db.quoteSignatureRequest.findUnique({
    where: { id: sendResult.signatureRequestId! },
  });
  assert.equal(request?.status, QuoteSignatureRequestStatus.REVOKED);

  const acceptAfterRevoke = await acceptQuoteViaSignatureToken({
    rawToken,
    acceptedByName: "Integration Tester",
    consentChecked: true,
    ip: "127.0.0.1",
    userAgent: "integration-test",
  });
  assert.equal(acceptAfterRevoke.ok, false);
});
