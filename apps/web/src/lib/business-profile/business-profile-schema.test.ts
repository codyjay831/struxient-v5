import assert from "node:assert/strict";
import test from "node:test";
import { BusinessProfileTrade, BusinessProfileWorkType } from "@prisma/client";
import {
  hasAnyBusinessProfileAnswer,
  normalizeBusinessProfileValues,
} from "./business-profile-schema";

test("normalizeBusinessProfileValues deduplicates multi-select values", () => {
  const result = normalizeBusinessProfileValues({
    trades: [BusinessProfileTrade.ELECTRICAL, BusinessProfileTrade.ELECTRICAL],
    workTypes: [BusinessProfileWorkType.REPLACEMENT, BusinessProfileWorkType.REPLACEMENT],
    customerMarkets: [],
    operatingModel: null,
    teamSize: null,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.values.trades, [BusinessProfileTrade.ELECTRICAL]);
  assert.deepEqual(result.values.workTypes, [BusinessProfileWorkType.REPLACEMENT]);
});

test("hasAnyBusinessProfileAnswer returns false for fully empty values", () => {
  const result = normalizeBusinessProfileValues({
    trades: [],
    workTypes: [],
    customerMarkets: [],
    operatingModel: null,
    teamSize: null,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(hasAnyBusinessProfileAnswer(result.values), false);
});

