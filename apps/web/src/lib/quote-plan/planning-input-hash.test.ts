import assert from "node:assert/strict";
import test from "node:test";
import { computeQuotePlanningInputHash, quotePlanIsStale } from "@/lib/quote-plan/planning-input-hash";
import type { QuotePlanCriticalContext } from "@/lib/quote-plan/quote-plan-context";

function makeInput(): QuotePlanCriticalContext {
  return {
    quoteId: "q1",
    organizationId: "org1",
    quoteStatus: "APPROVED",
    lines: [
      {
        id: "l1",
        sortOrder: 0,
        description: "Solar install",
        quantity: "1",
        unitAmountCents: 100,
        executionRelevant: true,
        clarifications: [
          {
            questionSetKey: "roof",
            questionSetVersion: 1,
            answersJson: { pitch: "medium" },
          },
        ],
      },
    ],
    serviceLocation: {
      detailsStatus: "USER_REVIEWED",
      apn: "123-456-789",
      utilityName: "PG&E",
      jurisdictionName: "San Jose",
    },
    businessProfile: {
      trades: ["SOLAR"],
      workTypes: ["INSTALLATION"],
      customerMarkets: ["RESIDENTIAL"],
      operatingModel: "EMPLOYEES",
      teamSize: "SIX_TO_FIFTEEN",
    },
  };
}

test("computeQuotePlanningInputHash is deterministic for equal semantic inputs", () => {
  const a = makeInput();
  const b = makeInput();
  b.lines[0]!.clarifications[0]!.answersJson = { pitch: "medium" };
  assert.equal(computeQuotePlanningInputHash(a, 1), computeQuotePlanningInputHash(b, 1));
});

test("quotePlanIsStale compares accepted and current hashes", () => {
  const hash = computeQuotePlanningInputHash(makeInput(), 1);
  assert.equal(
    quotePlanIsStale({
      acceptedPlanningInputHash: hash,
      currentPlanningInputHash: hash,
    }),
    false,
  );
  assert.equal(
    quotePlanIsStale({
      acceptedPlanningInputHash: hash,
      currentPlanningInputHash: `${hash}-changed`,
    }),
    true,
  );
});

test("computeQuotePlanningInputHash changes when clarification answers change", () => {
  const base = makeInput();
  const updated = makeInput();
  updated.lines[0]!.clarifications[0]!.answersJson = { pitch: "steep" };
  assert.notEqual(computeQuotePlanningInputHash(base, 1), computeQuotePlanningInputHash(updated, 1));
});

