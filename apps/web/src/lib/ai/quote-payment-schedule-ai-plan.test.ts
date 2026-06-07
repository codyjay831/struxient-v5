import assert from "node:assert/strict";
import test from "node:test";
import { PaymentScheduleAnchorType } from "@prisma/client";
import {
  normalizeQuotePaymentScheduleProposal,
  validateQuotePaymentScheduleForApply,
} from "./quote-payment-schedule-ai-plan";
import type { QuotePaymentScheduleProposal } from "./quote-payment-schedule-proposal-schema";

const stages = [
  { id: "stage-prep", name: "Preparation" },
  { id: "stage-field", name: "Field Work" },
  { id: "stage-close", name: "Closeout" },
];

function baseProposal(
  milestones: QuotePaymentScheduleProposal["milestones"],
): QuotePaymentScheduleProposal {
  return {
    quoteId: "quote-1",
    scheduleRationale: "Standard deposit + progress + final",
    assumptions: [],
    warnings: [],
    missingInfo: [],
    milestones,
  };
}

test("normalizeQuotePaymentScheduleProposal maps stage names to ids", () => {
  const result = normalizeQuotePaymentScheduleProposal(
    baseProposal([
      {
        tempId: "m1",
        title: "Deposit",
        percentage: "30",
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        anchorStageName: null,
      },
      {
        tempId: "m2",
        title: "Progress",
        percentage: "40",
        anchorType: PaymentScheduleAnchorType.AFTER_STAGE,
        anchorStageName: "Field Work",
      },
      {
        tempId: "m3",
        title: "Final",
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
        anchorStageName: null,
      },
    ]),
    stages,
    10_000_00,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.milestones[1]?.anchorStageId, "stage-field");
});

test("normalizeQuotePaymentScheduleProposal rejects schedule exceeding quote total", () => {
  const result = normalizeQuotePaymentScheduleProposal(
    baseProposal([
      {
        tempId: "m1",
        title: "Deposit",
        amountCents: 8_000_00,
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
      },
      {
        tempId: "m2",
        title: "Progress",
        amountCents: 5_000_00,
        anchorType: PaymentScheduleAnchorType.AFTER_STAGE,
        anchorStageName: "Field Work",
      },
    ]),
    stages,
    10_000_00,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /exceed/i);
});

test("validateQuotePaymentScheduleForApply requires replace confirmation", () => {
  const proposal = baseProposal([
    {
      tempId: "m1",
      title: "Deposit",
      percentage: "50",
      anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
    },
    {
      tempId: "m2",
      title: "Final",
      anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
    },
  ]);

  const result = validateQuotePaymentScheduleForApply(
    proposal,
    { selectedMilestoneTempIds: ["m1", "m2"], replaceConfirmed: false },
    stages,
    10_000_00,
    true,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Replace existing schedule/i);
});

test("validateQuotePaymentScheduleForApply accepts selected milestones", () => {
  const proposal = baseProposal([
    {
      tempId: "m1",
      title: "Deposit",
      percentage: "50",
      anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
    },
    {
      tempId: "m2",
      title: "Final",
      anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
    },
  ]);

  const result = validateQuotePaymentScheduleForApply(
    proposal,
    { selectedMilestoneTempIds: ["m1", "m2"], replaceConfirmed: true },
    stages,
    10_000_00,
    true,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.milestones.length, 2);
});
