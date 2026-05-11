import assert from "node:assert/strict";
import test from "node:test";
import { QuoteStatus } from "@prisma/client";
import { quoteAllowsQuoteLineExecutionPlanning } from "./quote-status-workflow";

test("quoteAllowsQuoteLineExecutionPlanning blocks edits after activation", () => {
  assert.equal(
    quoteAllowsQuoteLineExecutionPlanning(QuoteStatus.APPROVED, true),
    false,
  );
});

test("quoteAllowsQuoteLineExecutionPlanning allows approved planning before activation", () => {
  assert.equal(
    quoteAllowsQuoteLineExecutionPlanning(QuoteStatus.APPROVED, false),
    true,
  );
});
