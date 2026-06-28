import assert from "node:assert/strict";
import test from "node:test";
import { deriveQuoteWorkstationCopy } from "./quote-workstation-copy";

const baseInput = {
  baseStatus: "APPROVED",
  baseReason: "Needs attention.",
  baseNextStep: "Activate job",
  isApprovedQuoteHandoff: false,
  isCustomerAccepted: false,
  openChangeRequest: null,
  openSalesVisit: null,
} as const;

test("approved quote ready for activation preserves approved-handoff reason", () => {
  const result = deriveQuoteWorkstationCopy({
    ...baseInput,
    isApprovedQuoteHandoff: true,
    baseNextStep: "Activate job",
  });

  assert.equal(result.status, "APPROVED");
  assert.equal(result.reason, "Approved quote is waiting for job setup.");
  assert.equal(result.nextStep, "Activate job");
});

test("approved quote missing execution plan preserves approved-handoff reason", () => {
  const result = deriveQuoteWorkstationCopy({
    ...baseInput,
    isApprovedQuoteHandoff: true,
    baseNextStep: "Build execution plan",
  });

  assert.equal(result.status, "APPROVED");
  assert.equal(result.reason, "Approved quote is waiting for job setup.");
  assert.equal(result.nextStep, "Build execution plan");
});

test("approved quote stale or invalid execution plan preserves same copy", () => {
  const result = deriveQuoteWorkstationCopy({
    ...baseInput,
    isApprovedQuoteHandoff: true,
    baseNextStep: "Build execution plan",
  });

  assert.equal(result.status, "APPROVED");
  assert.equal(result.reason, "Approved quote is waiting for job setup.");
  assert.equal(result.nextStep, "Build execution plan");
});

test("sent waiting quote preserves base copy", () => {
  const result = deriveQuoteWorkstationCopy({
    ...baseInput,
    baseStatus: "SENT",
    baseReason: "Needs attention.",
    baseNextStep: "Mark approved",
  });

  assert.equal(result.status, "SENT");
  assert.equal(result.reason, "Needs attention.");
  assert.equal(result.nextStep, "Mark approved");
});

test("customer requested changes overlay copy is preserved", () => {
  const result = deriveQuoteWorkstationCopy({
    ...baseInput,
    baseStatus: "SENT",
    openChangeRequest: {
      requiresVisit: true,
      hasDraftRevision: false,
      draftRevisionHasLineItems: false,
    },
  });

  assert.equal(result.status, "Customer requested changes");
  assert.equal(
    result.reason,
    "Customer requested changes and follow-up visit may be required.",
  );
  assert.equal(result.nextStep, "Create revision draft.");
});

test("revision overlay copy is preserved", () => {
  const inProgress = deriveQuoteWorkstationCopy({
    ...baseInput,
    baseStatus: "SENT",
    openChangeRequest: {
      requiresVisit: false,
      hasDraftRevision: true,
      draftRevisionHasLineItems: false,
    },
  });
  assert.equal(inProgress.status, "Revision draft in progress");
  assert.equal(inProgress.reason, "Customer requested changes on this quote.");
  assert.equal(inProgress.nextStep, "Continue revision draft.");

  const ready = deriveQuoteWorkstationCopy({
    ...baseInput,
    baseStatus: "SENT",
    openChangeRequest: {
      requiresVisit: false,
      hasDraftRevision: true,
      draftRevisionHasLineItems: true,
    },
  });
  assert.equal(ready.status, "Revision ready to send");
  assert.equal(ready.reason, "Customer requested changes on this quote.");
  assert.equal(ready.nextStep, "Continue revision draft.");
});

test("site visit requested overlay copy is preserved", () => {
  const result = deriveQuoteWorkstationCopy({
    ...baseInput,
    baseStatus: "SENT",
    openSalesVisit: {
      isPending: true,
      dateLabel: "6/28/2026",
    },
  });

  assert.equal(result.status, "Site visit requested");
  assert.equal(result.reason, "Site visit requested for 6/28/2026.");
  assert.equal(result.nextStep, "Schedule site visit.");
});

test("site visit scheduled overlay copy is preserved", () => {
  const result = deriveQuoteWorkstationCopy({
    ...baseInput,
    baseStatus: "APPROVED",
    openSalesVisit: {
      isPending: false,
      dateLabel: "7/1/2026",
    },
  });

  assert.equal(result.status, "Site visit scheduled");
  assert.equal(result.reason, "Site visit scheduled for 7/1/2026.");
  assert.equal(result.nextStep, "Complete site visit.");
});

test("customer accepted portal copy is preserved when no higher overlays apply", () => {
  const result = deriveQuoteWorkstationCopy({
    ...baseInput,
    baseStatus: "SENT",
    baseNextStep: "Mark approved",
    isCustomerAccepted: true,
  });

  assert.equal(result.status, "SENT");
  assert.equal(result.reason, "Accepted by customer via portal.");
  assert.equal(result.nextStep, "Mark approved");
});
