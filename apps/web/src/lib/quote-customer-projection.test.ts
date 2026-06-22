import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomerPreviewPaymentSchedule,
  buildCustomerQuotePreviewDocument,
  type QuoteCustomerPreviewInput,
} from "./quote-customer-projection";

function baseQuoteInput(
  overrides: Partial<QuoteCustomerPreviewInput> = {},
): QuoteCustomerPreviewInput {
  return {
    id: "quote-1",
    title: "Deck Project",
    customerDocumentTitle: null,
    customer: { displayName: "Test Customer" },
    lead: null,
    lineItems: [
      {
        id: "line-1",
        sortOrder: 0,
        description: "Deck",
        customerScopeTitle: "Your New Back Deck",
        customerScopeDescription: null,
        customerIncludedNotes: null,
        customerExcludedNotes: null,
        customerPresentationGroup: null,
        quantityDisplay: "1",
        unitAmountCents: 1_500_000,
        lineTotalCents: 1_500_000,
      },
    ],
    paymentSchedule: [],
    subtotalCents: 1_500_000,
    totalCents: 1_500_000,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

test("buildCustomerPreviewPaymentSchedule materializes percentage milestones", () => {
  const schedule = buildCustomerPreviewPaymentSchedule(
    [
      {
        id: "dep",
        title: "Deposit for New Deck Project",
        amountCents: null,
        percentage: "30",
        anchorType: "UPON_APPROVAL",
        anchorStageId: null,
        anchorStageName: null,
        sortOrder: 0,
      },
      {
        id: "prog",
        title: "Progress Payment After Deck Installation",
        amountCents: null,
        percentage: "40",
        anchorType: "AFTER_STAGE",
        anchorStageId: "stage-1",
        anchorStageName: "Deck Installation",
        sortOrder: 1,
      },
      {
        id: "final",
        title: "Final Balance Upon Project Completion",
        amountCents: null,
        percentage: null,
        anchorType: "FINAL_BALANCE",
        anchorStageId: null,
        anchorStageName: null,
        sortOrder: 2,
      },
    ],
    1_500_000,
  );

  assert.equal(schedule[0]?.amountCents, 450_000);
  assert.equal(schedule[1]?.amountCents, 600_000);
  assert.equal(schedule[2]?.amountCents, 450_000);
  assert.equal(
    schedule.reduce((sum, item) => sum + item.amountCents, 0),
    1_500_000,
  );
});

test("buildCustomerQuotePreviewDocument uses materialized payment schedule", () => {
  const { document } = buildCustomerQuotePreviewDocument(
    baseQuoteInput({
      paymentSchedule: [
        {
          id: "dep",
          title: "Deposit",
          amountCents: null,
          percentage: "30",
          anchorType: "UPON_APPROVAL",
          anchorStageId: null,
          anchorStageName: null,
          sortOrder: 0,
        },
        {
          id: "final",
          title: "Final balance",
          amountCents: null,
          percentage: null,
          anchorType: "FINAL_BALANCE",
          anchorStageId: null,
          anchorStageName: null,
          sortOrder: 1,
        },
      ],
    }),
    { organizationDisplayName: "Struxient Demo" },
  );

  assert.equal(document.paymentSchedule[0]?.amountCents, 450_000);
  assert.equal(document.paymentSchedule[1]?.amountCents, 1_050_000);
});
