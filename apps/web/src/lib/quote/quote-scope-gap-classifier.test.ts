import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionResolutionTiming,
  QuoteScopeDecisionStatus,
} from "@prisma/client";
import {
  buildQuickScopeMissingInfoSourceRef,
  classifyQuickScopeMissingInfoGap,
  QUICK_SCOPE_MISSING_INFO_SOURCE_REF_TYPE,
} from "./quote-scope-gap-classifier";
import { buildQuoteSendBlockers } from "./quote-send-blockers";
import { QuoteStatus } from "@prisma/client";

test("classifyQuickScopeMissingInfoGap marks square footage as required commercial", () => {
  const result = classifyQuickScopeMissingInfoGap("Confirm total square feet to replace");
  assert.equal(result.quoteImpact, QuoteScopeDecisionQuoteImpact.REQUIRED);
  assert.equal(result.status, QuoteScopeDecisionStatus.OPEN);
  assert.equal(result.resolutionTiming, null);
});

test("classifyQuickScopeMissingInfoGap marks material choice as required commercial", () => {
  const result = classifyQuickScopeMissingInfoGap("Which flooring product did the customer choose?");
  assert.equal(result.quoteImpact, QuoteScopeDecisionQuoteImpact.REQUIRED);
  assert.equal(result.status, QuoteScopeDecisionStatus.OPEN);
});

test("classifyQuickScopeMissingInfoGap marks preferred timeline as execution deferred", () => {
  const result = classifyQuickScopeMissingInfoGap("Preferred project timeline after holidays");
  assert.equal(result.quoteImpact, QuoteScopeDecisionQuoteImpact.NONE);
  assert.equal(result.status, QuoteScopeDecisionStatus.DEFERRED);
  assert.equal(result.resolutionTiming, QuoteScopeDecisionResolutionTiming.EXECUTION);
});

test("classifyQuickScopeMissingInfoGap marks crew sequencing as execution deferred", () => {
  const result = classifyQuickScopeMissingInfoGap("Internal crew sequencing for rough-in");
  assert.equal(result.status, QuoteScopeDecisionStatus.DEFERRED);
  assert.equal(result.resolutionTiming, QuoteScopeDecisionResolutionTiming.EXECUTION);
});

test("buildQuickScopeMissingInfoSourceRef is stable for normalized text", () => {
  const a = buildQuickScopeMissingInfoSourceRef({
    parentRefId: "c1",
    missingInfoText: "Confirm 200A service size",
  });
  const b = buildQuickScopeMissingInfoSourceRef({
    parentRefId: "c1",
    missingInfoText: "  CONFIRM   200A   service size ",
  });
  assert.equal(a, b);
  assert.match(a, /^c1:/);
});

test("classified deferred gap does not block send via quote-send-blockers", () => {
  const classification = classifyQuickScopeMissingInfoGap("Preferred project timeline");
  const result = buildQuoteSendBlockers({
    status: QuoteStatus.DRAFT,
    lineItemCount: 1,
    serviceLocationId: "loc-1",
    paymentScheduleItemCount: 1,
    scopeDecisions: [
      {
        id: "gap-schedule",
        quoteLineItemId: "line-1",
        status: classification.status,
        quoteImpact: classification.quoteImpact,
        resolutionTiming: classification.resolutionTiming,
        title: "Preferred project timeline",
      },
    ],
  });
  assert.equal(result.canSend, true);
  assert.ok(result.warnings.some((w) => w.scopeDecisionId === "gap-schedule"));
});

test("classified required gap blocks send via quote-send-blockers", () => {
  const classification = classifyQuickScopeMissingInfoGap("Confirm existing service size");
  const result = buildQuoteSendBlockers({
    status: QuoteStatus.DRAFT,
    lineItemCount: 1,
    serviceLocationId: "loc-1",
    paymentScheduleItemCount: 1,
    scopeDecisions: [
      {
        id: "gap-req",
        quoteLineItemId: "line-1",
        status: classification.status,
        quoteImpact: classification.quoteImpact,
        resolutionTiming: classification.resolutionTiming,
        title: "Confirm existing service size",
      },
    ],
  });
  assert.equal(result.canSend, false);
  assert.ok(result.blockers.some((b) => b.code === "REQUIRED_SCOPE_GAP_OPEN"));
});

test("QUICK_SCOPE_MISSING_INFO_SOURCE_REF_TYPE is exported for apply metadata", () => {
  assert.equal(QUICK_SCOPE_MISSING_INFO_SOURCE_REF_TYPE, "quick_scope_missing_info");
});
