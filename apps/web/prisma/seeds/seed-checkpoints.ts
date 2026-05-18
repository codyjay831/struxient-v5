/**
 * Dev seed helpers for SEND / APPROVAL checkpoints using canonical snapshot builders.
 */

import {
  Prisma,
  QuoteCheckpointKind,
  QuoteCheckpointSource,
  QuoteStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  quoteRowToCustomerPreviewInput,
  quoteSelectForCustomerProposalCheckpoint,
  serializeCustomerPreviewDocumentForCheckpoint,
} from "../../src/lib/quote-checkpoint-snapshot";
import { buildCustomerQuotePreviewDocument } from "../../src/lib/quote-customer-projection";

async function createCheckpoint(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    organizationName: string;
    quoteId: string;
    kind: QuoteCheckpointKind;
    expectedStatus: QuoteStatus;
  },
) {
  const quote = await prisma.quote.findFirst({
    where: {
      id: input.quoteId,
      organizationId: input.organizationId,
      status: input.expectedStatus,
    },
    select: quoteSelectForCustomerProposalCheckpoint,
  });

  if (!quote) {
    throw new Error(
      `[seed checkpoint] quote ${input.quoteId} not found at status ${input.expectedStatus}`,
    );
  }

  const previewInput = quoteRowToCustomerPreviewInput(quote, input.organizationId);
  const { document, staffOnly } = buildCustomerQuotePreviewDocument(previewInput, {
    organizationDisplayName: input.organizationName,
  });
  const snapshotWire = serializeCustomerPreviewDocumentForCheckpoint(document);

  const aggregate = await prisma.quoteCheckpoint.aggregate({
    where: {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      kind: input.kind,
    },
    _max: { sequence: true },
  });
  const nextSequence = (aggregate._max.sequence ?? 0) + 1;

  await prisma.quoteCheckpoint.deleteMany({
    where: {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      kind: input.kind,
    },
  });

  await prisma.quoteCheckpoint.create({
    data: {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      kind: input.kind,
      source: QuoteCheckpointSource.STAFF,
      sequence: nextSequence,
      schemaVersion: QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
      snapshotJson: snapshotWire as unknown as Prisma.InputJsonValue,
      staffOnlyJson: {
        anyLineUsesInternalDescriptionForTitle: staffOnly.anyLineUsesInternalDescriptionForTitle,
      } as Prisma.InputJsonValue,
      quoteUpdatedAtAtCapture: quote.updatedAt,
    },
  });
}

export async function seedQuoteSentWithCheckpoint(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    organizationName: string;
    quoteId: string;
    sentAt?: Date;
  },
) {
  await createCheckpoint(prisma, {
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    quoteId: input.quoteId,
    kind: QuoteCheckpointKind.SEND,
    expectedStatus: QuoteStatus.DRAFT,
  });

  const sentAt = input.sentAt ?? new Date();
  await prisma.quote.update({
    where: { id: input.quoteId },
    data: {
      status: QuoteStatus.SENT,
      lastSentEmailAt: sentAt,
    },
  });
}

export async function seedQuoteApprovedWithCheckpoint(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    organizationName: string;
    quoteId: string;
  },
) {
  await createCheckpoint(prisma, {
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    quoteId: input.quoteId,
    kind: QuoteCheckpointKind.APPROVAL,
    expectedStatus: QuoteStatus.SENT,
  });

  await prisma.quote.update({
    where: { id: input.quoteId },
    data: { status: QuoteStatus.APPROVED },
  });
}
