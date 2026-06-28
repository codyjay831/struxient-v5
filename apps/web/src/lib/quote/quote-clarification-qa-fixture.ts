/**
 * DB fixtures for quote clarification browser QA (Slices 1–3).
 * Requires DATABASE_URL and dev seed (dev-org-id).
 */
import {
  PaymentScheduleAnchorType,
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionSourceType,
  QuoteScopeDecisionStatus,
  QuoteStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { DEV_ORGANIZATION_ID } from "@/lib/dev-organization";
import {
  materializeQuoteLinesFromTemplates,
  type QuoteMaterializationDb,
} from "../../../prisma/seeds/seed-quote-materialization";

export const QA_CLARIFY_QUOTE_ID = "qa-clarify-browser-quote";
const QA_LEAD_ID = "qa-clarify-browser-lead";
const QA_CUSTOMER_ID = "dev-customer-patel";

const quoteMaterializationDb: QuoteMaterializationDb = {
  quoteLineItem: {
    deleteMany: (args) => db.quoteLineItem.deleteMany(args),
    create: (args) => db.quoteLineItem.create(args),
  },
  lineItemTemplate: {
    findUnique: (args) => db.lineItemTemplate.findUnique(args),
  },
  quoteLineExecutionTask: {
    createMany: (args) => db.quoteLineExecutionTask.createMany(args),
  },
  quote: {
    update: (args) => db.quote.update(args),
    upsert: (args) => db.quote.upsert(args),
  },
};

export const CLARIFY_SET_KEY = "electrical.service_upgrade";
export const CLARIFY_QUESTION_KEY = "electrical.service.new_service_size";
export const CLARIFY_SOURCE_REF = `${CLARIFY_SET_KEY}:${CLARIFY_QUESTION_KEY}`;

export type QuoteClarificationQaFixture = {
  quoteId: string;
  lineAId: string;
  lineBId: string;
  requiredGapId: string;
  deferredGapId: string;
  lineAGapId: string;
  quoteWideGapId: string;
};

async function requireDevServiceLocation(): Promise<string> {
  const serviceLocation = await db.customerServiceLocation.findFirst({
    where: { organizationId: DEV_ORGANIZATION_ID },
    select: { id: true },
  });
  if (!serviceLocation) {
    throw new Error("Dev org missing service location — run `npx prisma db seed`.");
  }
  return serviceLocation.id;
}

export async function cleanupQuoteClarificationQaFixture(): Promise<void> {
  await db.quoteScopeDecision.deleteMany({ where: { quoteId: QA_CLARIFY_QUOTE_ID } });
  await db.quoteLineClarification.deleteMany({
    where: { quoteLineItem: { quoteId: QA_CLARIFY_QUOTE_ID } },
  });
  await db.paymentScheduleItem.deleteMany({ where: { quoteId: QA_CLARIFY_QUOTE_ID } });
  await db.quoteLineExecutionTask.deleteMany({
    where: { quoteLineItem: { quoteId: QA_CLARIFY_QUOTE_ID } },
  });
  await db.quoteLineItem.deleteMany({ where: { quoteId: QA_CLARIFY_QUOTE_ID } });
  await db.quote.deleteMany({ where: { id: QA_CLARIFY_QUOTE_ID } });
  await db.lead.deleteMany({ where: { id: QA_LEAD_ID } });
}

export async function createQuoteClarificationQaFixture(): Promise<QuoteClarificationQaFixture> {
  await cleanupQuoteClarificationQaFixture();

  const serviceLocationId = await requireDevServiceLocation();

  await db.lead.upsert({
    where: { id: QA_LEAD_ID },
    update: {
      organizationId: DEV_ORGANIZATION_ID,
      customerId: QA_CUSTOMER_ID,
      serviceLocationId,
    },
    create: {
      id: QA_LEAD_ID,
      organizationId: DEV_ORGANIZATION_ID,
      customerId: QA_CUSTOMER_ID,
      serviceLocationId,
      status: "QUALIFIED",
      channel: "MANUAL",
      contact: { name: "QA Clarify Customer" },
      request: { type: "Panel upgrade QA" },
    },
  });

  await db.quote.create({
    data: {
      id: QA_CLARIFY_QUOTE_ID,
      organizationId: DEV_ORGANIZATION_ID,
      customerId: QA_CUSTOMER_ID,
      leadId: QA_LEAD_ID,
      serviceLocationId,
      title: "QA — Clarify scope browser fixture",
      customerDocumentTitle: "Proposal: QA clarify browser fixture",
      internalNotes: "[qa fixture] quote clarification browser QA",
      status: QuoteStatus.DRAFT,
      subtotalCents: 0,
      totalCents: 0,
    },
  });

  await materializeQuoteLinesFromTemplates(quoteMaterializationDb, {
    quoteId: QA_CLARIFY_QUOTE_ID,
    organizationId: DEV_ORGANIZATION_ID,
    lines: [
      { templateId: "dev-trade-electrical-service-panel-upgrade-200a" },
      { templateId: "dev-trade-electrical-recessed-lighting-circuit", quantityOverride: "4" },
    ],
  });

  const lines = await db.quoteLineItem.findMany({
    where: { quoteId: QA_CLARIFY_QUOTE_ID },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const lineAId = lines[0]?.id;
  const lineBId = lines[1]?.id;
  if (!lineAId || !lineBId) {
    throw new Error("QA fixture failed to materialize two quote lines.");
  }

  await db.paymentScheduleItem.create({
    data: {
      quoteId: QA_CLARIFY_QUOTE_ID,
      title: "Deposit",
      amountCents: 50_000,
      anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
      sortOrder: 0,
    },
  });

  const requiredGap = await db.quoteScopeDecision.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      quoteId: QA_CLARIFY_QUOTE_ID,
      quoteLineItemId: lineAId,
      sourceType: QuoteScopeDecisionSourceType.CLARIFICATION,
      title: "New service size",
      status: QuoteScopeDecisionStatus.OPEN,
      quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
      sourceRefType: "clarification_question",
      sourceRefId: CLARIFY_SOURCE_REF,
    },
    select: { id: true },
  });

  const deferredGap = await db.quoteScopeDecision.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      quoteId: QA_CLARIFY_QUOTE_ID,
      quoteLineItemId: lineAId,
      sourceType: QuoteScopeDecisionSourceType.MANUAL,
      title: "Deferred execution-only gap",
      status: QuoteScopeDecisionStatus.DEFERRED,
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
      resolutionTiming: "EXECUTION",
    },
    select: { id: true },
  });

  const lineAGap = await db.quoteScopeDecision.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      quoteId: QA_CLARIFY_QUOTE_ID,
      quoteLineItemId: lineAId,
      sourceType: QuoteScopeDecisionSourceType.MANUAL,
      title: "Roof pitch angle measurement required",
      status: QuoteScopeDecisionStatus.OPEN,
      quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
    },
    select: { id: true },
  });

  const quoteWideGap = await db.quoteScopeDecision.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      quoteId: QA_CLARIFY_QUOTE_ID,
      quoteLineItemId: null,
      sourceType: QuoteScopeDecisionSourceType.MANUAL,
      title: "Permit jurisdiction confirmation required",
      status: QuoteScopeDecisionStatus.OPEN,
      quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
    },
    select: { id: true },
  });

  return {
    quoteId: QA_CLARIFY_QUOTE_ID,
    lineAId,
    lineBId,
    requiredGapId: requiredGap.id,
    deferredGapId: deferredGap.id,
    lineAGapId: lineAGap.id,
    quoteWideGapId: quoteWideGap.id,
  };
}

