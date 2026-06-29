import assert from "node:assert/strict";
import test from "node:test";
import { PaymentScheduleAnchorType, QuoteStatus } from "@prisma/client";
import type { ExtendedTransactionClient } from "@/lib/db";
import type { NormalizedPaymentScheduleMilestone } from "@/lib/ai/quote-payment-schedule-ai-plan";
import {
  performApplyQuotePaymentScheduleInTx,
  QUOTE_PAYMENT_SCHEDULE_CHANGED_ERROR,
} from "./quote-payment-schedule-apply-core";

type ScheduleRow = {
  id: string;
  quoteId: string;
  title: string;
  amountCents: number | null;
  percentage: string | null;
  anchorType: PaymentScheduleAnchorType;
  anchorStageId: string | null;
  sortOrder: number;
};

function milestones(): NormalizedPaymentScheduleMilestone[] {
  return [
    {
      tempId: "m1",
      title: "Deposit",
      amountCents: null,
      percentage: "50.00",
      anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
      anchorStageId: null,
      sortOrder: 0,
    },
    {
      tempId: "m2",
      title: "Final Balance",
      amountCents: null,
      percentage: null,
      anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      anchorStageId: null,
      sortOrder: 1,
    },
  ];
}

function createMockTx(input?: { existingSchedule?: ScheduleRow[] }) {
  const schedules: ScheduleRow[] = [...(input?.existingSchedule ?? [])];
  let nextId = 1;
  let lockCount = 0;
  let lockUsedStatusFilter = false;

  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      lockCount += 1;
      lockUsedStatusFilter =
        strings.some((part) => part.includes('"status"')) ||
        values.some((value) => value === QuoteStatus.DRAFT);
      return [{ id: "quote-1" }];
    },
    quote: {
      findFirst: async () => ({
        id: "quote-1",
        leadId: "lead-1",
        status: QuoteStatus.DRAFT,
        paymentSchedule: schedules.map((row) => ({ id: row.id })),
      }),
    },
    paymentScheduleItem: {
      deleteMany: async ({ where }: { where: { quoteId: string } }) => {
        const before = schedules.length;
        for (let index = schedules.length - 1; index >= 0; index -= 1) {
          if (schedules[index].quoteId === where.quoteId) {
            schedules.splice(index, 1);
          }
        }
        return { count: before - schedules.length };
      },
      create: async ({ data }: { data: Omit<ScheduleRow, "id"> }) => {
        const row: ScheduleRow = {
          id: `schedule-${nextId++}`,
          ...data,
          percentage: data.percentage?.toString() ?? null,
        };
        schedules.push(row);
        return { id: row.id };
      },
    },
    _schedules: schedules,
    _lockCount: () => lockCount,
    _lockUsedStatusFilter: () => lockUsedStatusFilter,
  };

  return tx;
}

test("performApplyQuotePaymentScheduleInTx creates AI milestones once for an empty schedule", async () => {
  const tx = createMockTx();

  const result = await performApplyQuotePaymentScheduleInTx(
    tx as unknown as ExtendedTransactionClient,
    {
      quoteId: "quote-1",
      organizationId: "org-1",
      expectedExistingSchedule: false,
      milestones: milestones(),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(tx._lockCount(), 1);
  assert.equal(tx._lockUsedStatusFilter(), false);
  assert.equal(tx._schedules.length, 2);
  assert.deepEqual(
    tx._schedules.map((row) => row.title),
    ["Deposit", "Final Balance"],
  );
});

test("performApplyQuotePaymentScheduleInTx rejects a duplicate empty-schedule apply", async () => {
  const tx = createMockTx();
  const input = {
    quoteId: "quote-1",
    organizationId: "org-1",
    expectedExistingSchedule: false,
    milestones: milestones(),
  };

  const first = await performApplyQuotePaymentScheduleInTx(
    tx as unknown as ExtendedTransactionClient,
    input,
  );
  const second = await performApplyQuotePaymentScheduleInTx(
    tx as unknown as ExtendedTransactionClient,
    input,
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.equal(second.error, QUOTE_PAYMENT_SCHEDULE_CHANGED_ERROR);
  }
  assert.equal(tx._schedules.length, 2);
});

test("performApplyQuotePaymentScheduleInTx rejects stale apply when schedule changed", async () => {
  const tx = createMockTx({
    existingSchedule: [
      {
        id: "manual-1",
        quoteId: "quote-1",
        title: "Manual deposit",
        amountCents: 1_000_00,
        percentage: null,
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        anchorStageId: null,
        sortOrder: 0,
      },
    ],
  });

  const result = await performApplyQuotePaymentScheduleInTx(
    tx as unknown as ExtendedTransactionClient,
    {
      quoteId: "quote-1",
      organizationId: "org-1",
      expectedExistingSchedule: false,
      milestones: milestones(),
    },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, QUOTE_PAYMENT_SCHEDULE_CHANGED_ERROR);
  }
  assert.deepEqual(
    tx._schedules.map((row) => row.title),
    ["Manual deposit"],
  );
});

test("performApplyQuotePaymentScheduleInTx replaces existing schedule only when expected", async () => {
  const tx = createMockTx({
    existingSchedule: [
      {
        id: "manual-1",
        quoteId: "quote-1",
        title: "Manual deposit",
        amountCents: 1_000_00,
        percentage: null,
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        anchorStageId: null,
        sortOrder: 0,
      },
    ],
  });

  const result = await performApplyQuotePaymentScheduleInTx(
    tx as unknown as ExtendedTransactionClient,
    {
      quoteId: "quote-1",
      organizationId: "org-1",
      expectedExistingSchedule: true,
      milestones: milestones(),
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    tx._schedules.map((row) => row.title),
    ["Deposit", "Final Balance"],
  );
});
