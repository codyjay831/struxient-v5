import assert from "node:assert/strict";
import test from "node:test";
import { resolveOpportunityActionHref } from "./opportunity-flow";
import {
  opportunityActionOpensQuoteTab,
  opportunityWorkspaceHref,
  parseOpportunityWorkspaceTab,
} from "./opportunity-tab-routing";

test("parseOpportunityWorkspaceTab defaults to review", () => {
  assert.equal(parseOpportunityWorkspaceTab(undefined), "review");
  assert.equal(parseOpportunityWorkspaceTab("quote"), "quote");
  assert.equal(parseOpportunityWorkspaceTab("nonsense"), "review");
});

test("opportunityWorkspaceHref builds tab URLs", () => {
  assert.equal(opportunityWorkspaceHref("lead-1", "review"), "/leads/lead-1?tab=review");
  assert.equal(opportunityWorkspaceHref("lead-1", "quote"), "/leads/lead-1?tab=quote");
  assert.equal(
    opportunityWorkspaceHref("lead-1", "quote", "commercial-send-acceptance"),
    "/leads/lead-1?tab=quote#commercial-send-acceptance",
  );
});

test("quote actions open the embedded quote tab in the opportunity workspace", () => {
  assert.equal(opportunityActionOpensQuoteTab("START_QUOTE"), true);
  assert.equal(opportunityActionOpensQuoteTab("OPEN_DRAFT_QUOTE"), true);
  assert.equal(opportunityActionOpensQuoteTab("SCHEDULE_SALES_VISIT"), false);

  assert.equal(
    resolveOpportunityActionHref(
      { kind: "OPEN_DRAFT_QUOTE", label: "Continue quote", targetQuoteId: "q-1" },
      { leadId: "lead-1" },
    ),
    "/leads/lead-1?tab=quote",
  );
  assert.equal(
    resolveOpportunityActionHref(
      { kind: "START_QUOTE", label: "Start quote", targetLeadId: "lead-1" },
      { leadId: "lead-1" },
    ),
    "/leads/lead-1?tab=quote",
  );
});

test("execution review stays on the full quote route", () => {
  assert.equal(
    resolveOpportunityActionHref(
      { kind: "OPEN_EXECUTION_REVIEW", label: "Execution review", targetQuoteId: "q-1" },
      { leadId: "lead-1" },
    ),
    "/quotes/q-1/execution-review",
  );
});
