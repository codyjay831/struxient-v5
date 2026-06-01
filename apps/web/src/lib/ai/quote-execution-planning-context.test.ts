import assert from "node:assert/strict";
import test from "node:test";
import { buildQuoteExecutionPlanningContext } from "./quote-execution-planning-context";

test("buildQuoteExecutionPlanningContext combines core context sources", () => {
  const context = buildQuoteExecutionPlanningContext({
    userInstructions: "Use attic route, 60A breaker.",
    lineInternalNotes: "Customer insists on NEMA receptacle.",
    quoteInternalNotes: "Permit lead time is usually 2 weeks.",
    leadNotes:
      "[Public Intake Form]\nService / project location: Garage wall\nPreferred timing: ASAP\nRequest type: EV charger",
  });

  assert.ok(context);
  assert.match(context!, /User clarifications/i);
  assert.match(context!, /Line internal notes/i);
  assert.match(context!, /Quote internal notes/i);
  assert.match(context!, /Lead intake context/i);
});

test("buildQuoteExecutionPlanningContext includes prior missing context hints", () => {
  const context = buildQuoteExecutionPlanningContext({
    userInstructions: "Panel has 200A service.",
    priorMissingContext: [
      "Confirm panel capacity",
      "Confirm panel capacity",
      "Provide charger model",
    ],
  });

  assert.ok(context);
  assert.match(context!, /Previously flagged missing context/i);
  assert.match(context!, /Confirm panel capacity/);
  assert.match(context!, /Provide charger model/);
});

test("buildQuoteExecutionPlanningContext returns undefined for empty payload", () => {
  const context = buildQuoteExecutionPlanningContext({
    userInstructions: "   ",
    lineInternalNotes: null,
    quoteInternalNotes: "",
    leadNotes: undefined,
    priorMissingContext: [],
  });

  assert.equal(context, undefined);
});

