import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQuoteLineExecutionPlanningContextFromLine,
  buildTemplateExecutionPlanningContext,
} from "./execution-planning-inputs";

test("buildQuoteLineExecutionPlanningContextFromLine merges quote line and quote context", () => {
  const context = buildQuoteLineExecutionPlanningContextFromLine({
    line: {
      internalNotes: "Route through attic.",
      customerScopeTitle: "Main panel upgrade",
      customerScopeDescription: "Upgrade existing main electrical panel.",
      customerIncludedNotes: "Permit and inspection included.",
      customerExcludedNotes: "Utility trenching excluded.",
      quote: {
        internalNotes: "Customer wants morning schedule.",
        lead: { notes: "Panel appears to be 100A." },
      },
    },
    userInstructions: "Use 200A replacement panel.",
    priorMissingContext: ["Confirm utility disconnect window"],
    sourceFlags: {
      includeSiteAccessSchedule: true,
      includeCustomerProposal: true,
      includeJobTechnicalDetails: true,
    },
  });

  assert.ok(context);
  assert.match(context!, /Customer scope title/i);
  assert.match(context!, /Customer included notes/i);
  assert.match(context!, /Quote internal notes/i);
  assert.match(context!, /Confirm utility disconnect window/i);
});

test("buildQuoteLineExecutionPlanningContextFromLine keeps job details off by default", () => {
  const context = buildQuoteLineExecutionPlanningContextFromLine({
    line: {
      internalNotes: "Line-specific details:\n- Existing Zinsco panel",
      quote: {
        internalNotes: "Locked side gate",
      },
    },
    userInstructions: "Plan clean execution.",
  });
  assert.ok(context);
  assert.match(context!, /User clarifications/i);
  assert.doesNotMatch(context!, /Zinsco/i);
  assert.doesNotMatch(context!, /Locked side gate/i);
});

test("buildTemplateExecutionPlanningContext returns merged blocks", () => {
  const context = buildTemplateExecutionPlanningContext(
    "Install whole-home surge protector.",
    "Customer prefers Eaton equipment.",
  );

  assert.ok(context);
  assert.match(context!, /Template scope/i);
  assert.match(context!, /User clarifications/i);
});

test("buildTemplateExecutionPlanningContext returns undefined when empty", () => {
  const context = buildTemplateExecutionPlanningContext("   ", " ");
  assert.equal(context, undefined);
});
