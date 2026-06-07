import assert from "node:assert/strict";
import test from "node:test";
import { AIService } from "./ai-service";

test("execution prompt uses execution-gate planning posture", () => {
  const prompt = AIService.buildContractorRealismPromptForTest(
    {
      organizationId: "org-1",
      templateId: "tpl-1",
      description: "200A panel upgrade",
      tags: ["electrical", "panel"],
      existingStages: [{ id: "s1", name: "Inspection" }, { id: "s2", name: "Closeout" }],
      existingSignals: ["permit-approved"],
      organizationName: "Acme Electric",
    },
    [{ id: "s1", name: "Inspection" }, { id: "s2", name: "Closeout" }],
    [],
  );

  // Identity + posture
  assert.match(prompt, /Struxient's contractor execution planner/i);
  assert.match(prompt, /smallest useful starter execution plan/i);
  assert.match(prompt, /This is NOT a full construction schedule/i);

  // Core decision frameworks
  assert.match(prompt, /TASK EXISTENCE TEST/);
  assert.match(prompt, /EXECUTION GATE RULE/);
  assert.match(prompt, /TECHNICAL DETAIL RULE/);
  assert.match(prompt, /TASK COUNT RULE/);
  assert.match(prompt, /For simple single-trade scopes, target 5-8 tasks/i);

  // Forbidden filler
  assert.match(prompt, /FORBIDDEN DEFAULT TASKS/);
  assert.match(prompt, /Project Closeout/);
  assert.match(prompt, /Collect Payment/);

  // Inspection vs scheduling discipline
  assert.match(prompt, /Do not use category SCHEDULING for AHJ inspection scheduling/i);
  assert.match(prompt, /INSPECTION scheduling\/request = OFFICE/);
  assert.match(prompt, /INSPECTION attendance\/result = FIELD/);

  // Payment + assumption safety
  assert.match(prompt, /PAYMENT RULE/);
  assert.match(prompt, /Do not list the same unresolved issue in both assumptions and missingContext/i);

  // Stage discipline
  assert.match(prompt, /Never use category names as stageName/i);
  assert.match(prompt, /"Scheduling" is not a stage/i);

  // Signal format + confidence + output style
  assert.match(prompt, /lowercase dot-key format/i);
  assert.match(prompt, /permit\.approved/);
  assert.match(prompt, /Never use confidence 1\.0/i);
  assert.match(prompt, /Use one-sentence reasoning per task/i);
  assert.match(prompt, /Keep resources minimal/i);

  // Schema preserved
  assert.match(prompt, /"providesSignals": \["string"\]/);
  assert.match(prompt, /"checklist": \[\{"label": "string"\}\]/);
});

test("payment schedule prompt uses industry default deposit progress final posture", () => {
  const prompt = AIService.buildPaymentSchedulePromptForTest({
    quoteId: "quote-1",
    quoteTotalCents: 10_000_00,
    contextText: "Main panel upgrade with field work and closeout stages.",
    allowedStages: [
      { id: "s1", name: "Preparation" },
      { id: "s2", name: "Field Work" },
    ],
    organizationName: "Acme Electric",
    userInstructions: "50% deposit",
  });

  assert.match(prompt, /contractor payment schedule assistant/i);
  assert.match(prompt, /INDUSTRY DEFAULT/i);
  assert.match(prompt, /UPON_APPROVAL/);
  assert.match(prompt, /AFTER_STAGE/);
  assert.match(prompt, /FINAL_BALANCE/);
  assert.match(prompt, /prefer percentages/i);
  assert.match(prompt, /Do NOT create one milestone per line item/i);
  assert.match(prompt, /NOT execution tasks/i);
  assert.match(prompt, /50% deposit/);
  assert.match(prompt, /"milestones": \[/);
});
