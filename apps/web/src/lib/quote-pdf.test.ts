import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { QuoteCustomerPreviewDocument } from "./quote-customer-projection";
import { buildQuoteProposalPdfModel } from "./quote-pdf";

function sentProposalDocument(
  overrides: Partial<QuoteCustomerPreviewDocument> = {},
): QuoteCustomerPreviewDocument {
  return {
    organizationDisplayName: "Acme Roofing",
    quoteId: "quote-frozen-snapshot",
    documentTitle: "Roof Replacement Proposal",
    customer: { displayName: "Jordan Customer" },
    lead: { title: "Main House Roof" },
    lineItems: [
      {
        id: "line-1",
        sortOrder: 0,
        presentationGroup: "Roofing",
        lineTitle: "Remove Existing Roof",
        lineDetail: "Tear off existing shingles and inspect roof deck.",
        includedNotes: "Disposal and standard underlayment included.",
        excludedNotes: "Deck repair billed only if approved.",
        quantityDisplay: "1",
        unitAmountCents: 600_000,
        lineTotalCents: 600_000,
      },
      {
        id: "line-2",
        sortOrder: 1,
        presentationGroup: "Roofing",
        lineTitle: "Install Architectural Shingles",
        lineDetail: "Install selected architectural shingles.",
        includedNotes: null,
        excludedNotes: null,
        quantityDisplay: "1",
        unitAmountCents: 900_000,
        lineTotalCents: 900_000,
      },
    ],
    paymentSchedule: [
      {
        id: "payment-1",
        title: "Deposit",
        amountCents: 500_000,
        anchorType: "UPON_APPROVAL",
        anchorStageName: null,
        sortOrder: 0,
      },
      {
        id: "payment-2",
        title: "Final Balance",
        amountCents: 1_000_000,
        anchorType: "FINAL_BALANCE",
        anchorStageName: null,
        sortOrder: 1,
      },
    ],
    subtotalCents: 1_500_000,
    totalCents: 1_500_000,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-02T12:00:00.000Z"),
    ...overrides,
  };
}

test("buildQuoteProposalPdfModel includes payment schedule from frozen sent snapshot", () => {
  const model = buildQuoteProposalPdfModel(sentProposalDocument(), {
    generatedAt: new Date("2026-06-03T12:00:00.000Z"),
  });

  assert.equal(model.paymentSchedule.length, 2);
  assert.equal(model.paymentSchedule[0]?.title, "Deposit");
  assert.equal(model.paymentSchedule[0]?.anchorLabel, "Due upon proposal acceptance");
  assert.equal(model.paymentSchedule[0]?.amountLabel, "$5,000.00");
  assert.equal(model.paymentSchedule[1]?.anchorLabel, "Final balance upon completion");
  assert.equal(model.scheduledPaymentsTotalLabel, "$15,000.00");
});

test("buildQuoteProposalPdfModel includes prepared-for customer and project details", () => {
  const model = buildQuoteProposalPdfModel(sentProposalDocument());

  assert.equal(model.organizationDisplayName, "Acme Roofing");
  assert.equal(model.documentTitle, "Roof Replacement Proposal");
  assert.equal(model.customerName, "Jordan Customer");
  assert.equal(model.projectTitle, "Main House Roof");
});

test("buildQuoteProposalPdfModel includes scope line items, notes, subtotal, and total", () => {
  const model = buildQuoteProposalPdfModel(sentProposalDocument());

  assert.equal(model.lineItems.length, 2);
  assert.equal(model.lineItems[0]?.presentationGroup, "Roofing");
  assert.equal(model.lineItems[0]?.lineTitle, "Remove Existing Roof");
  assert.equal(
    model.lineItems[0]?.lineDetail,
    "Tear off existing shingles and inspect roof deck.",
  );
  assert.equal(
    model.lineItems[0]?.includedNotes,
    "Disposal and standard underlayment included.",
  );
  assert.equal(model.lineItems[0]?.lineTotalLabel, "$6,000.00");
  assert.equal(model.subtotalLabel, "$15,000.00");
  assert.equal(model.totalLabel, "$15,000.00");
});

test("sent PDF proposal model uses frozen document content rather than live quote row content", () => {
  const frozenDocument = sentProposalDocument({
    documentTitle: "Frozen Customer Proposal",
    customer: { displayName: "Frozen Customer" },
    totalCents: 12_345,
    subtotalCents: 12_345,
  });

  const model = buildQuoteProposalPdfModel(frozenDocument);

  assert.equal(model.documentTitle, "Frozen Customer Proposal");
  assert.equal(model.customerName, "Frozen Customer");
  assert.equal(model.totalLabel, "$123.45");
  assert.doesNotMatch(JSON.stringify(model), /Live Quote|Mutable Customer|quote row/i);
});

test("sent PDF artifact generation accepts frozen document input without reading live quote rows", () => {
  const artifactServiceSource = readFileSync(
    join(process.cwd(), "src/lib/quote-signature/artifact-service.ts"),
    "utf8",
  );
  const sentPdfFunction = artifactServiceSource.slice(
    artifactServiceSource.indexOf("export async function generateAndStoreSentPdf"),
    artifactServiceSource.indexOf("export async function generateAndStoreFinalPacket"),
  );

  assert.match(sentPdfFunction, /document: QuoteCustomerPreviewDocument/);
  assert.match(sentPdfFunction, /renderQuoteProposalPdf\(params\.document\)/);
  assert.doesNotMatch(sentPdfFunction, /quote\.find|paymentScheduleItem\.find|db\.quote/i);
});

test("customer signer sent-pdf route still downloads the stored SENT_PDF artifact", () => {
  const routeSource = readFileSync(
    join(process.cwd(), "src/app/q/sign/[recipientToken]/sent-pdf/route.ts"),
    "utf8",
  );

  assert.match(routeSource, /QuoteSignatureArtifactKind\.SENT_PDF/);
  assert.match(routeSource, /quoteSignatureArtifact\.findFirst/);
  assert.match(routeSource, /attachment\.fileName/);
  assert.doesNotMatch(routeSource, /renderQuoteProposalPdf|generateAndStoreSentPdf/);
});
