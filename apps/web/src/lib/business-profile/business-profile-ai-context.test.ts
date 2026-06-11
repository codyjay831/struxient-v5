import assert from "node:assert/strict";
import test from "node:test";
import {
  BusinessProfileCustomerMarket,
  BusinessProfileOperatingModel,
  BusinessProfileTrade,
  BusinessProfileWorkType,
} from "@prisma/client";
import {
  appendBusinessProfileContext,
  selectBusinessProfileAiContext,
} from "./business-profile-ai-context";

const profile = {
  trades: [BusinessProfileTrade.ELECTRICAL, BusinessProfileTrade.OTHER],
  workTypes: [BusinessProfileWorkType.SERVICE_REPAIR],
  customerMarkets: [BusinessProfileCustomerMarket.OTHER],
  operatingModel: BusinessProfileOperatingModel.OWNER_OPERATOR,
  teamSize: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedByUserId: null,
};

test("selectBusinessProfileAiContext filters OTHER values from rendered context", () => {
  const selected = selectBusinessProfileAiContext("QUOTE_SCOPE_SUGGESTIONS", profile);
  assert.ok(selected);
  assert.deepEqual(selected?.fields.trades, [BusinessProfileTrade.ELECTRICAL]);
  assert.equal(selected?.fields.customerMarkets, undefined);
});

test("appendBusinessProfileContext appends provenance section when available", () => {
  const selected = selectBusinessProfileAiContext("QUOTE_LINE_EXECUTION_PLANNING", profile);
  const merged = appendBusinessProfileContext("Base context", selected);
  assert.ok(merged);
  assert.match(merged!, /Base context/);
  assert.match(merged!, /provenance: ORGANIZATION_DEFAULT/);
});

