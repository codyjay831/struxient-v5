import assert from "node:assert/strict";
import test from "node:test";
import {
  parseQuoteCheckpointStaffOnly,
  parseQuoteSendCheckpointSnapshot,
  QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
} from "./quote-checkpoint-snapshot";

test("parseQuoteSendCheckpointSnapshot rejects unsupported schema versions", () => {
  const result = parseQuoteSendCheckpointSnapshot(999, { document: {} });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /Unsupported checkpoint snapshot schema version/i);
  }
});

test("parseQuoteSendCheckpointSnapshot accepts a minimal valid payload", () => {
  const result = parseQuoteSendCheckpointSnapshot(QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION, {
    document: {
      organizationDisplayName: "Acme Solar",
      quoteId: "quote-1",
      documentTitle: "Proposal",
      customer: null,
      lead: null,
      lineItems: [
        {
          id: "line-1",
          sortOrder: 0,
          lineTitle: "Install",
          presentationGroup: null,
          lineDetail: null,
          includedNotes: null,
          excludedNotes: null,
          quantityDisplay: "1",
          unitAmountCents: 10_000,
          lineTotalCents: 10_000,
        },
      ],
      paymentSchedule: [],
      subtotalCents: 10_000,
      totalCents: 10_000,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.document.quoteId, "quote-1");
    assert.equal(result.document.lineItems.length, 1);
  }
});

test("parseQuoteSendCheckpointSnapshot round-trips a payment schedule", () => {
  const result = parseQuoteSendCheckpointSnapshot(QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION, {
    document: {
      organizationDisplayName: "Acme Solar",
      quoteId: "quote-1",
      documentTitle: "Proposal",
      customer: null,
      lead: null,
      lineItems: [],
      paymentSchedule: [
        {
          id: "milestone-1",
          title: "Deposit",
          amountCents: 5000,
          anchorType: "UPON_APPROVAL",
          anchorStageName: null,
          sortOrder: 0,
        },
        {
          id: "milestone-2",
          title: "Final Balance",
          amountCents: 5000,
          anchorType: "FINAL_BALANCE",
          anchorStageName: null,
          sortOrder: 1,
        },
      ],
      subtotalCents: 10_000,
      totalCents: 10_000,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.document.paymentSchedule.length, 2);
    assert.equal(result.document.paymentSchedule[0].title, "Deposit");
    assert.equal(result.document.paymentSchedule[0].anchorType, "UPON_APPROVAL");
    assert.equal(result.document.paymentSchedule[1].title, "Final Balance");
    assert.equal(result.document.paymentSchedule[1].anchorType, "FINAL_BALANCE");
  }
});

test("parseQuoteCheckpointStaffOnly defaults missing staff-only payload safely", () => {
  assert.deepEqual(parseQuoteCheckpointStaffOnly(null), {
    anyLineUsesInternalDescriptionForTitle: false,
  });
});
