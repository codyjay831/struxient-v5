import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  QUOTE_ACCEPTED_PROPOSAL_LABEL,
  QUOTE_ACCEPTED_RECORD_LINK_LABEL,
  QUOTE_ACCEPTANCE_RECORD_LABEL,
  QUOTE_COPY_SIGNING_LINK_LABEL,
  QUOTE_CUSTOMER_PROPOSAL_DRAFT_HELP,
  QUOTE_CUSTOMER_PROPOSAL_SEND_HELP,
  QUOTE_CUSTOMER_PROPOSAL_TAB_LABEL,
  QUOTE_DRAFT_PREVIEW_LINK_LABEL,
  QUOTE_SEND_FOR_ACCEPTANCE_LABEL,
  QUOTE_SENT_PROPOSAL_LABEL,
  QUOTE_SENT_RECORD_LINK_LABEL,
  QUOTE_STAFF_PREVIEW_PAGE_DESCRIPTION,
  QUOTE_STAFF_PREVIEW_PAGE_TITLE,
} from "./quote-customer-proposal-ux";

function src(path: string): string {
  return readFileSync(join(process.cwd(), "src", path), "utf8");
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function customerProposalDocumentSource(source: string): string {
  const start = source.indexOf("function CustomerProposalDocument");
  const end = source.indexOf("export default async function QuoteLiveProposalPreviewPage");
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test("quote customer proposal UX labels use truthful staff-facing names", () => {
  assert.equal(QUOTE_CUSTOMER_PROPOSAL_TAB_LABEL, "Customer Proposal");
  assert.equal(QUOTE_DRAFT_PREVIEW_LINK_LABEL, "Preview draft proposal");
  assert.equal(QUOTE_SEND_FOR_ACCEPTANCE_LABEL, "Send for acceptance");
  assert.equal(QUOTE_SENT_RECORD_LINK_LABEL, "View sent proposal");
  assert.equal(QUOTE_ACCEPTED_RECORD_LINK_LABEL, "View accepted proposal");
  assert.equal(QUOTE_COPY_SIGNING_LINK_LABEL, "Copy customer signing link");
  assert.equal(QUOTE_SENT_PROPOSAL_LABEL, "Sent Proposal");
  assert.equal(QUOTE_ACCEPTED_PROPOSAL_LABEL, "Accepted Proposal");
  assert.equal(QUOTE_ACCEPTANCE_RECORD_LABEL, "Acceptance record");
});

test("draft customer proposal copy does not imply approval exists", () => {
  assert.match(QUOTE_CUSTOMER_PROPOSAL_DRAFT_HELP, /send it for acceptance/i);
  assert.doesNotMatch(QUOTE_CUSTOMER_PROPOSAL_DRAFT_HELP, /approval/i);
  assert.match(QUOTE_CUSTOMER_PROPOSAL_SEND_HELP, /locks this proposal version/i);
});

test("quote work surface no longer exposes legacy public quote token as normal customer path", () => {
  const source = src("components/work-surfaces/quote-work-surface.tsx");
  assert.match(source, /Legacy proposal link hidden/);
  assert.doesNotMatch(source, /View customer proposal/);
  assert.doesNotMatch(source, /Preview proposal/);
  assert.doesNotMatch(source, /\$\{window\.location\.origin\}\/q\/\$\{quote\.shareToken\}/);
  assert.doesNotMatch(source, /label:\s*"Approval"/);
});

test("quote work surface shows one draft preview action and no staff-preview label", () => {
  const source = src("components/work-surfaces/quote-work-surface.tsx");
  assert.equal(countOccurrences(source, "QUOTE_DRAFT_PREVIEW_LINK_LABEL"), 2);
  assert.doesNotMatch(source, /Open staff preview/);
  assert.match(source, /QUOTE_SEND_FOR_ACCEPTANCE_LABEL/);
  assert.match(source, /href=\{quote\.proposalPreviewHref\}/);
});

test("quote work surface hides empty draft history until records exist", () => {
  const source = src("components/work-surfaces/quote-work-surface.tsx");
  assert.match(source, /hasProposalRecords\s*\?/);
  assert.match(source, /sendCheckpoints\.length > 0 \?/);
  assert.match(source, /approvalCheckpoints\.length > 0 \?/);
  assert.doesNotMatch(source, /<QuoteSignatureTimelinePanel[\s\S]*timeline=\{signatureTimeline\}[\s\S]*\/>\s*<details/);
});

test("quote work surface sent and accepted actions use frozen checkpoints", () => {
  const source = src("components/work-surfaces/quote-work-surface.tsx");
  assert.match(source, /QUOTE_SENT_RECORD_LINK_LABEL/);
  assert.match(source, /href=\{latestSend\.href\}/);
  assert.match(source, /QUOTE_ACCEPTED_RECORD_LINK_LABEL/);
  assert.match(source, /href=\{latestApproval\.href\}/);
  assert.match(source, /QUOTE_COPY_SIGNING_LINK_LABEL/);
  assert.doesNotMatch(source, /Customer Approval/);
});

test("staff preview page is clearly live internal preview, not customer record", () => {
  assert.equal(QUOTE_STAFF_PREVIEW_PAGE_TITLE, "Draft proposal preview");
  assert.equal(
    QUOTE_STAFF_PREVIEW_PAGE_DESCRIPTION,
    "Review the customer-facing proposal draft before sending.",
  );

  const source = src("app/(workspace)/quotes/[quoteId]/preview/page.tsx");
  assert.match(source, /QUOTE_STAFF_PREVIEW_PAGE_TITLE/);
  assert.match(source, /This preview reflects the current workspace quote\. It is not the sent customer record\./);
  assert.match(source, /StatusBadge label="Live draft"/);
  assert.match(source, /Generated from latest draft update:/);
  assert.match(source, /View sent proposal/);
  assert.match(source, /QuoteRecordSendCheckpointForm[\s\S]*layout="compact"/);
  assert.doesNotMatch(source, /Staff preview shell/);
  assert.doesNotMatch(source, /Stored on the quote row \(server\)/);
  assert.doesNotMatch(source, /Display names only/);
  assert.doesNotMatch(source, /Workspace status for staff/);
});

test("draft preview route keeps staff auth, org scoping, and customer projection boundary", () => {
  const source = src("app/(workspace)/quotes/[quoteId]/preview/page.tsx");
  assert.match(source, /getCommercialRequestContextOrNull/);
  assert.match(source, /organizationId:\s*ctx\.organizationId/);
  assert.match(source, /quoteSelectForLiveCustomerPreviewPage/);
  assert.match(source, /quoteRowToCustomerPreviewInput\(row,\s*ctx\.organizationId\)/);
  assert.match(source, /buildCustomerQuotePreviewDocument/);
  assert.match(source, /CustomerProposalDocument\(\{ document \}:\s*\{ document: QuoteCustomerPreviewDocument \}\)/);
});

test("customer proposal document omits staff and debug copy", () => {
  const source = src("app/(workspace)/quotes/[quoteId]/preview/page.tsx");
  const documentSource = customerProposalDocumentSource(source);

  for (const phrase of [
    "Staff workspace status",
    "Current workspace quote",
    "Stored on quote row",
    "Preview as-of",
    "Customer and lead details shown",
    "Sellable rows",
    "From workspace record",
    "Acceptance will lock this proposal version",
    "customer signing record",
  ]) {
    assert.doesNotMatch(documentSource, new RegExp(phrase));
  }
});

test("customer proposal document renders proposal essentials from safe document DTO", () => {
  const source = src("app/(workspace)/quotes/[quoteId]/preview/page.tsx");
  const documentSource = customerProposalDocumentSource(source);

  assert.match(documentSource, /document\.organizationDisplayName/);
  assert.match(documentSource, /document\.documentTitle/);
  assert.match(documentSource, /document\.customer/);
  assert.match(documentSource, /Scope of work/);
  assert.match(documentSource, /Payment terms/);
  assert.match(documentSource, /Subtotal/);
  assert.match(documentSource, /formatMoneyCents\(document\.totalCents\)/);
});

test("customer signer review does not expose internal acceptance brand", () => {
  const source = src("components/quotes/quote-signer-review.tsx");
  assert.match(source, /Accept electronically/);
  assert.match(source, /Secure electronic acceptance/);
  assert.doesNotMatch(source, /Standard Acceptance/);
});
