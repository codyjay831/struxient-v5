import assert from "node:assert/strict";
import test from "node:test";
import {
  patchSerializedLeadRowAfterQuoteStarted,
  shouldResetLeadWorkspaceState,
  type LeadGraduationActiveQuotePayload,
} from "./lead-graduation-lifecycle";

test("shouldResetLeadWorkspaceState only resets on id change", () => {
  assert.equal(shouldResetLeadWorkspaceState(null, "intake-a"), false);
  assert.equal(shouldResetLeadWorkspaceState("intake-a", "intake-a"), false);
  assert.equal(shouldResetLeadWorkspaceState("intake-a", "intake-b"), true);
});

test("patchSerializedLeadRowAfterQuoteStarted adds linked quote summary", () => {
  const row: Parameters<typeof patchSerializedLeadRowAfterQuoteStarted>[0] = {
    id: "intake-a",
    quotes: [],
    progressLabel: "Ready to build quote",
    progressDescription: "Customer is linked.",
    progressTone: "draft" as const,
    progressState: "READY_FOR_QUOTE",
    progressPrimaryAction: {
      href: "/leads/intake-a",
      label: "Build quote",
      opensQuoteTab: true,
      opensContactTab: false,
    },
    progressSecondaryAction: null,
    valueLabel: null,
  };

  const activeQuotePayload = {
    quote: {
      id: "quote-1",
      title: "Q-2026-001",
      primaryTitle: "Roof replacement",
      subtitle: null,
      status: "DRAFT",
      statusLabel: "Draft",
      statusTone: "draft",
      customerId: "customer-1",
      customerDisplayName: "Alex",
      customerHref: "/customers/customer-1",
      leadId: "intake-a",
      leadTitle: "Roof replacement",
      leadHref: "/leads/intake-a",
      totalCents: 120_000,
      subtotalCents: 120_000,
      lineItemCount: 0,
      activatedJobId: null,
      activatedJobStatus: null,
      quoteHref: "/quotes/quote-1",
      proposalPreviewHref: "/quotes/quote-1/preview",
      executionReviewHref: "/quotes/quote-1/execution-review",
      jobsiteAddressLine: null,
    },
    readiness: {
      state: "DRAFT_IN_PROGRESS",
      label: "Draft in progress",
      description: "Add line items.",
      badgeTone: "draft",
      primaryAction: null,
      secondaryAction: null,
      isTerminal: false,
    },
    workspaceTabs: {
      lineItems: [],
    },
  } as unknown as LeadGraduationActiveQuotePayload;

  const patched = patchSerializedLeadRowAfterQuoteStarted(row, {
    quoteId: "quote-1",
    activeQuotePayload,
  });

  assert.equal(patched.quotes.length, 1);
  assert.equal(patched.quotes[0]?.id, "quote-1");
  assert.equal(patched.progressState, "QUOTE_IN_PROGRESS");
  assert.equal(patched.progressLabel, "Quote draft in progress");
  assert.equal(patched.progressPrimaryAction?.opensQuoteTab, true);
  assert.equal(patched.valueLabel, "$1,200");
});
