import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQuoteExecutionPlanningContext,
  buildQuoteExecutionPlanningContextFromManifest,
  buildQuoteExecutionPlanningContextManifest,
} from "./quote-execution-planning-context";

test("buildQuoteExecutionPlanningContext combines core context sources", () => {
  const context = buildQuoteExecutionPlanningContext({
    userInstructions: "Use attic route, 60A breaker.",
    lineInternalNotes: "Customer insists on NEMA receptacle.",
    customerScopeTitle: "EV charger installation",
    customerScopeDescription: "Install a Level 2 EV charger in the garage.",
    customerIncludedNotes: "Permit coordination included.",
    customerExcludedNotes: "Utility trenching excluded unless needed.",
    quoteInternalNotes: "Permit lead time is usually 2 weeks.",
    leadNotes:
      "[Public Intake Form]\nService / project location: Garage wall\nPreferred timing: ASAP\nRequest type: EV charger",
  });

  assert.ok(context);
  assert.match(context!, /User clarifications/i);
  assert.doesNotMatch(context!, /Line internal notes/i);
  assert.match(context!, /Customer scope title/i);
  assert.match(context!, /Customer scope description/i);
  assert.doesNotMatch(context!, /Customer included notes/i);
  assert.doesNotMatch(context!, /Customer excluded notes/i);
  assert.doesNotMatch(context!, /Quote internal notes/i);
  assert.doesNotMatch(context!, /Lead intake context/i);
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

test("context manifest classifies internal notes sections with defaults", () => {
  const manifest = buildQuoteExecutionPlanningContextManifest({
    lineInternalNotes:
      "Line-specific details:\n- Existing panel is Zinsco\n\nExecution planning notes:\n- Coordinate utility release\n\nMissing info (this line):\n- Confirm amperage",
  });
  const planning = manifest.items.find((item) => item.label === "Execution planning notes");
  const lineDetails = manifest.items.find((item) => item.label === "Line-specific details");
  const missing = manifest.items.find((item) => item.label === "Missing info (this line)");
  assert.equal(planning?.bucket, "reusable_execution_guidance");
  assert.equal(planning?.includedByDefault, true);
  assert.equal(lineDetails?.bucket, "job_technical_detail");
  assert.equal(lineDetails?.includedByDefault, false);
  assert.equal(missing?.bucket, "job_technical_detail");
});

test("context rendering excludes site/access by default but can opt in", () => {
  const manifest = buildQuoteExecutionPlanningContextManifest({
    userInstructions: "Use attic route.",
    quoteInternalNotes: "Locked gate at side yard.",
    leadNotes: "[Public Intake Form]\nPreferred timing: After 3 PM",
  });
  const defaultContext = buildQuoteExecutionPlanningContextFromManifest(manifest);
  assert.ok(defaultContext);
  assert.match(defaultContext!, /User clarifications/i);
  assert.doesNotMatch(defaultContext!, /Locked gate/i);
  assert.doesNotMatch(defaultContext!, /After 3 PM/i);

  const withSiteContext = buildQuoteExecutionPlanningContextFromManifest(manifest, {
    sourceFlags: { includeSiteAccessSchedule: true },
  });
  assert.ok(withSiteContext);
  assert.match(withSiteContext!, /Locked gate/i);
  assert.match(withSiteContext!, /After 3 PM/i);
});

test("context item override can force include logistics detail", () => {
  const manifest = buildQuoteExecutionPlanningContextManifest({
    quoteInternalNotes: "Dog in yard.",
  });
  const item = manifest.items.find((entry) => entry.label === "Quote internal notes");
  assert.ok(item);
  const context = buildQuoteExecutionPlanningContextFromManifest(manifest, {
    itemOverrides: {
      [item!.id]: { include: true },
    },
  });
  assert.match(context ?? "", /Dog in yard/i);
});

test("buildQuoteExecutionPlanningContext returns undefined for empty payload", () => {
  const context = buildQuoteExecutionPlanningContext({
    userInstructions: "   ",
    lineInternalNotes: null,
    customerScopeTitle: " ",
    customerScopeDescription: "",
    customerIncludedNotes: undefined,
    customerExcludedNotes: null,
    quoteInternalNotes: "",
    leadNotes: undefined,
    priorMissingContext: [],
  });

  assert.equal(context, undefined);
});