export async function createBlockingLineGap(input: {
  quoteId: string;
  lineId: string;
  title: string;
  quoteImpact?: QuoteScopeDecisionQuoteImpact;
}): Promise<string> {
  const row = await db.quoteScopeDecision.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      quoteId: input.quoteId,
      quoteLineItemId: input.lineId,
      sourceType: QuoteScopeDecisionSourceType.MANUAL,
      title: input.title,
      status: QuoteScopeDecisionStatus.OPEN,
      quoteImpact: input.quoteImpact ?? QuoteScopeDecisionQuoteImpact.REQUIRED,
    },
    select: { id: true },
  });
  return row.id;
}

export async function readGapState(gapId: string) {
  return db.quoteScopeDecision.findUnique({
    where: { id: gapId },
    select: {
      id: true,
      status: true,
      resolvedByClarificationId: true,
      resolutionTiming: true,
    },
  });
}

export async function countOpenSendBlockingGaps(quoteId: string): Promise<number> {
  const rows = await db.quoteScopeDecision.findMany({
    where: { quoteId, status: QuoteScopeDecisionStatus.OPEN },
    select: { quoteImpact: true },
  });
  return rows.filter(
    (row) =>
      row.quoteImpact === QuoteScopeDecisionQuoteImpact.REQUIRED ||
      row.quoteImpact === QuoteScopeDecisionQuoteImpact.POSSIBLE,
  ).length;
}
